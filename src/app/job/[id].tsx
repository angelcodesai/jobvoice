import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Button, StyleSheet, ScrollView,
  ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { processVoiceNote } from '../../processing/pipeline';
import { getJob, saveJobWithItems, deleteJobLocal } from '../../db/jobs';
import { pushJob, pushDelete } from '../../sync';
import { DecimalInput } from '../../components/decimal-input';
import { Job, LineItem, ItemKind } from '../../types';
import { lineTotal, subtotal } from '../../quotes/math';
import { usePro } from '../../monetization/use-pro';
import { vertical } from '../../verticals';

type Phase = 'processing' | 'error' | 'ready';

export default function JobScreen() {
  const { id, audioUri } = useLocalSearchParams<{ id: string; audioUri?: string }>();
  const router = useRouter();
  // Unconditional (hooks order — before any early return). Needed so the
  // error view can turn 'See plans' into Retry once the user upgrades.
  const { isPro } = usePro();
  // Arriving with an audio URI means the pipeline runs first — paint the
  // spinner on the very first frame instead of flashing "Job not found".
  const [phase, setPhase] = useState<Phase>(() => (audioUri ? 'processing' : 'ready'));
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(true);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  // The pipeline must never run twice concurrently for the same job
  // (see processVoiceNote docs) — guard against double-tapped Retry.
  const runningRef = useRef(false);

  const runPipeline = useCallback(async () => {
    if (runningRef.current || !audioUri) return;
    runningRef.current = true;
    setPhase('processing');
    try {
      const result = await processVoiceNote(id, audioUri);
      if (result.ok) {
        setJob(result.job);
        setItems(result.items);
        setPhase('ready');
      } else {
        setError(result.error);
        setRetryable(result.retryable);
        setNeedsUpgrade(result.needsUpgrade ?? false);
        setPhase('error');
      }
    } finally {
      runningRef.current = false;
    }
  }, [id, audioUri]);

  useEffect(() => {
    const existing = getJob(id);
    if (existing) {
      setJob(existing.job);
      setItems(existing.items);
      setPhase('ready');
    } else if (audioUri) {
      runPipeline();
    }
  }, [id, audioUri, runPipeline]);

  if (phase === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Turning your voice note into a job…</Text>
      </View>
    );
  }
  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        {needsUpgrade ? (
          // Purchase-return flow: the paywall modal closes with router.back(),
          // landing the user right here. Once RC reports Pro, offer Retry —
          // the pipeline sends claimedPro, so the server's grace window admits
          // the request even though the quota error itself was non-retryable.
          isPro ? (
            <Button title="Retry" onPress={runPipeline} />
          ) : (
            <>
              <Button title="See plans" onPress={() => router.push('/paywall')} />
              <Button title="Back" onPress={() => router.back()} />
            </>
          )
        ) : retryable ? (
          <Button title="Retry" onPress={runPipeline} />
        ) : (
          <Button title="Back" onPress={() => router.back()} />
        )}
      </View>
    );
  }
  if (!job) return <View style={styles.center}><Text>Job not found.</Text></View>;

  const update = (patch: Partial<Job>) => setJob({ ...job, ...patch });
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems(items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  const addItem = (kind: ItemKind) =>
    setItems([...items, {
      // Random suffix: Date.now() alone can collide on rapid taps (ms
      // resolution) and a duplicate PK would roll back the whole save.
      id: `${job.id}-li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jobId: job.id, kind,
      description: '', qty: 1, unit: '', unitPrice: null, lowConfidence: false, checked: false,
    }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const save = (): boolean => {
    try {
      // This screen has no status UI — re-read status at save time so a stale
      // in-memory copy can't revert a status set elsewhere (e.g. 'quoted').
      const persistedStatus = getJob(job.id)?.job.status ?? job.status;
      const updated = { ...job, status: persistedStatus, updatedAt: new Date().toISOString() };
      saveJobWithItems(updated, items);
      void pushJob(updated, items); // fire-and-forget cloud mirror; never blocks save
      setJob(updated); // keep in-memory state consistent for display
      return true;
    } catch {
      Alert.alert('Save failed', 'Please try again.');
      return false;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.section}>Client</Text>
      <TextInput style={styles.input} value={job.clientName} placeholder="Client name"
        onChangeText={(t) => update({ clientName: t })} />
      <TextInput style={styles.input} value={job.clientAddress} placeholder="Address"
        onChangeText={(t) => update({ clientAddress: t })} />
      <TextInput style={styles.input} value={job.clientPhone} placeholder="Phone"
        keyboardType="phone-pad" onChangeText={(t) => update({ clientPhone: t })} />

      <Text style={styles.section}>Job</Text>
      <TextInput style={styles.input} value={job.title} placeholder="Job title"
        onChangeText={(t) => update({ title: t })} />
      <TextInput style={[styles.input, styles.multiline]} value={job.description} multiline
        placeholder="Description" onChangeText={(t) => update({ description: t })} />

      <Text style={styles.section}>Line items</Text>
      {items.map((li, i) => (
        <View key={li.id} style={[styles.itemCard, li.lowConfidence && styles.lowConfidence]}>
          {li.lowConfidence && <Text style={styles.badge}>check this</Text>}
          <View style={styles.row}>
            {li.kind === 'material' && (
              // Shopping-list tick. IMPORTANT: ticking does NOT clear
              // lowConfidence — checking off a material you bought is not a
              // review of the extracted data, so the patch must only touch
              // `checked`.
              <Pressable onPress={() => updateItem(i, { checked: !li.checked })}>
                <Text style={styles.checkbox}>{li.checked ? '☑' : '☐'}</Text>
              </Pressable>
            )}
            <TextInput style={[styles.input, styles.flex]} value={li.description} placeholder="Description"
              onChangeText={(t) => updateItem(i, { description: t, lowConfidence: false })} />
          </View>
          <View style={styles.row}>
            <DecimalInput style={[styles.input, styles.flex]} value={li.qty} placeholder="Qty"
              onCommit={(n) => updateItem(i, { qty: n ?? 0, lowConfidence: false })} />
            <TextInput style={[styles.input, styles.flex]} value={li.unit} placeholder="Unit"
              onChangeText={(t) => updateItem(i, { unit: t, lowConfidence: false })} />
            <DecimalInput style={[styles.input, styles.flex]} value={li.unitPrice} placeholder="Price"
              allowNull
              onCommit={(n) => updateItem(i, { unitPrice: n, lowConfidence: false })} />
          </View>
          <View style={styles.row}>
            <Text style={styles.total}>= {lineTotal({ qty: li.qty, unitPrice: li.unitPrice }).toFixed(2)}</Text>
            <Pressable onPress={() => removeItem(i)}><Text style={styles.remove}>Remove</Text></Pressable>
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <Button title="+ Labor" onPress={() => addItem('labor')} />
        <Button title="+ Material" onPress={() => addItem('material')} />
        <Button title="+ Fee" onPress={() => addItem('fee')} />
      </View>
      <Text style={styles.subtotal}>
        Subtotal: {subtotal(items.map((li) => ({ qty: li.qty, unitPrice: li.unitPrice }))).toFixed(2)}
      </Text>

      <Text style={styles.section}>Notes</Text>
      <TextInput style={[styles.input, styles.multiline]} value={job.notes} multiline
        onChangeText={(t) => update({ notes: t })} />

      <View style={{ height: 12 }} />
      <Pressable
        onPress={() =>
          Alert.alert(
            'Delete this ' + vertical.terminology.job.toLowerCase() + '?',
            'This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  try {
                    deleteJobLocal(job.id);
                    void pushDelete(job.id); // fire-and-forget cloud mirror
                    router.back();
                  } catch {
                    Alert.alert('Delete failed', 'Please try again.');
                  }
                },
              },
            ]
          )
        }
      >
        <Text style={styles.delete}>Delete {vertical.terminology.job.toLowerCase()}</Text>
      </Pressable>
      <View style={{ height: 12 }} />
      <Button title="Save" onPress={() => { if (save()) Alert.alert('Saved'); }} />
      <View style={{ height: 8 }} />
      <Button title="Create quote →" onPress={() => { if (save()) router.push(`/job/${job.id}/quote`); }} />
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 6 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  flex: { flex: 1 },
  itemCard: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, marginTop: 8 },
  lowConfidence: { borderColor: '#e6a700', backgroundColor: '#fff9e6' },
  badge: { color: '#a67c00', fontWeight: '700', fontSize: 12 },
  checkbox: { fontSize: 22, paddingHorizontal: 8, paddingVertical: 6 },
  total: { flex: 1, fontWeight: '600' },
  remove: { color: '#c00' },
  subtotal: { fontWeight: '700', fontSize: 16, marginTop: 10, textAlign: 'right' },
  error: { color: '#c00', textAlign: 'center' },
  delete: { color: '#c00', textAlign: 'center', fontWeight: '600', padding: 8 },
});
