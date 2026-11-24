import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AudioModule } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { vertical } from '../verticals';
import { getProfile, saveProfile, setOnboarded } from '../db/profile';
import { saveJobWithItems } from '../db/jobs';
import { buildExampleJob } from '../onboarding/example-job';
import { requestNotificationPermission, refreshWeeklySummary } from '../notifications/weekly';

export default function OnboardingScreen() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [trade, setTrade] = useState('');
  const [taxPct, setTaxPct] = useState('');
  const [finishing, setFinishing] = useState(false);

  // Both 'Skip' and finishing page 2 run this. Onboarding must never trap the
  // user: even if seeding the example job or saving the profile throws, we
  // still mark onboarding done and land on the home screen.
  const finish = () => {
    // Re-entrancy guard: a fast double-tap would otherwise seed two example
    // jobs before router.replace lands (same idea as the recorder's
    // stoppingRef). No reset needed — the screen navigates away.
    if (finishing) return;
    setFinishing(true);
    try {
      if (page === 2 && (businessName || trade || taxPct)) {
        const pct = parseFloat(taxPct);
        saveProfile({
          ...getProfile(),
          businessName: businessName.trim(),
          trade: trade.trim(),
          taxRate: Number.isFinite(pct) ? pct / 100 : 0,
        });
      }
      const { job, items } = buildExampleJob(new Date().toISOString(), Crypto.randomUUID());
      saveJobWithItems(job, items);
    } catch (err) {
      console.warn('Onboarding completion failed (continuing anyway)', err);
    }
    try { setOnboarded(true); } catch (err) { console.warn('setOnboarded failed', err); }
    router.replace('/');
  };

  const requestMic = async () => {
    try {
      // Result intentionally ignored: the record screen re-checks and guides
      // the user to Settings if denied. Onboarding just primes the prompt.
      await AudioModule.requestRecordingPermissionsAsync();
    } catch (err) {
      console.warn('Mic permission request failed', err);
    }
    // Also primes the weekly-summary notification permission; the scheduler
    // re-checks on every launch and stays silent if denied.
    await requestNotificationPermission();
    // Schedule immediately: the launch-time refresh already ran before the
    // permission existed, so without this the first summary would silently
    // wait for a second launch. (Web resolves the no-op twin.)
    void refreshWeeklySummary();
    setPage(2);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.skip} onPress={finish} disabled={finishing} accessibilityRole="button">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      {page === 0 && (
        <View style={styles.body}>
          <Text style={styles.appName}>{vertical.appName}</Text>
          <Text style={styles.tagline}>{vertical.tagline}</Text>
          <View style={styles.bullets}>
            <Bullet icon="🎙️" text="Talk about the job in the truck" />
            <Bullet icon="✏️" text="Fix anything the AI got wrong in one tap" />
            <Bullet icon="📄" text={`Send a client-ready ${vertical.terminology.quote.toLowerCase()} PDF`} />
          </View>
        </View>
      )}

      {page === 1 && (
        <View style={styles.body}>
          <Text style={styles.header}>Your voice does the paperwork</Text>
          <Text style={styles.copy}>
            {vertical.appName} uses the microphone only while you record a voice
            note — never in the background. Talk through the job and the app
            turns it into a {vertical.terminology.job.toLowerCase()} record with
            line items you can review. Reminders send you one weekly summary of
            how your {vertical.terminology.quote.toLowerCase()}s did — nothing more.
          </Text>
        </View>
      )}

      {page === 2 && (
        <View style={styles.body}>
          <Text style={styles.header}>Quick setup</Text>
          <Text style={styles.copy}>
            This appears on your {vertical.terminology.quote.toLowerCase()} PDFs.
            You can change it any time in My business.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Business name"
            value={businessName}
            onChangeText={setBusinessName}
          />
          <TextInput
            style={styles.input}
            placeholder="Trade (e.g. Fencing, Plumbing)"
            value={trade}
            onChangeText={setTrade}
          />
          <TextInput
            style={styles.input}
            placeholder="Tax % (e.g. 8.5)"
            value={taxPct}
            onChangeText={setTaxPct}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      <View style={styles.footer}>
        {page === 0 && (
          <PrimaryButton title="Next" onPress={() => setPage(1)} />
        )}
        {page === 1 && (
          <>
            <PrimaryButton title="Enable microphone & reminders" onPress={requestMic} />
            <Pressable style={styles.secondaryBtn} onPress={() => setPage(2)}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </>
        )}
        {page === 2 && (
          <PrimaryButton title="Get started" onPress={finish} disabled={finishing} />
        )}
      </View>
    </View>
  );
}

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletIcon}>{icon}</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.primaryBtn, { backgroundColor: vertical.primaryColor }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: 'white' },
  skip: { position: 'absolute', top: 48, right: 24, padding: 8, zIndex: 1 },
  skipText: { color: '#666', fontSize: 16 },
  body: { flex: 1, justifyContent: 'center', gap: 16 },
  appName: { fontSize: 40, fontWeight: '800', textAlign: 'center' },
  tagline: { fontSize: 18, color: '#444', textAlign: 'center', marginBottom: 16 },
  bullets: { gap: 16, marginTop: 16 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletIcon: { fontSize: 24 },
  bulletText: { fontSize: 16, flex: 1 },
  header: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  copy: { fontSize: 16, color: '#444', lineHeight: 24, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, fontSize: 16,
  },
  footer: { gap: 8, paddingBottom: 24 },
  primaryBtn: { borderRadius: 24, padding: 16, alignItems: 'center' },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { padding: 12, alignItems: 'center' },
  secondaryText: { color: '#666', fontSize: 15 },
});
