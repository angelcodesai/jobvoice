// react-native-web ships no TypeScript definitions. Declare only the single
// export we use (rendering a raw DOM element from a .web.tsx file).
declare module 'react-native-web' {
  import type * as React from 'react';
  export function unstable_createElement(
    type: string,
    props?: Record<string, unknown>,
  ): React.ReactElement;
}
