import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useAudioRecorder, RecordingPresets, AudioModule, useAudioRecorderState, setAudioModeAsync,
} from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { vertical } from '../verticals';

const MAX_SECONDS = 15 * 60;

// Native recorder (expo-audio, m4a). The web twin (recorder.web.tsx) records
// via MediaRecorder — Metro resolves the .web extension for browser bundles.
// On stop, both navigate to /job/[id] with a fresh jobId and the audio URI.
export default function Recorder() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const [granted, setGranted] = useState<boolean | null>(null);
  const stoppingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      setGranted(status.granted);
      if (status.granted) {
        try {
          // Required on iOS so recording works even when the device's silent
          // switch is on, and to put the audio session into record mode.
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        } catch (err) {
          // Non-fatal: recording may still work without this; surface for diagnosis
          // rather than letting it become an unhandled rejection.
          console.warn('setAudioModeAsync failed', err);
        }
      }
    })();
  }, []);

  const start = useCallback(async () => {
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.warn('Failed to start recording', err);
      Alert.alert('Recording error', 'Please try again.');
    }
  }, [recorder]);

  const stopAndProcess = useCallback(async () => {
    // Guard against double-fire: a tap on "Stop" racing the max-duration
    // effect, or the 500ms state poll ticking again while the first
    // `recorder.stop()` call is still resolving (isRecording stays true
    // until it settles), would otherwise call stop() twice and create two
    // job ids / two navigations.
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert('Recording failed', 'No audio was captured. Please try again.');
        stoppingRef.current = false;
        return;
      }
      const jobId = Crypto.randomUUID();
      router.replace({ pathname: '/job/[id]', params: { id: jobId, audioUri: uri } });
      // No reset on success: we're navigating away from this screen.
    } catch (err) {
      console.warn('Failed to stop recording', err);
      Alert.alert('Recording error', 'Please try again.');
      stoppingRef.current = false;
    }
  }, [recorder, router]);

  useEffect(() => {
    // Threshold check runs on a 500ms poll, so we may overshoot the cap by
    // up to one poll interval; that's accepted rather than adding a timer.
    if (state.isRecording && state.durationMillis >= MAX_SECONDS * 1000) stopAndProcess();
  }, [state.isRecording, state.durationMillis, stopAndProcess]);

  if (granted === null) {
    return (
      <View style={styles.center}>
        <Text>Checking microphone permission…</Text>
      </View>
    );
  }

  if (granted === false) {
    return (
      <View style={styles.center}>
        <Text>Microphone access is required to record voice notes.</Text>
        <Text>Enable it in Settings → Apps → {vertical.appName} → Permissions.</Text>
      </View>
    );
  }

  const secs = Math.floor(state.durationMillis / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <View style={styles.center}>
      <Text style={styles.timer}>{mm}:{ss}</Text>
      <Text style={styles.hint}>{vertical.recordHint}</Text>
      {!state.isRecording ? (
        <Button title="● Start recording" onPress={start} />
      ) : (
        <Button title="■ Stop & process" onPress={stopAndProcess} />
      )}
      <View style={{ height: 16 }} />
      <Button title="Cancel" color="#888" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  timer: { fontSize: 48, fontVariant: ['tabular-nums'] },
  hint: { textAlign: 'center', color: '#666' },
});
