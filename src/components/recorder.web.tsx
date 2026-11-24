import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { vertical } from '../verticals';

const MAX_SECONDS = 15 * 60;

// Preference order for MediaRecorder output. Chrome/Firefox record
// webm/opus; Safari 18+ records mp4 (it has no webm encoder).
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

// Web recorder: captures mic audio with MediaRecorder and hands the blob to
// the job screen as an object URL — the same { id, audioUri } contract as the
// native recorder, so the processing pipeline is entered identically.
export default function Recorder() {
  const router = useRouter();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  // ── Recorder state machine (refs are the synchronous truth; React state is
  //    only render truth and can lag behind by a tick) ────────────────────────
  // startingRef  — true from start() entry (set BEFORE any await) until a
  //                failure path returns or an empty-blob stop resets it for
  //                retry. Blocks re-entrant start() across its awaits: a fast
  //                double-tap would otherwise acquire two streams and orphan
  //                the first (mic leak unreachable by cleanup).
  // stoppingRef  — true from stopAndProcess() entry. Blocks double-stop (Stop
  //                tap racing the 15-min-cap tick). Reset only on paths that
  //                keep the user on this screen (inactive recorder, empty
  //                blob); never reset on the hand-off path.
  // discardedRef — set UNCONDITIONALLY on unmount and never unset. Serves two
  //                roles: (a) liveness flag for start()'s post-permission-
  //                prompt check, so a stream granted after the screen died is
  //                stopped immediately; (b) tells a late onstop (queued by a
  //                Stop tap just before Back/Cancel) to discard instead of
  //                router.replace-ing the user off their Back destination.
  // handedOffRef — set just before router.replace, once the blob URL belongs
  //                to the job screen; unmount cleanup must NOT revoke it then.
  // objectUrlRef — the created blob URL, revoked on unmount iff never handed
  //                off.
  // Invariants: navigation happens at most once — it only occurs inside
  // onstop, which fires at most once per recorder (startingRef guarantees at
  // most one recorder), and discardedRef suppresses it after unmount. Every
  // acquired MediaStream is stopped by exactly one owner — onstop for a
  // finalized recording, unmount cleanup for a live stream, start()'s
  // liveness check for a stream acquired after unmount.
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const discardedRef = useRef(false);
  const handedOffRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  const stopAndProcess = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      stoppingRef.current = false;
      return;
    }
    // Finalization happens in the recorder's `onstop` handler (set in start),
    // after the browser has flushed the final `dataavailable` chunk.
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    // startingRef is set synchronously, BEFORE any await: `isRecording` alone
    // can't close the async gap, so a fast double-tap on Start would run two
    // getUserMedia calls and orphan the first stream/recorder/interval.
    if (startingRef.current || isRecording || stoppingRef.current) return;
    startingRef.current = true;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      startingRef.current = false;
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      setSupported(false);
      startingRef.current = false;
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('Microphone access rejected', err);
      setGranted(false);
      startingRef.current = false;
      return;
    }
    // Liveness check: the permission prompt is modal and async — the user may
    // have left this screen (Cancel/Back) and only then clicked Allow. The
    // unmount cleanup already ran and could not stop THIS stream, so stop it
    // here or the mic stays live (red tab indicator) with no owner, and the
    // 15-min cap would later navigate from a dead screen.
    if (discardedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      startingRef.current = false;
      return;
    }
    setGranted(true);

    let recorder: MediaRecorder;
    try {
      // 64 kbps: ample for speech, and it keeps a max-length (15 min)
      // recording near ~7MB — safely under the server's hard 15MB cap.
      // Chrome's default (~128 kbps) would land a full-length note at
      // ~14.4MB, brushing that cap.
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    } catch (err) {
      console.warn('MediaRecorder construction failed', err);
      stream.getTracks().forEach((t) => t.stop());
      setSupported(false);
      startingRef.current = false;
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = (e) => {
      console.warn('MediaRecorder error', e);
      setError('Recording failed. Please try again.');
    };
    recorder.onstop = () => {
      // Centralized here, not only in stopAndProcess: the browser can stop
      // the recorder spontaneously (e.g. mid-recording permission
      // revocation), and the timer must not keep ticking in any stop path.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (discardedRef.current) return; // screen was left mid-recording
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      stream.getTracks().forEach((t) => t.stop());
      if (blob.size === 0) {
        // Recoverable: reset both guards so Start works again.
        setIsRecording(false);
        setError('No audio was captured. Please try again.');
        stoppingRef.current = false;
        startingRef.current = false;
        return;
      }
      const audioUri = URL.createObjectURL(blob);
      objectUrlRef.current = audioUri;
      handedOffRef.current = true;
      router.replace({
        pathname: '/job/[id]',
        params: { id: Crypto.randomUUID(), audioUri },
      });
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    intervalRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      // May overshoot the cap by up to one 500ms tick — accepted, matching
      // the native recorder's polling behavior.
      if (ms >= MAX_SECONDS * 1000) stopAndProcess();
    }, 500);
  }, [isRecording, router, stopAndProcess]);

  useEffect(() => {
    // Unmount cleanup: stop the timer, discard any in-flight recording, and
    // release the mic. Revoke the blob URL only if it was never handed to the
    // job screen — after hand-off the pipeline owns its lifetime.
    return () => {
      // UNCONDITIONAL, not only when a recorder is still active: a Stop tap
      // immediately followed by Back/Cancel leaves an onstop already queued;
      // if it ran after this unmount it would router.replace the user off
      // their Back destination. Safe for the success path — a hand-off's
      // onstop always runs before the unmount it causes. This flag is also
      // the liveness signal for start()'s post-getUserMedia check.
      discardedRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (err) {
          console.warn('Failed to stop recorder on unmount', err);
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (!handedOffRef.current && objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  if (!supported) {
    return (
      <View style={styles.center}>
        <Text>Recording isn&apos;t supported in this browser.</Text>
        <Text style={styles.hint}>
          Try a current version of Chrome, Firefox, or Safari — or record in the mobile app.
        </Text>
      </View>
    );
  }

  if (granted === false) {
    return (
      <View style={styles.center}>
        <Text>Microphone access is required to record voice notes.</Text>
        <Text>Allow microphone access for this site in your browser settings, then reload.</Text>
      </View>
    );
  }

  const secs = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <View style={styles.center}>
      <Text style={styles.timer}>{mm}:{ss}</Text>
      <Text style={styles.hint}>{vertical.recordHint}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!isRecording ? (
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
  error: { textAlign: 'center', color: '#c00' },
});
