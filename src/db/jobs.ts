import { getDb } from './database';
import { Job, LineItem, JobStatus, ItemKind } from '../types';

export function saveJobWithItems(job: Job, items: LineItem[]): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO jobs
       (id, client_name, client_phone, client_email, client_address,
        title, description, status, transcript, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [job.id, job.clientName, job.clientPhone, job.clientEmail, job.clientAddress,
       job.title, job.description, job.status, job.transcript, job.notes,
       job.createdAt, job.updatedAt]
    );
    db.runSync(`DELETE FROM line_items WHERE job_id = ?`, [job.id]);
    for (const li of items) {
      db.runSync(
        `INSERT INTO line_items (id, job_id, kind, description, qty, unit, unit_price, low_confidence, checked)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [li.id, li.jobId, li.kind, li.description, li.qty, li.unit, li.unitPrice,
         li.lowConfidence ? 1 : 0, li.checked ? 1 : 0]
      );
    }
  });
}

export function listJobs(): Job[] {
  return getDb()
    .getAllSync<any>(`SELECT * FROM jobs ORDER BY updated_at DESC`)
    .map(rowToJob);
}

export function getJob(id: string): { job: Job; items: LineItem[] } | null {
  const row = getDb().getFirstSync<any>(`SELECT * FROM jobs WHERE id = ?`, [id]);
  if (!row) return null;
  const items = getDb()
    .getAllSync<any>(`SELECT * FROM line_items WHERE job_id = ?`, [id])
    .map(rowToItem);
  return { job: rowToJob(row), items };
}

export interface ClientSummary { name: string; jobCount: number; lastActivity: string; }

export function listClients(): ClientSummary[] {
  return getDb()
    .getAllSync<any>(
      `SELECT client_name AS name, COUNT(*) AS jobCount, MAX(updated_at) AS lastActivity
       FROM jobs WHERE client_name <> '' GROUP BY client_name ORDER BY lastActivity DESC`
    )
    .map((r) => ({ name: r.name, jobCount: r.jobCount, lastActivity: r.lastActivity }));
}

export function listJobsByClient(name: string): Job[] {
  return getDb()
    .getAllSync<any>(`SELECT * FROM jobs WHERE client_name = ? ORDER BY updated_at DESC`, [name])
    .map(rowToJob);
}

export function deleteJobLocal(id: string): void {
  getDb().runSync(`DELETE FROM jobs WHERE id = ?`, [id]); // items cascade (FK pragma on)
}

// Counts real (non-example) jobs touched since `sinceIso` for the weekly
// summary notification. "Quoted" means the job reached at least quoted —
// won/done jobs passed through quoted, so they count too.
export function countByStatusSince(sinceIso: string): { quoted: number; won: number } {
  const rows = getDb().getAllSync<any>(
    `SELECT status, COUNT(*) AS n FROM jobs WHERE updated_at > ? AND id NOT LIKE 'example-%' GROUP BY status`,
    [sinceIso]
  );
  const get = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { quoted: get('quoted') + get('won') + get('done'), won: get('won') };
}

export function setJobStatus(id: string, status: JobStatus): void {
  getDb().runSync(`UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?`, [
    status, new Date().toISOString(), id,
  ]);
}

// Account deletion: wipe every local table in one transaction. Jobs and line
// items are deleted outright; the singleton profile row is reset to factory
// defaults (onboarded=0 sends the next launch back through onboarding).
export function wipeAllData(): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM line_items`);
    db.runSync(`DELETE FROM jobs`);
    db.runSync(
      `UPDATE profile SET business_name='', trade='', currency='USD', tax_rate=0,
       quote_terms='', quote_counter=0, last_sync_at='', onboarded=0 WHERE id=1`
    );
  });
}

function rowToJob(r: any): Job {
  return {
    id: r.id, clientName: r.client_name, clientPhone: r.client_phone,
    clientEmail: r.client_email, clientAddress: r.client_address,
    title: r.title, description: r.description, status: r.status as JobStatus,
    transcript: r.transcript, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowToItem(r: any): LineItem {
  return {
    id: r.id, jobId: r.job_id, kind: r.kind as ItemKind, description: r.description,
    qty: r.qty, unit: r.unit, unitPrice: r.unit_price, lowConfidence: !!r.low_confidence,
    checked: !!r.checked,
  };
}
