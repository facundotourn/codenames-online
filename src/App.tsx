import { useState, useEffect } from 'react';
import { Room } from './Room';
import { ThemeToggle } from './components/ThemeToggle';
import { SpyIcon, SparkleIcon, KeyIcon } from './components/icons';
import { track } from './analytics';

// Identidad por pestaña, persistida en sessionStorage: una recarga (F5) reconecta
// al mismo asiento (§14). Como al DUPLICAR una pestaña el navegador copia el
// sessionStorage, llevamos en localStorage un registro de los ids "vivos" (con
// heartbeat): si el id ya está activo en otra pestaña, es una duplicada y se
// acuña uno nuevo — así cada pestaña entra como un jugador distinto.
const LIVE_KEY = 'livePlayerIds';
const HEARTBEAT_MS = 4000;
const STALE_MS = 12000; // un id sin heartbeat reciente se considera muerto (crash)

function readLive(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LIVE_KEY) ?? '{}'); } catch { return {}; }
}
function writeLive(map: Record<string, number>) {
  localStorage.setItem(LIVE_KEY, JSON.stringify(map));
}

function getPlayerId(): string {
  const now = Date.now();
  const live = readLive();
  for (const [k, t] of Object.entries(live)) if (now - t > STALE_MS) delete live[k];

  let id = sessionStorage.getItem('playerId');
  // Sin id, o el id ya está vivo en otra pestaña (duplicada) → uno nuevo.
  if (!id || live[id] !== undefined) {
    id = crypto.randomUUID();
    sessionStorage.setItem('playerId', id);
  }
  live[id] = now;
  writeLive(live);

  const beat = () => { const m = readLive(); m[id!] = Date.now(); writeLive(m); };
  setInterval(beat, HEARTBEAT_MS);
  window.addEventListener('pagehide', () => { const m = readLive(); delete m[id!]; writeLive(m); });

  return id;
}
const PLAYER_ID = getPlayerId();

// Código de sala: 4 caracteres alfanuméricos en mayúscula. Excluye caracteres
// ambiguos (0/O, 1/I/L) para que sea fácil de leer y compartir de viva voz.
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

// La sala vive en la URL (/room/{code}), así un F5 te devuelve a la sala y
// reconecta al asiento (§14) en vez de mandarte a la pantalla inicial.
function parseRoom(): string | null {
  const m = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)\/?$/);
  return m ? m[1].toUpperCase() : null;
}

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '');
  const [codeInput, setCodeInput] = useState(() => parseRoom() ?? '');
  // `fresh` marca una sala recién creada por mí (para el loader "Creando tu sala…");
  // al reconectar por F5 o back/forward es un reingreso, así que va en false.
  const [joined, setJoined] = useState<{ room: string; name: string; fresh: boolean } | null>(() => {
    const room = parseRoom();
    const storedName = (localStorage.getItem('playerName') ?? '').trim();
    return room && storedName ? { room, name: storedName, fresh: false } : null;
  });

  const canEnter = name.trim().length > 0;

  // Mantener el estado en sync con back/forward del navegador.
  useEffect(() => {
    const onPop = () => {
      const room = parseRoom();
      const storedName = (localStorage.getItem('playerName') ?? '').trim();
      setJoined(room && storedName ? { room, name: storedName, fresh: false } : null);
      if (room) setCodeInput(room);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const enter = (room: string, fresh = false) => {
    if (!canEnter) return;
    const finalName = name.trim();
    const code = room.toUpperCase();
    localStorage.setItem('playerName', finalName);
    window.history.pushState({}, '', `/room/${code}`);
    setJoined({ room: code, name: finalName, fresh });
  };

  const leave = () => {
    window.history.pushState({}, '', '/');
    setJoined(null);
  };

  const createRoom = () => {
    track('room_created');
    enter(generateRoomCode(), true);
  };
  const joinRoom = () => {
    const room = codeInput.trim().toUpperCase();
    if (room) { track('room_joined'); enter(room, false); }
  };

  if (joined) {
    return (
      <Room
        playerId={PLAYER_ID}
        room={joined.room}
        name={joined.name}
        creating={joined.fresh}
        onLeave={leave}
      />
    );
  }

  return (
    <div className="screen welcome">
      <div className="screen-top"><ThemeToggle /></div>
      <div className="hero">
        <div className="hero-logo"><SpyIcon size={46} /></div>
        <h1><span className="r">Code</span><span className="b">names</span> <span className="hero-on">Online</span></h1>
        <p className="tag">Multiplayer en tiempo real · jugá con amigos en cualquier lado</p>
      </div>

      <label className="name-field">
        <span className="name-label">¿Cómo te llamás?</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Tu nombre"
          autoFocus
        />
      </label>

      <div className="entry-cards">
        <section className="entry-card">
          <div className="entry-head">
            <div className="entry-icon create"><SparkleIcon size={22} /></div>
            <h3>Crear una sala</h3>
          </div>
          <p>Empezá una partida nueva y compartí el código con tu gente.</p>
          <button className="btn-pop entry-action" onClick={createRoom} disabled={!canEnter}>
            Crear sala
          </button>
        </section>

        <section className="entry-card">
          <div className="entry-head">
            <div className="entry-icon join"><KeyIcon size={22} strokeWidth={2.6} /></div>
            <h3>Unirse a una sala</h3>
          </div>
          <p>¿Te pasaron un código? Ingresalo y sumate.</p>
          <div className="join-row">
            <input
              className="code-input"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              placeholder="CÓDIGO"
              maxLength={4}
            />
            <button
              className="ghost"
              onClick={joinRoom}
              disabled={!canEnter || codeInput.trim().length === 0}
            >
              Unirse
            </button>
          </div>
        </section>
      </div>

      {!canEnter && <p className="hint">Poné tu nombre para crear o unirte a una sala.</p>}
    </div>
  );
}
