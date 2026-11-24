import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { vertical } from '../verticals';
import { billingAvailable, getOfferingPackages, purchase, restore } from '../monetization/purchases';

export default function PaywallScreen() {
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setPackages(await getOfferingPackages());
      } catch {
        setPackages([]);
      }
    })();
  }, []);

  const buy = async (pkg: PurchasesPackage) => {
    setBusy(true);
    try {
      if (await purchase(pkg)) {
        Alert.alert('Welcome to Pro!');
        router.back();
      } else {
        // Purchase went through but the entitlement isn't active — usually an
        // RC product/entitlement misconfiguration. Don't fail silently.
        Alert.alert("Purchase completed but Pro didn't activate", 'Try Restore purchases, or contact support.');
      }
    } catch (e: any) {
      // RC's PurchasesError carries userCancelled (deprecated but present in
      // v10 typings) — a cancelled purchase is not a failure worth alerting.
      if (!e?.userCancelled) Alert.alert('Purchase failed', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      if (await restore()) {
        Alert.alert('Purchases restored');
        router.back();
      } else {
        Alert.alert('No purchases found');
      }
    } catch {
      Alert.alert('Restore failed', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!billingAvailable()) {
    return (
      <View style={styles.center}>
        <Text>{"Billing isn't available in this build."}</Text>
      </View>
    );
  }
  if (packages === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const annual = packages.find((p) => p.product.identifier.startsWith(vertical.revenuecat.annualId));
  const monthly = packages.find((p) => p.product.identifier.startsWith(vertical.revenuecat.monthlyId));

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{vertical.appName} Pro</Text>
      {/* Copy must match server quotas (extract-job PRO_MONTHLY_LIMIT) — Play
          rejects/flags claims like "unlimited" when the server caps usage. */}
      <Text style={styles.sub}>
        300 voice notes a month, every {vertical.terminology.quote.toLowerCase()} and{' '}
        {vertical.terminology.job.toLowerCase()} record you need.
      </Text>
      {annual && (
        <Pressable
          style={[styles.plan, styles.planPrimary, { borderColor: vertical.primaryColor }]}
          disabled={busy}
          onPress={() => buy(annual)}
        >
          <Text style={styles.planTitle}>Annual — {annual.product.priceString}/year</Text>
          <Text style={styles.planBadge}>7-day free trial · Best value</Text>
        </Pressable>
      )}
      {monthly && (
        <Pressable style={styles.plan} disabled={busy} onPress={() => buy(monthly)}>
          <Text style={styles.planTitle}>Monthly — {monthly.product.priceString}/month</Text>
        </Pressable>
      )}
      {packages.length === 0 && (
        <Text style={styles.sub}>Plans are unavailable right now. Please try later.</Text>
      )}
      <Pressable disabled={busy} onPress={doRestore}>
        <Text style={styles.link}>Restore purchases</Text>
      </Pressable>
      <View style={styles.legal}>
        <Pressable onPress={() => Linking.openURL(vertical.legal.privacyUrl)}>
          <Text style={styles.link}>Privacy</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(vertical.legal.termsUrl)}>
          <Text style={styles.link}>Terms</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: { textAlign: 'center', color: '#666', marginBottom: 12 },
  plan: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, padding: 16, gap: 4 },
  planPrimary: { borderWidth: 2 },
  planTitle: { fontSize: 16, fontWeight: '700' },
  planBadge: { color: '#1a7f37', fontWeight: '600', fontSize: 12 },
  link: { color: '#1a73e8', textAlign: 'center', padding: 8 },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
});
