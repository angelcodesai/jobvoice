// RevenueCat wrapper. All entry points are safe no-ops when billing is unconfigured
// (empty apiKey — local dev) or on web (see purchases.web.ts twin).
import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { vertical } from '../verticals';
import { ensureSignedIn } from '../supabase';

let configured = false;
let configPromise: Promise<boolean> | null = null;

export function billingAvailable(): boolean {
  return !!vertical.revenuecat.apiKey;
}

/**
 * Configure RC with the Supabase user id as appUserID. Idempotent, and
 * promise-gated so concurrent callers (e.g. usePro's effect racing the
 * paywall at startup) share a single configure attempt. A failed attempt
 * clears the gate so the next caller can retry.
 */
export async function ensureConfigured(): Promise<boolean> {
  if (!billingAvailable()) return false;
  if (configured) return true;
  if (!configPromise) {
    configPromise = (async () => {
      const userId = await ensureSignedIn();
      Purchases.configure({ apiKey: vertical.revenuecat.apiKey, appUserID: userId });
      configured = true;
      return true;
    })().catch((e) => {
      configPromise = null;
      throw e;
    });
  }
  return configPromise;
}

/**
 * Re-identify RC after an OTP restore switches the Supabase session to a
 * different uid. Only needed when RC is ALREADY configured (with the old
 * anonymous appUserID); if it hasn't been configured yet, the next
 * ensureConfigured() reads the new session's uid naturally. logIn merges the
 * store receipt onto the restored appUserID so the subscription follows.
 */
export async function logInAs(userId: string): Promise<void> {
  if (!billingAvailable() || !configured) return;
  await Purchases.logIn(userId);
}

export function isProFromInfo(info: CustomerInfo): boolean {
  return !!info.entitlements.active[vertical.revenuecat.entitlement];
}

/** Cached synchronous flag consumed by the pipeline's claimedPro field. */
let cachedPro = false;
export function getCachedPro(): boolean {
  return cachedPro;
}
export function setCachedPro(v: boolean): void {
  cachedPro = v;
}

export async function getOfferingPackages(): Promise<PurchasesPackage[]> {
  if (!(await ensureConfigured())) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchase(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const pro = isProFromInfo(customerInfo);
  setCachedPro(pro);
  return pro;
}

export async function restore(): Promise<boolean> {
  if (!(await ensureConfigured())) return false;
  const info = await Purchases.restorePurchases();
  const pro = isProFromInfo(info);
  setCachedPro(pro);
  return pro;
}
