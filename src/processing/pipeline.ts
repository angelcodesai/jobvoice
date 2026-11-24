import { FunctionsHttpError } from '@supabase/supabase-js';
import { readAudio, deleteAudio } from './audio-file';
import { getSupabase, ensureSignedIn } from '../supabase';
import { parseExtraction } from '../extraction/schema';
import { extractionToJob } from '../extraction/toJob';
import { saveJobWithItems } from '../db/jobs';
import { pushJob } from '../sync';
import { vertical } from '../verticals';
import { getCachedPro } from '../monetization/purchases';
import { mapQuotaError } from '../monetization/quota-errors';
import { Job, LineItem } from '../types';

export type PipelineResult =
  | { ok: true; job: Job; items: LineItem[] }
  | { ok: false; error: string; retryable: boolean; needsUpgrade?: boolean };

/**
 * `functions.invoke` returns already-parsed JSON for JSON responses in
 * supabase-js v2, but be defensive: if we get a raw string, parse it.
 */
function normalizeInvokeData(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data; // let zod reject it with a useful error
    }
  }
  return data;
}

/**
 * Upload the audio, run extraction, persist the job locally.
 *
 * The local audio file is kept on ANY failure so the user can retry;
 * it is deleted only after the job has been saved successfully.
 *
 * Caller must not run two invocations for the same jobId concurrently
 * (disable retry while in flight).
 */
export async function processVoiceNote(
  jobId: string,
  audioUri: string
): Promise<PipelineResult> {
  try {
    const userId = await ensureSignedIn();

    // Platform-aware read: native recordings are m4a (expo-audio); web
    // recordings are webm or mp4 (MediaRecorder). The extension and content
    // type travel with the bytes so storage and the server see the truth.
    const payload = await readAudio(audioUri);
    const path = `${userId}/${jobId}.${payload.ext}`;

    const supabase = getSupabase();
    const { error: upError } = await supabase.storage
      .from('audio-notes')
      .upload(path, payload.bytes, { contentType: payload.contentType, upsert: true });
    if (upError) {
      return { ok: false, error: `Upload failed: ${upError.message}`, retryable: true };
    }

    const { data, error: fnError } = await supabase.functions.invoke('extract-job', {
      body: { path, vertical: vertical.key, claimedPro: getCachedPro() },
    });
    if (fnError) {
      // FunctionsHttpError carries a fixed generic .message for any non-2xx;
      // the real error is in the response body/status. Surface it faithfully.
      if (fnError instanceof FunctionsHttpError) {
        const status: number = fnError.context.status;
        let body = '';
        try {
          body = await fnError.context.text();
        } catch {
          // body unreadable — fall back to the status code alone
        }
        // 429 with a quota code: the server refused because the user is out
        // of free/monthly extractions — surface the server's own message and
        // let the UI offer an upgrade path where appropriate.
        const quota = mapQuotaError(status, body);
        if (quota) return { ok: false, ...quota };
        // 413: audio exceeds the server's permanent 15MB cap — retry can never
        // succeed. 403: the path is not ours — retrying won't change that.
        const retryable = status !== 413 && status !== 403;
        return {
          ok: false,
          error: `Extraction failed (${status})${body ? `: ${body}` : ''}`,
          retryable,
        };
      }
      return { ok: false, error: `Extraction failed: ${fnError.message}`, retryable: true };
    }

    let extraction;
    try {
      extraction = parseExtraction(normalizeInvokeData(data));
    } catch {
      // Don't let a raw multi-line zod dump reach the UI. The server retains
      // nothing on success responses it validated, and our local file is kept,
      // so a retry is coherent end to end.
      return {
        ok: false,
        error: "Couldn't read the extraction result. Please try again.",
        retryable: true,
      };
    }
    const { job, items } = extractionToJob(extraction, jobId, new Date().toISOString());
    saveJobWithItems(job, items);
    void pushJob(job, items); // fire-and-forget cloud mirror; never blocks the pipeline

    // Everything succeeded — release the local recording (file on native,
    // blob object URL on web). deleteAudio never throws: a failed cleanup
    // must not fail the pipeline — the job is already saved.
    deleteAudio(audioUri);

    return { ok: true, job, items };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Unknown error', retryable: true };
  }
}
