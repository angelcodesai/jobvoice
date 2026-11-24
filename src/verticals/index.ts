// NOTE: explicit .ts extensions + `import type` so Node's type-stripping loader
// can execute this chain when app.config.ts imports it (Node requires explicit
// extensions and explicit type-only imports). Metro/Jest/tsc all accept this
// (tsconfig sets allowImportingTsExtensions).
import type { VerticalConfig } from './types.ts';
import { jobvoice } from './jobvoice.ts';

export const VERTICALS: Record<string, VerticalConfig> = { jobvoice };

export function getVertical(key: string | undefined): VerticalConfig {
  const k = key ?? 'jobvoice';
  const v = VERTICALS[k];
  if (!v) throw new Error(`Unknown vertical "${k}". Known: ${Object.keys(VERTICALS).join(', ')}`);
  return v;
}

/** The vertical this binary was built for (Metro inlines EXPO_PUBLIC_* at build time). */
export const vertical: VerticalConfig = getVertical(process.env.EXPO_PUBLIC_VERTICAL);
export type { VerticalConfig };
