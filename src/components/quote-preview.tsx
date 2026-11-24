import { WebView } from 'react-native-webview';

export interface QuotePreviewProps {
  html: string;
}

// Native implementation. Web uses quote-preview.web.tsx (Metro resolves the
// platform extension), which keeps react-native-webview out of web bundles.
export default function QuotePreview({ html }: QuotePreviewProps) {
  return <WebView source={{ html, baseUrl: '' }} style={{ flex: 1 }} />;
}
