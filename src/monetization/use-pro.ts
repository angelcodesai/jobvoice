import { useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { billingAvailable, ensureConfigured, isProFromInfo, setCachedPro } from './purchases';

// Native implementation. Web uses use-pro.web.ts (Metro resolves the platform
// extension), which keeps react-native-purchases out of web bundles.
export function usePro(): { isPro: boolean; loading: boolean } {
  const [state, setState] = useState({ isPro: false, loading: billingAvailable() });

  useEffect(() => {
    if (!billingAvailable()) return;
    let mounted = true;
    const listener = (info: CustomerInfo) => {
      const pro = isProFromInfo(info);
      setCachedPro(pro);
      if (mounted) setState({ isPro: pro, loading: false });
    };
    (async () => {
      const ok = await ensureConfigured();
      if (!ok) {
        if (mounted) setState({ isPro: false, loading: false });
        return;
      }
      Purchases.addCustomerInfoUpdateListener(listener);
      try {
        listener(await Purchases.getCustomerInfo());
      } catch {
        if (mounted) setState({ isPro: false, loading: false });
      }
    })();
    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return state;
}
