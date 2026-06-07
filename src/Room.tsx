import { useEffect, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { GameState, ClientMessage, ServerMessage } from '../party/types';
import { Lobby } from './Lobby';
import { GameScreen } from './GameScreen';

// En dev, el server PartyKit corre aparte en :1999; en producción el front lo
// sirve el mismo deploy, así que conectamos al host actual. Se puede forzar con
// VITE_PARTYKIT_HOST.
const HOST = import.meta.env.VITE_PARTYKIT_HOST
  ?? (import.meta.env.DEV ? 'localhost:1999' : window.location.host);

interface Props {
  playerId: string;
  room: string;
  name: string;
  onLeave: () => void;
}

export function Room({ playerId, room, name, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket = usePartySocket({
    host: HOST,
    room,
    id: playerId,
    query: { name },
    onMessage(event) {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'state') setState(msg.state);
      else if (msg.type === 'error') setError(msg.message);
    },
  });

  // Auto-descartar el error tras unos segundos.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));

  if (!state) {
    return <div className="screen"><p className="tag">Conectando a la sala…</p></div>;
  }

  const me = state.players[playerId];
  const shared = { state, me, room, send, onLeave, error };

  return state.phase === 'lobby'
    ? <Lobby {...shared} />
    : <GameScreen {...shared} />;
}
