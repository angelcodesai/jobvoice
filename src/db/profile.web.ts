// Web-only implementation of the profile repository.
// expo-sqlite's synchronous API is unreliable on web in SDK 57 (the
// sync-over-worker bridge times out even when crossOriginIsolated), so the
// web build uses this in-memory preview store instead. Data is
// non-persistent by design: it lives for the lifetime of the page only.
// Defaults mirror what the SQLite migration seeds into the profile row.
import { Profile } from '../types';
import { vertical } from '../verticals';

const profile: Profile = {
  businessName: '',
  trade: '',
  currency: 'USD',
  taxRate: 0,
  quoteTerms: 'Quote valid for 30 days.',
  quoteCounter: 0,
};

export function getProfile(): Profile {
  return { ...profile, quoteTerms: profile.quoteTerms || vertical.documents.defaultTerms };
}

export function saveProfile(p: Profile): void {
  Object.assign(profile, p);
}

// Sync bookkeeping (kept separate from the Profile interface, matching the
// native twin). The web preview store is ephemeral so this resets per page.
let lastSyncAt = '';

export function getLastSyncAt(): string {
  return lastSyncAt;
}

export function setLastSyncAt(iso: string): void {
  lastSyncAt = iso;
}

// Onboarding flag. Defaults to TRUE on web: the web preview store is
// ephemeral, so a false default would redirect every page load into
// onboarding and the preview could never show the real app screens.
let onboarded = true;

export function isOnboarded(): boolean {
  return onboarded;
}

export function setOnboarded(v: boolean): void {
  onboarded = v;
}

export function nextQuoteNumber(): number {
  profile.quoteCounter += 1;
  return profile.quoteCounter;
}
