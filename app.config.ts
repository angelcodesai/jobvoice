// Dynamic Expo config: overlays vertical identity onto the static app.json base.
// Expo loads app.json first, then this function receives it as `config`.
// First real EAS build: run `eas init` to add the projectId (autoIncrement +
// remote version source need it).
import { ExpoConfig, ConfigContext } from 'expo/config';
// Explicit .ts extension: Node's CJS/ESM resolvers only load .ts files when the
// extension is spelled out (Node 22 type stripping does no extension searching).
import { getVertical } from './src/verticals/index.ts';

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = getVertical(process.env.EXPO_PUBLIC_VERTICAL);
  return {
    ...config,
    name: v.appName,
    slug: config.slug ?? 'jobvoice',
    android: {
      ...config.android,
      package: v.android.package,
    },
  };
};
