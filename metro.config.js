const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WASM build (web/wa-sqlite/wa-sqlite.wasm);
// Metro must treat .wasm as an asset or web bundling fails.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (used by expo-sqlite's wa-sqlite worker channel) requires
// cross-origin isolation, so the dev server must send COEP/COOP headers.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
