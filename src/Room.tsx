import { useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { GameState, ServerMessage } from '../party/types';

const HOST = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999';

interface Props {
  playerId: string;
  room: string;
  name: string;
  onLeave: () => void;
}

export function Room({ playerId, room, name, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const socket = usePartySocket({
    host: HOST,
    room,
    id: playerId,
    query: { name },
    onMessage(event) {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'state') setState(msg.state);
      else if (msg.type === 'error') setLastError(msg.message);
    },
  });

  const send = (data: unknown) => socket.send(JSON.stringify(data));

  const me = state?.players[playerId];
  const players = state ? Object.values(state.players) : [];

  return (
    <div className="screen">
      <header className="room-head">
        <div>
          <h2>Sala <code>{room}</code></h2>
          <p className="tag">Conectado como <strong>{me?.name ?? name}</strong></p>
        </div>
        <button className="ghost" onClick={onLeave}>Salir</button>
      </header>

      <section className="panel">
        <h3>Participantes ({players.length})</h3>
        <ul className="players">
          {players.map(p => (
            <li key={p.id} className={p.connected ? '' : 'offline'}>
              <span className={`dot ${p.connected ? 'on' : 'off'}`} />
              <span className="pname">{p.name}</span>
              {state?.hostId === p.id && <span className="badge host">host</span>}
              {p.id === playerId && <span className="badge you">vos</span>}
              {p.ready && <span className="badge ready">listo</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Acciones (demo Fase 0)</h3>
        <div className="actions">
          <button onClick={() => send({ type: 'setReady', value: !me?.ready })}>
            {me?.ready ? 'Marcar no listo' : 'Marcar listo'}
          </button>
          <button
            className="ghost"
            onClick={() => send({ type: 'startGame' })}
            title="Aún no implementado: el server responde con un error"
          >
            Probar startGame (no impl.)
          </button>
        </div>
        {lastError && <p className="err">⚠ {lastError}</p>}
      </section>
    </div>
  );
}
