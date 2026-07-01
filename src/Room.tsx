import { useEffect, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import type { GameState, ClientMessage, ServerMessage, Phase } from '../party/types';
import type { ClueSuggestion } from './viewProps';
import { Lobby } from './Lobby';
import { GameScreen } from './GameScreen';
import { SpymasterDraft } from './components/SpymasterDraft';
import { useTurnNotification } from './useTurnNotification';

// En dev, el server PartyKit corre aparte en :1999; en producción el front lo
// sirve el mismo deploy, así que conectamos al host actual. Se puede forzar con
// VITE_PARTYKIT_HOST.
const HOST = import.meta.env.VITE_PARTYKIT_HOST
  ?? (import.meta.env.DEV ? 'localhost:1999' : window.location.host);

interface Props {
  playerId: string;
  room: string;
  name: string;
  creating?: boolean;
  onLeave: () => void;
}

// Loading temático mientras se conecta: tres cartitas (rojo · violeta · azul)
// que se dan vuelta en secuencia, con el código de la sala.
function Connecting({ room, creating }: { room: string; creating?: boolean }) {
  return (
    <div className="screen connecting">
      <div className="loader">
        <div className="loader-cards" aria-hidden="true">
          <span className="lc lc-red" />
          <span className="lc lc-neutral" />
          <span className="lc lc-blue" />
        </div>
        <p className="loader-text">
          {creating ? 'Creando tu sala' : 'Entrando a la sala'} <code className="room-code">{room}</code>…
        </p>
      </div>
    </div>
  );
}

// Loader breve al salir del lobby para que se sienta el inicio de la partida
// (sino caés de golpe en el tablero y marea).
function StartingGame() {
  return (
    <div className="screen connecting">
      <div className="loader">
        <div className="loader-cards" aria-hidden="true">
          <span className="lc lc-red" />
          <span className="lc lc-neutral" />
          <span className="lc lc-blue" />
        </div>
        <p className="loader-text">Comenzando la partida…</p>
      </div>
    </div>
  );
}

// Cuánto dura el loader de "comenzando la partida".
const STARTING_MS = 1500;

export function Room({ playerId, room, name, creating, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ClueSuggestion | null>(null);
  // Loader breve al arrancar la partida desde el lobby (ver efecto más abajo).
  const [starting, setStarting] = useState(false);
  const prevPhase = useRef<Phase | null>(null);

  const socket = usePartySocket({
    host: HOST,
    room,
    id: playerId,
    query: { name },
    onMessage(event) {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'state') {
        setState(msg.state);
        // La sugerencia es para la pista del turno: al cambiar de fase (se dio
        // una pista o cambió el turno) deja de tener sentido.
        if (msg.state.phase !== 'awaitingClue') setSuggestion(null);
      } else if (msg.type === 'error') setError(msg.message);
      else if (msg.type === 'clueSuggestion') {
        setSuggestion({ word: msg.word, count: msg.count, words: msg.words, reasoning: msg.reasoning });
      }
    },
  });

  // Auto-descartar el error tras unos segundos.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Modo equipo IA: repinta de verde todo lo que era azul (tablero, paneles,
  // chip de turno, clave del jefe) vía un hook global en <html>.
  const aiTeam = state?.aiTeam ?? null;
  useEffect(() => {
    if (aiTeam) document.documentElement.dataset.aiTeam = aiTeam;
    else delete document.documentElement.dataset.aiTeam;
    return () => { delete document.documentElement.dataset.aiTeam; };
  }, [aiTeam]);

  // Al iniciar la partida desde el lobby (sin sorteo), mostrar un loader breve
  // para que se sienta la transición. Solo en la transición real lobby→partida:
  // no en reconexión por F5 (arranca directo en awaitingClue, prev = null) ni
  // tras el sorteo (prev = 'drafting', que ya tuvo su animación de ruleta).
  const phase = state?.phase ?? null;
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === 'lobby' && phase === 'awaitingClue') {
      setStarting(true);
      const t = setTimeout(() => setStarting(false), STARTING_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Notificación (sonido + título parpadeante) cuando llega una pista para tu
  // equipo y estás en otra pestaña.
  useTurnNotification(state, playerId);

  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));

  if (!state) {
    return <Connecting room={room} creating={creating} />;
  }

  const me = state.players[playerId];
  const shared = {
    state, me, room, send, onLeave, error,
    clueSuggestion: suggestion,
    onClearSuggestion: () => setSuggestion(null),
  };

  if (state.phase === 'lobby') return <Lobby {...shared} />;
  if (state.phase === 'drafting' && state.draft)
    return <SpymasterDraft draft={state.draft} players={state.players} />;
  if (starting) return <StartingGame />;
  return <GameScreen {...shared} />;
}
