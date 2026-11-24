import Recorder from '../components/recorder';

// Thin route: the platform-specific recorder lives in src/components/recorder
// (native expo-audio) with a MediaRecorder-based web twin (recorder.web.tsx)
// that Metro resolves for browser bundles.
export default function RecordScreen() {
  return <Recorder />;
}
