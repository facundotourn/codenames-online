import { teamLabel } from '../party/rules';
import type { RoomViewProps } from './viewProps';

// Fase 1: placeholder de partida. Confirma que el arranque funcionó y que la
// redacción anti-cheat es correcta (el jefe de espías ve colores; el resto no).
// La UI jugable —revelar cartas, turnos, pista, flip dramático— llega en la Fase 2.
export function GameScreen({ state, me, send, onLeave, error }: RoomViewProps) {
  const isHost = state.hostId === me?.id;
  const seesColors = me?.role === 'spymaster';

  return (
    <div className="screen">
      <header className="room-head">
        <div>
          <h2>Partida en curso</h2>
          <p className="tag">
            Turno: <strong>{teamLabel(state.turn)}</strong> · Rojo {state.remaining.red} – {state.remaining.blue} Azul
            {seesColors && ' · ves los colores (jefe de espías)'}
          </p>
        </div>
        <button className="ghost" onClick={onLeave}>Salir</button>
      </header>

      <section className="panel">
        <div className="board-preview">
          {state.board.map(card => (
            <div
              key={card.id}
              className={`cell ${card.color ? `color-${card.color}` : 'hidden'}${card.revealed ? ' revealed' : ''}`}
            >
              {card.word}
            </div>
          ))}
        </div>
        <p className="hint">
          Vista previa de solo lectura. La interacción (revelar, turnos, pistas, animaciones) llega en la Fase 2.
        </p>
      </section>

      {isHost && (
        <section className="panel">
          <button className="ghost" onClick={() => send({ type: 'returnToLobby' })}>
            Volver al lobby
          </button>
        </section>
      )}

      {error && <p className="err toast">⚠ {error}</p>}
    </div>
  );
}
