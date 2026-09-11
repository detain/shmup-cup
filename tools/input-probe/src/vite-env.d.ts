/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the optional log server, e.g. `http://192.168.1.20:8787`. Empty/undefined = reporting off. */
  readonly VITE_REPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
