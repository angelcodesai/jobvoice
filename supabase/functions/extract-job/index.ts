// extract-job — Supabase Edge Function (Deno)
//
// Receives { path, vertical, claimedPro? } — path points at an audio file in
// the private `audio-notes` bucket; vertical selects the server-side
// prompt/schema pair (see ./verticals.ts); claimedPro optionally opens a 24h
// unverified pro grace window (RevenueCat webhook lag). Authenticates the
// caller, verifies the path belongs to them, enforces usage quotas (429 with
// { code, message } when exhausted), downloads the audio, sends it to Gemini
// with a schema-constrained JSON response, DELETES the audio (we never retain
// it server-side — privacy requirement), and returns the extraction JSON.
//
// Deploy:   npx supabase functions deploy extract-job
// Secrets:  npx supabase secrets set GEMINI_API_KEY=...
//           (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
//           are injected automatically by the Supabase platform.)
//
// NOTE: This is Deno code — it is excluded from the Expo app's tsconfig.
//
// TODO(plan-2): bucket lifecycle/TTL for orphaned audio from never-retried failures

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { SERVER_VERTICALS } from './verticals.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Quota caps. Trials get a TOTAL note allowance (not monthly); pro users
// (verified via RevenueCat webhook, or inside a 24h client-claim grace
// window) get a monthly allowance. Checked BEFORE the Gemini call,
// incremented only AFTER a fully validated extraction — failed extractions
// never consume quota, and any check/increment race overshoot is
// immaterial at these caps.
const TRIAL_TOTAL_LIMIT = 25;
const PRO_MONTHLY_LIMIT = 300;
// Unverified-grace cap: anonymous identities are freely mintable, so an
// unverified 24h claimedPro grace at the full 300/mo cap would be a 12x
// cost amplifier over trial. 50 is invisible to genuine first-day buyers
// (the RevenueCat webhook normally verifies within seconds) while capping
// abuse near trial levels.
const GRACE_MONTHLY_LIMIT = 50;

