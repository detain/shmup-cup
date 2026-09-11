/**
 * Build-time environment typings. Vite replaces `import.meta.env.*` with literal values during the build,
 * so nothing here exists at runtime (the shipped `app.js` never references `import.meta`).
 */
/// <reference types="vite/client" />

/** Variables read from the environment (or a `.env` file) at build time; only `VITE_*` names are exposed. */
interface ImportMetaEnv {
  /** Base URL of the optional log server, e.g. `http://192.168.1.20:8787`. Empty/undefined = reporting off. */
  readonly VITE_REPORT_URL?: string;
}

/** `import.meta` as seen by the app sources. */
interface ImportMeta {
  /** Build-time environment (see {@link ImportMetaEnv}). */
  readonly env: ImportMetaEnv;
}
