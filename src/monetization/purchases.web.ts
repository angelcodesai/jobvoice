// Web twin of purchases.ts: react-native-purchases is a native module with no
// web support, so every entry point is a no-op here. Metro resolves the .web
// extension, keeping the native module out of web bundles. The `import type`
// below is erased at compile time — no runtime dependency is introduced.
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

export function billingAvailable(): boolean {
  return false;
}

export async function ensureConfigured(): Promise<boolean> {
  return false;
}

export async function logInAs(_userId: string): Promise<void> {
  // no-op on web
}

export function isProFromInfo(_info: CustomerInfo): boolean {
  return false;
}

export function getCachedPro(): boolean {
  return false;
}

export function setCachedPro(_v: boolean): void {
  // no-op on web
}

export async function getOfferingPackages(): Promise<PurchasesPackage[]> {
  return [];
}

export async function purchase(_pkg: PurchasesPackage): Promise<boolean> {
  return false;
}

export async function restore(): Promise<boolean> {
  return false;
}
