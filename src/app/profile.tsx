import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Button, StyleSheet, ScrollView, Alert, Platform, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getProfile, saveProfile } from '../db/profile';
import { wipeAllData } from '../db/jobs';
import { getSupabase } from '../supabase';

const EMAIL_RE = /.+@.+\..+/;

export default function ProfileScreen() {
  const router = useRouter();
  const [p, setP] = useState(getProfile());
  const [taxPct, setTaxPct] = useState(String(p.taxRate * 100));
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load the email linked to the current (anonymous) Supabase user, native only.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        setLinkedEmail(data.user?.email || null);
      } catch {
        // Missing .env or no session yet — treat as "no linked email"; the
        // screen must still render for local-only use.
      }
    })();
  }, []);

  const save = () => {
    const pct = parseFloat(taxPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      Alert.alert('Invalid tax rate', 'Enter a percentage between 0 and 100.');
      return;
    }
    try {
      saveProfile({ ...p, taxRate: pct / 100 });
      Alert.alert('Saved');
    } catch {
      Alert.alert('Save failed', 'Please try again.');
    }
  };

  // Link an email to the SAME anonymous uid so cloud data + subscription
  // survive reinstall (restore signs back in as this uid via /restore).
  const linkEmail = async () => {
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setLinking(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ email: addr });
      if (error) throw error;
      Alert.alert('Check your email', 'Tap the confirmation link we sent to finish linking.');
    } catch (err: any) {
      Alert.alert('Linking failed', err?.message ?? 'Please try again.');
    } finally {
      setLinking(false);
    }
  };

  // Permanent account deletion. ORDER MATTERS: the server deletion must
  // succeed BEFORE any local wipe — if we wiped first and the server call
  // failed, the user would look deleted locally while their cloud data (and
  // Play data-safety obligation) lived on.
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      // 1. Server: delete-account edge function removes leftover audio, then
      // deletes the auth user — every server table cascades from it.
      const { error } = await getSupabase().functions.invoke('delete-account');
      if (error) throw error;

      // 2. Local: wipe jobs/line items and reset the profile row
      // (onboarded=0 sends the app back through onboarding).
      wipeAllData();

      // 3. Drop the local session. The server-side user is already gone, so
      // signOut may fail against an invalidated session — that's fine, we
      // only care that the local tokens are cleared.
      try {
        await getSupabase().auth.signOut();
      } catch {
        // Session already invalid after user deletion — ignore.
      }

      // NOTE: RevenueCat is deliberately NOT logged out here. Purchases.logOut
      // would mint a new RC anonymous alias and recreate customer state; the
      // actual subscription lives in Google Play and is managed/cancelled
      // there regardless of what we do.

      router.replace('/onboarding');
    } catch {
      Alert.alert('Deletion failed', 'Please try again or contact support.');
    } finally {
      setDeleting(false);
    }
  };

  // Double confirmation before the irreversible deletion routine.
  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'All jobs, quotes and cloud data will be permanently deleted. Your subscription (if any) is managed separately in Google Play.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () =>
            Alert.alert('This cannot be undone.', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete everything', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Business name</Text>
      <TextInput style={styles.input} value={p.businessName}
        onChangeText={(t) => setP({ ...p, businessName: t })} placeholder="Smith Electrical" />
      <Text style={styles.label}>Trade</Text>
      <TextInput style={styles.input} value={p.trade}
        onChangeText={(t) => setP({ ...p, trade: t })} placeholder="Electrician" />
      <Text style={styles.label}>Currency code</Text>
      <TextInput style={styles.input} value={p.currency} autoCapitalize="characters" maxLength={3}
        onChangeText={(t) => setP({ ...p, currency: t.replace(/[^a-zA-Z]/g, '').toUpperCase() })} placeholder="USD" />
      <Text style={styles.label}>Tax rate (%)</Text>
      <TextInput style={styles.input} value={taxPct} keyboardType="decimal-pad"
        onChangeText={setTaxPct} placeholder="0" />
      <Text style={styles.label}>Quote terms</Text>
      <TextInput style={[styles.input, styles.multiline]} value={p.quoteTerms} multiline
        onChangeText={(t) => setP({ ...p, quoteTerms: t })} />
      <Button title="Save" onPress={save} />

      {Platform.OS !== 'web' && (
        <View style={styles.secureSection}>
          {linkedEmail ? (
            <Text style={styles.secured}>Data secured to {linkedEmail}</Text>
          ) : (
            <>
              <Text style={styles.sectionHeader}>Secure your data</Text>
              <Text style={styles.explainer}>
                Add your email so your jobs and subscription survive a lost or new phone.
              </Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail}
                autoCapitalize="none" keyboardType="email-address"
                placeholder="you@example.com" />
              <View style={styles.buttonSpacer} />
              <Button title="Send confirmation link" onPress={linkEmail} disabled={linking} />
            </>
          )}
          <Pressable onPress={() => router.push('/restore')}>
            <Text style={styles.link}>Restore from another device</Text>
          </Pressable>
        </View>
      )}

      {Platform.OS !== 'web' && (
        <View style={styles.dangerSection}>
          <Text style={styles.dangerHeader}>Danger zone</Text>
          <Pressable
            style={[styles.dangerButton, deleting && styles.dangerButtonDisabled]}
            disabled={deleting}
            onPress={confirmDelete}
          >
            <Text style={styles.dangerButtonText}>
              {deleting ? 'Deleting…' : 'Delete account & data'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  label: { fontWeight: '600', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  secureSection: { marginTop: 32, borderTopWidth: 1, borderColor: '#eee', paddingTop: 16, gap: 8 },
  sectionHeader: { fontWeight: '700', fontSize: 16 },
  explainer: { color: '#666', lineHeight: 20 },
  secured: { color: '#2e7d32', fontWeight: '600' },
  buttonSpacer: { height: 4 },
  link: { color: '#1565c0', textDecorationLine: 'underline', marginTop: 12, textAlign: 'center' },
  dangerSection: { marginTop: 32, borderTopWidth: 1, borderColor: '#eee', paddingTop: 16, gap: 8 },
  dangerHeader: { fontWeight: '700', fontSize: 16, color: '#c62828' },
  dangerButton: {
    borderWidth: 1, borderColor: '#c62828', borderRadius: 8, padding: 12, alignItems: 'center',
  },
  dangerButtonDisabled: { opacity: 0.5 },
  dangerButtonText: { color: '#c62828', fontWeight: '600' },
});
