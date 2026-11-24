import { getDb } from './database';
import { Profile } from '../types';
import { vertical } from '../verticals';

export function getProfile(): Profile {
  const r = getDb().getFirstSync<any>(`SELECT * FROM profile WHERE id = 1`)!;
  return {
    businessName: r.business_name, trade: r.trade, currency: r.currency,
    taxRate: r.tax_rate,
    quoteTerms: r.quote_terms || vertical.documents.defaultTerms,
    quoteCounter: r.quote_counter,
  };
}

export function saveProfile(p: Profile): void {
  getDb().runSync(
    `UPDATE profile SET business_name=?, trade=?, currency=?, tax_rate=?, quote_terms=?, quote_counter=? WHERE id = 1`,
    [p.businessName, p.trade, p.currency, p.taxRate, p.quoteTerms, p.quoteCounter]
  );
}

// Sync bookkeeping (not part of the Profile interface — it's not user profile
// data, just the last successful pull watermark stored on the singleton row).
export function getLastSyncAt(): string {
  return getDb().getFirstSync<any>(`SELECT last_sync_at FROM profile WHERE id = 1`)!.last_sync_at;
}

export function setLastSyncAt(iso: string): void {
  getDb().runSync(`UPDATE profile SET last_sync_at = ? WHERE id = 1`, [iso]);
}

// Onboarding flag (like last_sync_at: app bookkeeping on the singleton row,
// not part of the Profile interface).
export function isOnboarded(): boolean {
  return !!getDb().getFirstSync<any>(`SELECT onboarded FROM profile WHERE id = 1`)!.onboarded;
}

export function setOnboarded(v: boolean): void {
  getDb().runSync(`UPDATE profile SET onboarded = ? WHERE id = 1`, [v ? 1 : 0]);
}

export function nextQuoteNumber(): number {
  const db = getDb();
  db.runSync(`UPDATE profile SET quote_counter = quote_counter + 1 WHERE id = 1`);
  return db.getFirstSync<any>(`SELECT quote_counter FROM profile WHERE id = 1`)!.quote_counter;
}
