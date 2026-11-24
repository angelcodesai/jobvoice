export interface PricedItem {
  qty: number;
  unitPrice: number | null;
}

export function round2(n: number): number {
  // Float products like 2.5*19.99 evaluate to 49.974999999999994 (true value 49.975).
  // Number.EPSILON (≈2.2e-16) is relative to 1.0 and too small to correct errors at money magnitudes.
  // A fixed 1e-9 nudge applied after scaling by 100 (effectively 1e-11 tolerance on input) rounds
  // true-half values up without disturbing genuinely-below-half values like 49.9749.
  return Math.round(n * 100 + 1e-9) / 100;
}

export function lineTotal(item: PricedItem): number {
  if (item.unitPrice == null) return 0;
  return round2(item.qty * item.unitPrice);
}

export function subtotal(items: PricedItem[]): number {
  return round2(items.reduce((sum, i) => sum + lineTotal(i), 0));
}

export function taxAmount(sub: number, rate: number): number {
  return round2(sub * rate);
}

export function quoteTotal(items: PricedItem[], rate: number): number {
  const sub = subtotal(items);
  return round2(sub + taxAmount(sub, rate));
}
