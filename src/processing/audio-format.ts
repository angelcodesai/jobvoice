// Pure mapping from a recorded Blob's MIME type to the storage extension and
// upload content type. Shared (no platform suffix) so the web audio reader can
// use it AND it stays importable under jest's native platform resolution.

export interface AudioFormat {
  ext: 'm4a' | 'webm' | 'mp4';
  contentType: string;
}

export function formatFromBlobType(type: string): AudioFormat {
  // Blob types can carry codec parameters, e.g. 'audio/webm;codecs=opus'.
  const base = type.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/aac') {
    return { ext: 'mp4', contentType: 'audio/mp4' };
  }
  // webm explicitly, and the default for empty/unknown types: Chrome's
  // MediaRecorder records webm/opus, so it is the overwhelmingly likely
  // reality when the browser didn't label the blob.
  return { ext: 'webm', contentType: 'audio/webm' };
}
