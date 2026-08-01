/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RYBBIT_SITE_ID?: string;
  readonly VITE_RYBBIT_SCRIPT_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