Deno.serve(async (req) => {
  try {
    // 1. Authenticate the caller.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    // 2. Validate the requested path belongs to the caller.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }
    const { path, vertical, claimedPro: rawClaimedPro } =
      (body as { path?: unknown; vertical?: unknown; claimedPro?: unknown } | null) ?? {};
    // Strict allowlist: exactly <userId>/<jobId>.<ext> (jobIds are UUIDs —
    // hex + hyphens). Anchored, so no traversal or foreign prefixes. Allowed
    // extensions match what the clients record: m4a (native expo-audio),
    // webm (Chrome/Firefox MediaRecorder), mp4 (Safari MediaRecorder); the
    // extension also drives the Gemini mime_type below.
    const PATH_RE = new RegExp('^' + user.id + '/[A-Za-z0-9-]+\\.(m4a|webm|mp4)$');
    if (typeof path !== 'string' || !PATH_RE.test(path)) {
      return new Response('Forbidden', { status: 403 });
    }
    // Extension → Gemini mime type. m4a and mp4 are both AAC-in-MP4
    // containers (audio/mp4).
    //
    // CAVEAT (webm): audio/webm is NOT on Gemini's officially documented
    // audio MIME list (wav/mp3/aiff/aac/ogg/flac) but is accepted in
    // practice. If web-recorded notes start failing extraction with format
    // errors, check this function's logs (the Gemini error body is logged
    // below) — the fix path is transcoding webm→supported format, or
    // re-labeling, server-side or client-side.
    const mimeType = path.endsWith('.webm') ? 'audio/webm' : 'audio/mp4';

    // Vertical selects the server-side prompt/schema pair. Unknown values are
    // rejected so a stale or tampered client can't get an undefined config.
    // Object.hasOwn keeps prototype keys ("constructor", "toString") from
    // sneaking past the lookup on this plain object literal.
    const verticalKey = typeof vertical === 'string' ? vertical : '';
    const sv = Object.hasOwn(SERVER_VERTICALS, verticalKey)
      ? SERVER_VERTICALS[verticalKey]
      : undefined;
    if (!sv) return new Response('Unknown vertical', { status: 400 });

    // Service-role client: used for quota reads/writes below and the
    // storage download/delete.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 3. Quota check (before we pay for a Gemini call).
    //
    // claimedPro: client-asserted, used ONLY to open a 24h unverified grace
    // window (RevenueCat webhook lag). The rc-webhook function later
    // overwrites verified state.
    const claimedPro = rawClaimedPro === true;

    const { data: ent } = await admin.from('entitlements')
      .select('is_active, expires_at, verified').eq('user_id', user.id).maybeSingle();
    let isPro = !!ent && ent.is_active &&
      (!ent.expires_at || new Date(ent.expires_at) > new Date());

    if (!isPro && claimedPro && !ent) {
      const graceExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      // Grace must only ever CREATE a row — a concurrent rc-webhook verified
      // write must never be clobbered back to unverified.
      await admin.from('entitlements').upsert({
        user_id: user.id, is_active: true, expires_at: graceExpiry, verified: false,
      }, { ignoreDuplicates: true });
      isPro = true;
    }
    // Grace-path pro (no entitlement row, or an unverified grace row) is
    // NOT verified, so it gets the lower GRACE_MONTHLY_LIMIT below.
    const isVerifiedPro = isPro && ent?.verified === true;

    const month = new Date().toISOString().slice(0, 7);
    if (isPro) {
      const limit = isVerifiedPro ? PRO_MONTHLY_LIMIT : GRACE_MONTHLY_LIMIT;
      const { data: u } = await admin.from('usage')
        .select('note_count').eq('user_id', user.id).eq('month', month).maybeSingle();
      if ((u?.note_count ?? 0) >= limit) {
        return Response.json(
          { code: 'MONTHLY_LIMIT', message: `You've reached this month's ${limit}-note limit.` },
          { status: 429 });
      }
    } else {
      // Trial allowance is TOTAL across all months, so sum every row.
      const { data: rows } = await admin.from('usage')
        .select('note_count').eq('user_id', user.id);
      const total = (rows ?? []).reduce((s: number, r: { note_count: number }) => s + r.note_count, 0);
      if (total >= TRIAL_TOTAL_LIMIT) {
        return Response.json(
          { code: 'TRIAL_LIMIT', message: 'Your free trial notes are used up. Subscribe to keep quoting by voice.' },
          { status: 429 });
      }
    }

    // 4. Download the audio with the service role.
    const { data: file, error: dlError } = await admin.storage
      .from('audio-notes')
      .download(path);
    if (dlError || !file) return new Response('Audio not found', { status: 404 });
    // Size guard: a 15-min m4a is ~7MB → ~9.4MB as base64, well inside
    // Gemini's ~20MB inline request limit. The cap bounds this function's
    // memory use per request (per-user volume is bounded by the quota
    // check above).
    const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_AUDIO_BYTES) {
      return new Response('Audio too large', { status: 413 });
    }
    const audioB64 = encodeBase64(await file.arrayBuffer());

    // 5. Call Gemini with schema-constrained JSON output.
    const geminiResp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // API key goes in a header, not the URL, to keep it out of URL logs.
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sv.systemPrompt }] },
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: audioB64 } },
            { text: 'Extract the job data from this voice note.' },
          ],
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: sv.responseSchema,
          temperature: 0.1,
        },
      }),
    });
    if (!geminiResp.ok) {
      const detail = await geminiResp.text();
      console.error('Gemini error', geminiResp.status, detail);
      return new Response('Extraction failed', { status: 502 });
    }
    const gemini = await geminiResp.json();
    const candidate = gemini.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) return new Response('Empty extraction', { status: 502 });

    // 6. Only delete the audio once we KNOW the extraction is usable.
    // Gemini can return truncated JSON (e.g. finishReason MAX_TOKENS);
    // if we deleted first, the client's zod parse would fail and the
    // voice note would be gone with no retry path.
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.error('Gemini finished abnormally', candidate.finishReason);
      return new Response('Extraction failed', { status: 502 });
    }
    try {
      JSON.parse(text);
    } catch (parseErr) {
      console.error('Gemini returned unparseable JSON', parseErr);
      return new Response('Extraction failed', { status: 502 });
    }

    // 7. Count this note against quota. The extraction is fully validated
    // at this point, so a failed extraction never consumes quota. An rpc
    // error must not fail the request — the user already has their
    // extraction; quota strictness loses to correctness here.
    try {
      const { error: rpcError } = await admin.rpc('increment_usage', {
        p_user_id: user.id, p_month: month,
      });
      if (rpcError) console.error('increment_usage failed for', user.id, rpcError);
    } catch (rpcErr) {
      console.error('increment_usage threw for', user.id, rpcErr);
    }

    // 8. Delete the audio — we never retain it server-side (privacy
    // requirement). A cleanup failure must not fail the request, but we
    // log it so orphaned audio is visible in the function logs.
    const { error: rmError } = await admin.storage.from('audio-notes').remove([path]);
    if (rmError) console.error('Audio cleanup failed for', path, rmError);

    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response('Internal error', { status: 500 });
  }
});
