// Web-only twin of the sync module: async no-ops. The web preview store is
// ephemeral (in-memory, per page load), so there is nothing durable to mirror —
// sync is native-only.
import { Job, LineItem } from '../types';

export async function pushJob(_job: Job, _items: LineItem[]): Promise<void> {}

export async function pushDelete(_jobId: string): Promise<void> {}

// Returns true to match the native contract ("completed without failures") —
// there is nothing to sync on web, so a no-op is a successful sync.
export async function startupSync(): Promise<boolean> { return true; }
