# Codenames Online (v2)

Multiplayer en tiempo real de Codenames: salas sincronizadas con estado autoritativo
en un backend [PartyKit](https://www.partykit.io/) (Cloudflare Durable Objects) y un
frontend React + Vite. Reglas completas (spymaster, pista, turnos, adivinanzas), con
soporte para una "mesa compartida" en un televisor durante juntadas presenciales.

> Diseño completo en [`docs/design.html`](docs/design.html). Estado actual: **Fase 5
> (sugerencia de pista por IA)** del roadmap.

## Desarrollo

Requiere dos procesos (en dos terminales):

```bash
npm run dev:party   # servidor PartyKit en http://localhost:1999
npm run dev:web     # cliente Vite en http://localhost:5173
```

El cliente se conecta al host de `VITE_PARTYKIT_HOST` (por defecto `localhost:1999`).
Abrí dos pestañas en la misma sala para ver la sincronización en vivo.

## Build y deploy

```bash
npm run build       # type-check (tsc) + build del cliente a dist/
npm run deploy      # partykit deploy → Cloudflare (sirve también dist/)
```

La sugerencia de pista por IA (§13) necesita la key de Anthropic en el server:

```bash
npx partykit secret put ANTHROPIC_API_KEY   # producción
# en dev: crear un archivo .env en la raíz con ANTHROPIC_API_KEY=sk-ant-...
```

## Analytics (Google Analytics 4)

Opcional. Las **visitas** y eventos de uso (`room_created`, `room_joined`) los
manda el cliente con gtag.js; los **eventos de juego** (`game_started` y
`turn_ended` con la pista, el número y las palabras reveladas) los manda el
server vía [Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
(es el único con la verdad completa, y evita duplicados).

Necesita un Measurement ID (`G-XXXXXXXX`) y un API secret (GA4 → Admin → Data
Streams → tu stream → *Measurement Protocol API secrets*), todos apuntando a la
**misma** propiedad GA4:

```bash
# Cliente (se inlinea en build; debe estar antes de `npm run build`):
#   en .env →  VITE_GA_MEASUREMENT_ID=G-XXXXXXXX
# Server (producción):
npx partykit secret put GA_MEASUREMENT_ID    # G-XXXXXXXX
npx partykit secret put GA_API_SECRET        # el API secret del stream
#   en dev: agregar GA_MEASUREMENT_ID y GA_API_SECRET al mismo .env
```

Sin estas variables, analytics queda **desactivado** (no-op). El cliente además
no envía nada en dev (`npm run dev:web`), para no ensuciar las métricas. Para
minar las "mejores pistas" palabra por palabra conviene activar el export
gratuito de GA4 a **BigQuery** (GA trunca los params de texto a 100 chars).

> Desplegado en **https://codenames-online.facundotourn.partykit.dev**. En
> producción el front lo sirve el mismo deploy de PartyKit, así que el cliente se
> conecta al host actual (`window.location.host`); en dev usa `localhost:1999`.

## Estructura

```
party/      servidor PartyKit (estado autoritativo, reglas) + tipos compartidos
src/        cliente React + Vite
docs/       documento de diseño
```
