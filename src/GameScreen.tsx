import { useState } from 'react';
import { teamLabel } from '../party/rules';
import type { RoomViewProps } from './viewProps';

// Fase 2: tablero interactivo + loop de juego. El pulido visual (portar el flip
// dramático y el confeti de la v1, modo TV) queda para fases posteriores.
export function GameScreen({ state, me, send, onLeave, error }: RoomViewProps) {
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState(1);

  const isHost = state.hostId === me?.id;
  const finished = state.phase === 'finished';

  const canGuess = !!me && (me.role === 'tableBoard' || (me.role === 'operative' && me.team === state.turn));
  const guessingNow = state.phase === 'guessing' && canGuess && !finished;
  const myClueTurn = me?.role === 'spymaster' && me.team === state.turn && state.phase === 'awaitingClue';

  const guessesLeft = state.clue ? state.clue.count + 1 - state.clue.guessesUsed : 0;
  const assassinHit = state.board.some(c => c.color === 'assassin' && c.revealed);

  const submitClue = () => {
    const word = clueWord.trim();
    if (!word) return;
    send({ type: 'giveClue', word, count: clueCount });
    setClueWord('');
    setClueCount(1);
  };

  return (
    <div className="screen">
      <header className="room-head">
        <div>
          <h2>Partida</h2>
          <p className="tag">
            <span className="score-red">{state.remaining.red}</span> – <span className="score-blue">{state.remaining.blue}</span>
            {me?.role === 'spymaster' && ' · ves los colores'}
          </p>
        </div>
        <button className="ghost" onClick={onLeave}>Salir</button>
      </header>

      {finished && state.winner ? (
        <div className={`banner turn-${state.winner}`}>
          🏆 ¡Ganó el equipo {teamLabel(state.winner)}!
          {assassinHit && ' — tocaron al asesino'}
        </div>
      ) : (
        <div className={`status-bar turn-${state.turn}`}>
          <span>Turno de <strong>{teamLabel(state.turn)}</strong></span>
          {state.phase === 'awaitingClue' && <span className="muted">esperando la pista del jefe…</span>}
          {state.phase === 'guessing' && state.clue && (
            <span className="clue">
              «{state.clue.word.toUpperCase()}» · {state.clue.count} · intentos: {guessesLeft}
            </span>
          )}
        </div>
      )}

      {myClueTurn && (
        <section className="panel">
          <h3>Tu pista</h3>
          <div className="clue-row">
            <input
              value={clueWord}
              onChange={e => setClueWord(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitClue()}
              placeholder="una palabra"
              autoFocus
            />
            <input
              type="number"
              min={1}
              max={9}
              value={clueCount}
              onChange={e => setClueCount(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              className="count-input"
            />
            <button onClick={submitClue} disabled={!clueWord.trim()}>Enviar</button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="board">
          {state.board.map(card => {
            const clickable = guessingNow && !card.revealed;
            const colorClass = card.color ? `color-${card.color}` : 'hidden';
            const stateClass = card.revealed ? 'revealed' : card.color ? 'peek' : '';
            return (
              <div
                key={card.id}
                className={`cell ${colorClass} ${stateClass}${clickable ? ' clickable' : ''}`}
                onClick={clickable ? () => send({ type: 'guess', cardId: card.id }) : undefined}
              >
                {card.word}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel actions">
        {guessingNow && <button onClick={() => send({ type: 'endTurn' })}>Terminar turno</button>}
        {finished && isHost && (
          <button className="start-btn" onClick={() => send({ type: 'newGame' })}>Nueva partida</button>
        )}
        {isHost && (
          <button className="ghost" onClick={() => send({ type: 'returnToLobby' })}>Volver al lobby</button>
        )}
      </section>

      {error && <p className="err toast">⚠ {error}</p>}
    </div>
  );
}
