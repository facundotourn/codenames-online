/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Host del servidor PartyKit. En dev por defecto `localhost:1999`. */
  readonly VITE_PARTYKIT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
