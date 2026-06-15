// Google Analytics (GA4) del lado del cliente: métricas de tráfico (visitas) y
// un par de eventos de uso (sala creada / unido). Los eventos de juego con la
// verdad completa (pista, palabras, número) los manda el server por separado
// vía Measurement Protocol — ver party/server.ts (sendGAEvent).
//
// Solo se activa si hay measurement id Y no estamos en dev, para no ensuciar las
// métricas con pruebas locales.
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const ENABLED = !!MEASUREMENT_ID && !import.meta.env.DEV;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Inyecta gtag.js y registra el page_view inicial. Idempotente.
export function initAnalytics(): void {
  if (!ENABLED || typeof document === 'undefined' || window.gtag) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => { window.dataLayer!.push(args); };
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID);
}

// Evento de uso. No-op si GA está desactivado o todavía no cargó.
export function track(event: string, params?: Record<string, unknown>): void {
  if (!ENABLED || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, params ?? {});
}
