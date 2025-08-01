/// <reference types="vite/client" />

// https://vite.dev/guide/env-and-mode.html#intellisense-for-typescript
interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  // strictImportMetaEnv: unknown
}

// https://vite.dev/guide/env-and-mode.html#built-in-constants
interface ImportMetaEnv {
  /**
   * the base URL of the Archestra API gateway server
   */
  readonly VITE_ARCHESTRA_GATEWAY_SERVER_BASE_URL: string;

  /**
   * the URL of the Archestra WebSocket server
   */
  readonly VITE_ARCHESTRA_WEBSOCKET_SERVER_URL: string;

  /**
   * whether the app is running in development (always the opposite of `import.meta.env.PROD`)
   */
  readonly DEV: boolean;

  /**
   * whether the app is running in production (running the dev server with `NODE_ENV='production'` or running an app
   * built with `NODE_ENV='production'`)
   */
  readonly PROD: boolean;

  /**
   * the [mode](https://vite.dev/guide/env-and-mode.html#modes) the app is running in
   */
  readonly MODE: 'desktop.dev' | 'desktop.production' | 'web.local' | 'web.dev' | 'web.production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
