/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Host del servidor PartyKit. En dev por defecto `localhost:1999`. */
  readonly VITE_PARTYKIT_HOST?: string;
  /** Measurement ID de Google Analytics (G-XXXXXXXX). Si falta, GA se desactiva. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
