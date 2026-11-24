// Web-only implementation of the jobs repository.
// expo-sqlite's synchronous API is unreliable on web in SDK 57 (the
// sync-over-worker bridge times out even when crossOriginIsolated), so the
// web build uses this in-memory preview store instead. Data is
// non-persistent by design: it lives for the lifetime of the page only.
import { Job, LineItem, JobStatus } from '../types';
import { saveProfile, setLastSyncAt, setOnboarded } from './profile';

const jobs = new Map<string, Job>();
const itemsByJob = new Map<string, LineItem[]>();

export function saveJobWithItems(job: Job, items: LineItem[]): void {
  jobs.set(job.id, { ...job });
  itemsByJob.set(job.id, items.map((li) => ({ ...li })));
}

export function listJobs(): Job[] {
  return [...jobs.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((j) => ({ ...j }));
}

export function getJob(id: string): { job: Job; items: LineItem[] } | null {
  const job = jobs.get(id);
  if (!job) return null;
  const items = (itemsByJob.get(id) ?? []).map((li) => ({ ...li }));
  return { job: { ...job }, items };
}

export interface ClientSummary { name: string; jobCount: number; lastActivity: string; }

export function listClients(): ClientSummary[] {
  const byName = new Map<string, ClientSummary>();
  for (const job of jobs.values()) {
    if (!job.clientName) continue;
    const existing = byName.get(job.clientName);
    if (existing) {
      existing.jobCount += 1;
      if (job.updatedAt > existing.lastActivity) existing.lastActivity = job.updatedAt;
    } else {
      byName.set(job.clientName, { name: job.clientName, jobCount: 1, lastActivity: job.updatedAt });
    }
  }
  return [...byName.values()]
    .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : 0));
}

export function listJobsByClient(name: string): Job[] {
  return [...jobs.values()]
    .filter((j) => j.clientName === name)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((j) => ({ ...j }));
}

export function deleteJobLocal(id: string): void {
  jobs.delete(id);
  itemsByJob.delete(id);
}

// Counts real (non-example) jobs touched since `sinceIso` for the weekly
// summary notification. Mirrors the SQLite implementation in jobs.ts.
export function countByStatusSince(sinceIso: string): { quoted: number; won: number } {
  let quoted = 0;
  let won = 0;
  for (const job of jobs.values()) {
    if (job.id.startsWith('example-')) continue;
    if (!(job.updatedAt > sinceIso)) continue;
    if (job.status === 'quoted' || job.status === 'won' || job.status === 'done') quoted += 1;
    if (job.status === 'won') won += 1;
  }
  return { quoted, won };
}

export function setJobStatus(id: string, status: JobStatus): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status, updatedAt: new Date().toISOString() });
}

// Account deletion: wipe the in-memory store and reset the profile twin to
// factory defaults, mirroring the SQLite implementation in jobs.ts.
// './profile' resolves to profile.web.ts in the web bundle.
export function wipeAllData(): void {
  jobs.clear();
  itemsByJob.clear();
  saveProfile({
    businessName: '', trade: '', currency: 'USD', taxRate: 0,
    quoteTerms: '', quoteCounter: 0,
  });
  setLastSyncAt('');
  setOnboarded(false);
}
