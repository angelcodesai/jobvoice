import { useMemo, useState } from 'react';
import { View, Button, StyleSheet, Text, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getJob, setJobStatus } from '../../../db/jobs';
import { pushJob } from '../../../sync';
import { getProfile, nextQuoteNumber } from '../../../db/profile';
import { buildQuoteHtml } from '../../../quotes/template';
import QuotePreview from '../../../components/quote-preview';
import { vertical } from '../../../verticals';
import { usePro } from '../../../monetization/use-pro';

export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Called unconditionally, before any early return — hooks order must be stable.
  const { isPro, loading } = usePro();
  // Query once on mount; this screen doesn't need live updates.
  const [data] = useState(() => getJob(id));
  // Assigns the number at mount, so backing out without sharing leaves a gap
  // in the sequence. Acceptable: quote numbers need uniqueness, not continuity.
  const [quoteNumber] = useState(() => nextQuoteNumber());
  const [sharing, setSharing] = useState(false);

  const html = useMemo(() => {
    if (!data) return '';
    const p = getProfile();
    return buildQuoteHtml({
      titlePrefix: vertical.documents.pdfTitlePrefix,
      quoteNumber,
      dateIso: new Date().toISOString(),
      businessName: p.businessName || 'My Business',
      trade: p.trade,
      currency: p.currency,
      taxRate: p.taxRate,
      terms: p.quoteTerms,
      clientName: data.job.clientName,
      clientAddress: data.job.clientAddress,
      jobTitle: data.job.title,
      jobDescription: data.job.description,
      items: data.items.map((li) => ({
        description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice,
      })),
    });
  }, [data, quoteNumber]);

  if (!data) return <View style={styles.center}><Text>Job not found.</Text></View>;

  const share = async () => {
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', `The quote PDF was saved to:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `${vertical.documents.pdfTitlePrefix}${quoteNumber} — ${data.job.title}`,
      });
      // shareAsync resolving doesn't guarantee the user actually sent the
      // quote (they may dismiss the share sheet) — acceptable for status.
      setJobStatus(id, 'quoted');
      // Re-read so the pushed copy carries the new status + updated_at.
      const d = getJob(id);
      if (d) void pushJob(d.job, d.items); // fire-and-forget cloud mirror
      // Value-first paywall: the user just experienced the payoff (a shared
      // quote), so this is the moment to show plans to free users.
      if (!loading && !isPro) router.push('/paywall');
    } catch {
      Alert.alert('Share failed', 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      <QuotePreview html={html} />
      <View style={styles.footer}>
        {Platform.OS === 'web' ? (
          // expo-print's printToFileAsync and expo-sharing are native-only.
          <Text style={styles.webNote}>PDF sharing requires the mobile app.</Text>
        ) : (
          <Button title="Share quote PDF" onPress={share} disabled={sharing} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 12 },
  webNote: { textAlign: 'center', color: '#666', paddingVertical: 8 },
});
