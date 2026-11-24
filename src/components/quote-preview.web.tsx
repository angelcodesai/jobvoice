import { unstable_createElement } from 'react-native-web';

export interface QuotePreviewProps {
  html: string;
}

// Web implementation: react-native-webview has no web support, so render the
// quote HTML in a sandboxed-by-srcDoc iframe instead.
export default function QuotePreview({ html }: QuotePreviewProps) {
  return unstable_createElement('iframe', {
    srcDoc: html,
    style: { flex: 1, border: 0, width: '100%' },
  });
}
