// Web twin of use-pro.ts: billing never exists on web, so the hook is static.
export function usePro(): { isPro: boolean; loading: boolean } {
  return { isPro: false, loading: false };
}
