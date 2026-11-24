// Native audio reader: expo-file-system File API. Reads the recording's bytes
// and reports its format for upload. The web twin (audio-file.web.ts) fetches
// a MediaRecorder blob URL instead — keep the export signatures identical.
import { File } from 'expo-file-system';

import type { AudioFormat } from './audio-format';

export interface AudioPayload extends AudioFormat {
  bytes: Uint8Array;
}

export async function readAudio(uri: string): Promise<AudioPayload> {
  const file = new File(uri);
  // expo-audio's HIGH_QUALITY preset records AAC in an m4a container on both
  // iOS and Android, so the format is static here.
  return { bytes: await file.bytes(), ext: 'm4a', contentType: 'audio/mp4' };
}

export function deleteAudio(uri: string): void {
  try {
    new File(uri).delete();
  } catch (e) {
    console.warn('audio cleanup failed', e);
  }
}
