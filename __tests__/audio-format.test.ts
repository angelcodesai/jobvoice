import { formatFromBlobType } from '../src/processing/audio-format';

describe('formatFromBlobType', () => {
  it('maps webm blob types (with or without codecs) to webm', () => {
    expect(formatFromBlobType('audio/webm')).toEqual({ ext: 'webm', contentType: 'audio/webm' });
    expect(formatFromBlobType('audio/webm;codecs=opus')).toEqual({
      ext: 'webm',
      contentType: 'audio/webm',
    });
  });

  it('maps mp4/aac blob types to mp4 with audio/mp4 content type', () => {
    expect(formatFromBlobType('audio/mp4')).toEqual({ ext: 'mp4', contentType: 'audio/mp4' });
    expect(formatFromBlobType('audio/mp4;codecs=mp4a.40.2')).toEqual({
      ext: 'mp4',
      contentType: 'audio/mp4',
    });
    expect(formatFromBlobType('audio/aac')).toEqual({ ext: 'mp4', contentType: 'audio/mp4' });
  });

  it('defaults empty or unknown types to webm', () => {
    expect(formatFromBlobType('')).toEqual({ ext: 'webm', contentType: 'audio/webm' });
    expect(formatFromBlobType('application/octet-stream')).toEqual({
      ext: 'webm',
      contentType: 'audio/webm',
    });
  });
});
