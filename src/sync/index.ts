// Local-first cloud mirror. Push is fire-and-forget after local writes; pull runs
// once per app start. Failures never block the UI; the next start retries by
// re-pulling and re-pushing anything newer locally. Example jobs (id 'example-*')
// never sync.
import { getSupabase } from '../supabase';
import { Job, LineItem } from '../types';
import { getJob, listJobs, saveJobWithItems, deleteJobLocal } from '../db/jobs';
import { getLastSyncAt, setLastSyncAt } from '../db/profile';
import { resolve } from './merge';

function isExample(jobId: string): boolean { return jobId.startsWith('example-'); }

function rowFromJob(job: Job, userId: string) {
  return {
    id: job.id, user_id: userId,
    client_name: job.clientName, client_phone: job.clientPhone,
    client_email: job.clientEmail, client_address: job.clientAddress,
    title: job.title, description: job.description, status: job.status,
    transcript: job.transcript, notes: job.notes,
    created_at: job.createdAt, updated_at: job.updatedAt, deleted_at: null,
  };
}

function jobFromRow(r: any): Job {
  return {
    id: r.id, clientName: r.client_name, clientPhone: r.client_phone,
    clientEmail: r.client_email, clientAddress: r.client_address,
    title: r.title, description: r.description, status: r.status,
    transcript: r.transcript, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function itemRows(items: LineItem[], userId: string) {
  return items.map((li) => ({
    id: li.id, user_id: userId, job_id: li.jobId, kind: li.kind,
    description: li.description, qty: li.qty, unit: li.unit,
    unit_price: li.unitPrice, low_confidence: li.lowConfidence ? 1 : 0,
    checked: li.checked ? 1 : 0,
  }));
}

function itemFromRow(r: any): LineItem {
  return {
    id: r.id, jobId: r.job_id, kind: r.kind, description: r.description,
    qty: r.qty, unit: r.unit, unitPrice: r.unit_price,
    lowConfidence: !!r.low_confidence, checked: !!r.checked,
  };
}

/** Push one job + items. Fire-and-forget; errors logged only. */
export async function pushJob(job: Job, items: LineItem[]): Promise<void> {
  if (isExample(job.id)) return;
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // pipeline signs in lazily; unsynced saves flow on next start
    const userId = session.user.id;
    // Cloud rows are keyed (user_id, id): the same local job id can exist
    // under an abandoned anonymous uid and the restored uid side by side.
    const { error: jobErr } = await supabase.from('jobs')
      .upsert(rowFromJob(job, userId), { onConflict: 'user_id,id' });
    if (jobErr) { console.warn('sync push job failed', jobErr.message); return; }
    // job_id alone is enough: RLS scopes the delete to this user's own rows,
    // so another uid's copy of the same job id is untouched.
    await supabase.from('line_items').delete().eq('job_id', job.id);
    if (items.length) {
      const { error } = await supabase.from('line_items').insert(itemRows(items, userId));
      if (error) console.warn('sync push items failed', error.message);
    }
  } catch (e) { console.warn('sync push skipped', e); }
}

/** Soft-delete server-side. Fire-and-forget. */
export async function pushDelete(jobId: string): Promise<void> {
  if (isExample(jobId)) return;
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('jobs')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) console.warn('sync delete failed', error.message);
  } catch (e) { console.warn('sync delete skipped', e); }
}

/**
 * Pull remote changes since last sync, then push anything newer locally.
 *
 * Two timestamp domains, deliberately separate (see the jobs_sync migration):
 *  - `updated_at`        — device-authored: "when did a human change this".
 *                          Used ONLY as the last-write-wins merge comparator.
 *  - `server_updated_at` — server-authoritative (DB trigger): "when did the
 *                          server learn this". Used ONLY as the incremental
 *                          pull watermark, so device clock skew can never hide
 *                          or replay changes.
 *
 * Returns true when the sync completed with no failures; false when it bailed
 * early (no session, pull error) or any per-job step failed — callers like
 * restore use this for honest UX copy. Failures still never throw.
 */
export async function startupSync(): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false; // never force a sign-in just to sync
    const since = getLastSyncAt();

    // Note: PostgREST caps unpaginated selects at 1000 rows by default —
    // pagination is a future need for >1000-job accounts.
    let q = supabase.from('jobs').select('*');
    if (since) q = q.gt('server_updated_at', since);
    const { data: remoteJobs, error } = await q;
    if (error) { console.warn('sync pull failed', error.message); return false; }

    let hadFailures = false;
    // PostgREST serializes timestamptz as ISO UTC, so string max/compare is
    // chronological. '' means "nothing pulled" — keep the old watermark then.
    let maxServerUpdatedAt = '';
    const pulledIds = new Set<string>();

    for (const r of remoteJobs ?? []) {
      // Every pulled row is fully reconciled here, in both directions:
      // takeRemote applies the remote copy locally; keepLocal with a STRICTLY
      // newer local copy pushes it back so LWW wins server-side too (including
      // resurrecting a job the server tombstoned after a newer local edit).
      // Equality of updated_at is the pure echo case — a row we pushed
      // ourselves — and must NOT re-push (until Task 5 stores `checked`
      // locally, an echo would zero `checked` server-side). Either way the id
      // joins pulledIds so the fuzzy cross-domain push-back loop below never
      // double-fires for it.
      pulledIds.add(r.id);
      if (r.server_updated_at > maxServerUpdatedAt) maxServerUpdatedAt = r.server_updated_at;
      const local = getJob(r.id);
      if (r.deleted_at) {
        if (local) {
          if (resolve(local.job.updatedAt, r.updated_at) === 'takeRemote') {
            deleteJobLocal(r.id);
          } else if (local.job.updatedAt > r.updated_at) {
            // Local edit is newer than the remote delete: resurrect it
            // server-side (pushJob upserts with deleted_at = null).
            await pushJob(local.job, local.items);
          }
        }
        continue;
      }
      if (resolve(local?.job.updatedAt, r.updated_at) === 'takeRemote') {
        const { data: remoteItems, error: itemsErr } = await supabase
          .from('line_items').select('*').eq('job_id', r.id);
        if (itemsErr) {
          // NEVER apply the job with a failed item fetch: saving with [] would
          // wipe the local items, and a later push would wipe them remotely
          // too. Skip this job and hold the watermark so next start re-pulls.
          console.warn('sync pull items failed', itemsErr.message);
          hadFailures = true;
          continue;
        }
        saveJobWithItems(jobFromRow(r), (remoteItems ?? []).map(itemFromRow));
      } else if (local && local.job.updatedAt > r.updated_at) {
        // keepLocal with a strictly newer local copy: push so the backup
        // catches up (strict — equality is the echo case, see above).
        await pushJob(local.job, local.items);
      }
    }

    // Push-back: local jobs newer than the watermark (covers offline saves).
    // Pulled ids are already reconciled above — never echo them back.
    for (const job of listJobs()) {
      if (pulledIds.has(job.id)) continue;
      if (!since || job.updatedAt > since) {
        const full = getJob(job.id);
        if (full) await pushJob(full.job, full.items);
      }
    }

    // Advance the watermark only to the max server_updated_at actually pulled
    // and fully processed — never to local "now" (device clocks skew). Any
    // failure or an empty pull keeps the old watermark; next start re-pulls.
    if (!hadFailures && maxServerUpdatedAt) setLastSyncAt(maxServerUpdatedAt);
    return !hadFailures;
  } catch (e) { console.warn('startup sync skipped', e); return false; }
}
