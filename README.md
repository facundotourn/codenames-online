# Codenames Online (v2)

Multiplayer en tiempo real de Codenames: salas sincronizadas con estado autoritativo
en un backend [PartyKit](https://www.partykit.io/) (Cloudflare Durable Objects) y un
frontend React + Vite. Reglas completas (spymaster, pista, turnos, adivinanzas), con
soporte para una "mesa compartida" en un televisor durante juntadas presenciales.

> Diseño completo en [`docs/design.html`](docs/design.html). Estado actual: **Fase 4
> (reconexión, persistencia, URL de sala y viabilidad en partida)** del roadmap.

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

> Desplegado en **https://codenames-online.facundotourn.partykit.dev**. En
> producción el front lo sirve el mismo deploy de PartyKit, así que el cliente se
> conecta al host actual (`window.location.host`); en dev usa `localhost:1999`.

## Estructura

```
party/      servidor PartyKit (estado autoritativo, reglas) + tipos compartidos
src/        cliente React + Vite
docs/       documento de diseño
```
