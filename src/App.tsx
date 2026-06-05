import { useState } from 'react';
import { Room } from './Room';

// Identidad efímera: una por carga de página, así cada pestaña (incluso una pestaña
// duplicada, que copia el storage) entra como un jugador distinto. La reconexión
// persistente entre recargas llega en la Fase 4 (ver docs/design.html §14).
const PLAYER_ID = crypto.randomUUID();

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

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '');
  const [codeInput, setCodeInput] = useState('');
  const [joined, setJoined] = useState<{ room: string; name: string } | null>(null);

  const canEnter = name.trim().length > 0;

  const enter = (room: string) => {
    if (!canEnter) return;
    const finalName = name.trim();
    localStorage.setItem('playerName', finalName);
    setJoined({ room, name: finalName });
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
        onLeave={() => setJoined(null)}
      />
    );
  }

  return (
    <div className="screen">
      <h1><span className="r">Code</span><span className="b">names</span> Online</h1>
      <p className="tag">Fase 0 — scaffold: lobby en tiempo real con PartyKit</p>

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
