import { useState, useEffect } from 'react';
import { Room } from './Room';

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
  const [joined, setJoined] = useState<{ room: string; name: string } | null>(() => {
    const room = parseRoom();
    const storedName = (localStorage.getItem('playerName') ?? '').trim();
    return room && storedName ? { room, name: storedName } : null;
  });

  const canEnter = name.trim().length > 0;

  // Mantener el estado en sync con back/forward del navegador.
  useEffect(() => {
    const onPop = () => {
      const room = parseRoom();
      const storedName = (localStorage.getItem('playerName') ?? '').trim();
      setJoined(room && storedName ? { room, name: storedName } : null);
      if (room) setCodeInput(room);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const enter = (room: string) => {
    if (!canEnter) return;
    const finalName = name.trim();
    const code = room.toUpperCase();
    localStorage.setItem('playerName', finalName);
    window.history.pushState({}, '', `/room/${code}`);
    setJoined({ room: code, name: finalName });
  };

  const leave = () => {
    window.history.pushState({}, '', '/');
    setJoined(null);
  };

  const createRoom = () => enter(generateRoomCode());
  const joinRoom = () => {
    const room = codeInput.trim().toUpperCase();
    if (room) enter(room);
  };

  if (joined) {
    return (
      <Room
        playerId={PLAYER_ID}
        room={joined.room}
        name={joined.name}
        onLeave={leave}
      />
    );
  }

  return (
    <div className="screen">
      <h1><span className="r">Code</span><span className="b">names</span> Online</h1>
      <p className="tag">Multiplayer en tiempo real · creá una sala y compartí el código</p>

      <div className="form">
        <label>
          Nombre
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tu nombre"
            autoFocus
          />
        </label>

        <div className="entry-options">
          <button onClick={createRoom} disabled={!canEnter}>Crear sala nueva</button>

          <div className="sep"><span>o</span></div>

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
        </div>

        {!canEnter && <p className="hint">Ingresá tu nombre para crear o unirte a una sala.</p>}
      </div>
    </div>
  );
}
