// Restore data on a new device: sign in with an email OTP to become the
// ORIGINAL uid the email was linked to (profile → "Secure your data"), then
// pull that account's jobs. The existing verified entitlement row applies to
// the same uid, so the subscription follows too.
import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabase } from '../supabase';
import { startupSync } from '../sync';
import { setLastSyncAt } from '../db/profile';
import { logInAs } from '../monetization/purchases';

const EMAIL_RE = /.+@.+\..+/;

export default function RestoreScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Web preview's store is ephemeral and Supabase auth flows are native-only.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.webMessage}>Restore is available in the mobile app.</Text>
      </View>
    );
  }

  const sendCode = async () => {
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false },
      });
      if (error) {
        // With shouldCreateUser: false, an unknown email surfaces as a
        // "signups not allowed" error — translate to friendly copy.
        if (/signup/i.test(error.message)) {
          Alert.alert('No account found for that email.');
          return;
        }
        throw error;
      }
      setPhase('code');
    } catch (err: any) {
      Alert.alert('Could not send code', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const { data, error } = await getSupabase().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error || !data.session) {
        Alert.alert('Invalid code, try again.');
        return;
      }
      // The Supabase session just switched to a DIFFERENT uid (the original
      // account). RevenueCat may already be configured with the old anonymous
      // appUserID (module-level flag in src/monetization/purchases.ts), so
      // re-identify it with the restored uid — otherwise purchases made now
      // would attach to the abandoned anonymous user. Failure is non-fatal:
      // the entitlement still reconciles via getCustomerInfo later.
      try {
        await logInAs(data.session.user.id);
      } catch (e) {
        console.warn('RevenueCat logIn after restore failed', e);
      }
      // The local lastSyncAt watermark was advanced by syncs under the
      // throwaway anonymous account and survives the session switch. Left in
      // place, startupSync would filter out every row the ORIGINAL account
      // wrote before that instant — "restoring" nothing. Reset it so the pull
      // fetches the restored account's full history.
      setLastSyncAt('');
      const ok = await startupSync();
      Alert.alert(
        ok ? 'Data restored' : 'Signed in — some data may still be syncing',
        ok
          ? 'Your jobs from this account are now on this device.'
          : 'We could not pull everything just yet. Your data will finish syncing next time you open the app.'
      );
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {phase === 'email' ? (
        <>
          <Text style={styles.explainer}>
            Enter the email you secured your data with on your old device. We'll send a
            6-digit code to sign you back in.
          </Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address"
            placeholder="you@example.com" autoFocus />
          <Button title="Send code" onPress={sendCode} disabled={busy} />
        </>
      ) : (
        <>
          <Text style={styles.explainer}>Enter the 6-digit code we sent to {email.trim()}.</Text>
          <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode}
            keyboardType="number-pad" maxLength={6} placeholder="123456" autoFocus />
          <Button title="Verify" onPress={verify} disabled={busy} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  webMessage: { color: '#666', textAlign: 'center' },
  explainer: { color: '#666', lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  code: { textAlign: 'center', fontSize: 20, letterSpacing: 8 },
});
