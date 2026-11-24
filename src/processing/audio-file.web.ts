// Web audio reader: the recorder hands over a blob object URL (MediaRecorder
// output), so read it back with fetch and derive the format from the blob's
// own MIME type. Signatures mirror the native twin (audio-file.ts) exactly.
import { formatFromBlobType } from './audio-format';

import type { AudioPayload } from './audio-file';

export type { AudioPayload };

export async function readAudio(uri: string): Promise<AudioPayload> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const format = formatFromBlobType(blob.type);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ...format };
}

export function deleteAudio(uri: string): void {
  try {
    URL.revokeObjectURL(uri);
  } catch (e) {
    console.warn('audio cleanup failed', e);
  }
}
