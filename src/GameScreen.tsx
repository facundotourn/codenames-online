import { useState, useRef, useEffect } from 'react';
import { teamLabel, gameViable } from '../party/rules';
import { MAX_AI_CLUES, VIABILITY_GRACE_MS } from '../party/types';
import type { Card } from '../party/types';
import type { RoomViewProps } from './viewProps';
import { Board } from './components/Board';
import { AiAnalysis } from './components/AiAnalysis';
import { getTheme, toggleTheme, type Theme } from './theme';
import { GearIcon, MoonIcon, TrophyIcon, RobotIcon, BulbIcon, WarnIcon, HourglassIcon } from './components/icons';
import { confettiSupported, fireVictoryConfetti } from './confetti';

const lsBool = (key: string, def: boolean) => {
  const v = localStorage.getItem(key);
  return v === null ? def : v === '1';
};

export function GameScreen({ state, me, send, onLeave, error, clueSuggestion, onClearSuggestion }: RoomViewProps) {
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState(1);
  const [askingAI, setAskingAI] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dramatic, setDramatic] = useState(() => lsBool('opt.dramatic', false));
  const [confettiOn, setConfettiOn] = useState(() => lsBool('opt.confetti', true));
  const [theme, setTheme] = useState<Theme>(getTheme);

  // Cartas con su flip de reveal en curso: mientras haya alguna, diferimos el
  // anuncio de victoria (banner + confeti) para no spoilear el suspenso.
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const menuRef = useRef<HTMLDivElement>(null);
  const prevBoard = useRef<Map<string, Card>>(new Map());
  const prevRemaining = useRef(state.remaining);
  const confettiFired = useRef(false);
  const [lastRevealedId, setLastRevealedId] = useState<string | null>(null);

  const isHost = state.hostId === me?.id;
  const isTV = me?.role === 'tableBoard';
  const finished = state.phase === 'finished';
  const seesColors = me?.role === 'spymaster' || finished;

  const canGuess = !!me && (me.role === 'tableBoard' || (me.role === 'operative' && me.team === state.turn));
  const guessingNow = state.phase === 'guessing' && canGuess && !finished;
  const isAiTurn = state.aiTeam !== null && state.turn === state.aiTeam;
  const myClueTurn = me?.role === 'spymaster' && me.team === state.turn && state.phase === 'awaitingClue';
  const aiCluesLeft = MAX_AI_CLUES - (me?.aiCluesUsed ?? 0);

  const guessesLeft = state.clue ? state.clue.count + 1 - state.clue.guessesUsed : 0;

  // El suspenso aplica al reveal en curso si el ajuste está activo y un equipo
  // estaba en 1 carta ANTES de este reveal (prevRemaining aún no se actualizó).
  const isTense = dramatic && (prevRemaining.current.red === 1 || prevRemaining.current.blue === 1);

  // Cartas reveladas en esta actualización (diff contra el board anterior).
  const justRevealed = state.board
    .filter(c => c.revealed && !prevBoard.current.get(c.id)?.revealed)
    .map(c => c.id);

  // El anuncio de victoria espera a que el flip de la carta decisiva aterrice.
  const showWin = finished && pending.size === 0 && justRevealed.length === 0;
  const gameOverId = finished ? lastRevealedId : null;
  const assassinHit = state.board.some(c => c.color === 'assassin' && c.revealed);

  // Aviso de desconexión: durante la partida, quién se cayó y si peligra seguir.
  const players = Object.values(state.players);
  const disconnected = players.filter(p => !p.connected);
  const showDisconnects = !finished && disconnected.length > 0;
  const atRisk = showDisconnects && !gameViable(players);
  const discNames = disconnected.map(p => p.name).join(', ');
  const verb = disconnected.length > 1 ? 'se desconectaron' : 'se desconectó';

  // Cuenta regresiva de la gracia (§16): arranca cuando la partida queda en
  // riesgo y se cancela si se recupera la viabilidad (alguien reconecta).
  const [graceMs, setGraceMs] = useState<number | null>(null);
  const graceStart = useRef<number | null>(null);
  useEffect(() => {
    if (!atRisk) { graceStart.current = null; setGraceMs(null); return; }
    if (graceStart.current === null) graceStart.current = Date.now();
    const tick = () => {
      const left = Math.max(0, VIABILITY_GRACE_MS - (Date.now() - (graceStart.current ?? Date.now())));
      setGraceMs(left);
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [atRisk]);

  // Tras el render: registrá el board/score actuales y la última carta revelada.
  useEffect(() => {
    if (justRevealed.length) setLastRevealedId(justRevealed[justRevealed.length - 1]);
    prevBoard.current = new Map(state.board.map(c => [c.id, c]));
    prevRemaining.current = state.remaining;
  });

  // Confeti de victoria: una sola vez, recién cuando el anuncio se muestra.
  useEffect(() => {
    if (!showWin) { confettiFired.current = false; return; }
    if (confettiFired.current || !confettiOn) return;
    if ((state.winner === 'red' || state.winner === 'blue') && confettiSupported()) {
      confettiFired.current = true;
      fireVictoryConfetti(state.winner);
    }
  }, [showWin, state.winner, confettiOn]);

  // Cerrar el menú de ajustes al hacer clic afuera.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const toggleDramatic = (v: boolean) => { setDramatic(v); localStorage.setItem('opt.dramatic', v ? '1' : '0'); };
  const toggleConfetti = (v: boolean) => { setConfettiOn(v); localStorage.setItem('opt.confetti', v ? '1' : '0'); };

  const onRevealStart = (id: string) => setPending(s => { const n = new Set(s); n.add(id); return n; });
  const onRevealEnd = (id: string) => setPending(s => { const n = new Set(s); n.delete(id); return n; });

  // La sugerencia de IA llega (o falla) de forma asíncrona: cortamos el estado
  // "pensando…" cuando aparece una sugerencia nueva o un error.
  useEffect(() => { setAskingAI(false); }, [clueSuggestion, error]);

  const askAI = () => {
    setAskingAI(true);
    onClearSuggestion();
    send({ type: 'requestClueSuggestion' });
  };

  const useSuggestion = () => {
    if (!clueSuggestion) return;
    setClueWord(clueSuggestion.word);
    setClueCount(Math.max(1, Math.min(9, clueSuggestion.count)));
    onClearSuggestion();
  };

  const submitClue = () => {
    const word = clueWord.trim();
    if (!word) return;
    send({ type: 'giveClue', word, count: clueCount });
    setClueWord('');
    setClueCount(1);
    onClearSuggestion();
  };

  return (
    <div className={`screen${isTV ? ' tv' : ''}`}>
      <header className="room-head">
        {isHost
          ? <button className="ghost back-btn" onClick={() => send({ type: 'returnToLobby' })}>← Volver al lobby</button>
          : <button className="ghost back-btn" onClick={onLeave}>← Salir</button>}
        <div className="head-title">
          <h2>Partida{isTV && ' · mesa'}</h2>
          <p className="tag">
            <span className="score-red">{state.remaining.red}</span> – <span className="score-blue">{state.remaining.blue}</span>
            {me?.role === 'spymaster' && ' · ves los colores'}
          </p>
        </div>
        <div className="head-actions">
          <div className="settings-wrapper" ref={menuRef}>
            <button
              className={`settings-btn${menuOpen ? ' active' : ''}`}
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Opciones"
            >
              <GearIcon size={18} />
            </button>
            {menuOpen && (
              <div className="settings-dropdown">
                <div className="settings-row">
                  <span className="settings-label"><MoonIcon size={15} className="settings-ico" /> Tema oscuro</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={theme === 'dark'}
                      onChange={() => setTheme(toggleTheme())}
                    />
                    <span className="slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Suspenso final <span className="beta-badge">beta</span></span>
                  <label className="switch">
                    <input type="checkbox" checked={dramatic} onChange={e => toggleDramatic(e.target.checked)} />
                    <span className="slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <span>Confeti de victoria</span>
                  <label className="switch">
                    <input type="checkbox" checked={confettiOn} onChange={e => toggleConfetti(e.target.checked)} />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showWin && state.winner ? (
        <div className={`banner turn-${state.winner}`}>
          <span className="banner-msg">
            <TrophyIcon className="txt-ico" /> ¡Ganó el equipo{' '}
            {state.winner === state.aiTeam
              ? <>IA <RobotIcon size={17} className="txt-ico" /></>
              : teamLabel(state.winner)}!
            {assassinHit && ' — tocaron al asesino'}
          </span>
        </div>
      ) : (
        <div className={`status-bar turn-${state.turn}`}>
          <span className="turn-chip">Turno de {state.turn === state.aiTeam
            ? <>IA <RobotIcon size={15} className="txt-ico" /></>
            : teamLabel(state.turn)}</span>
          {state.phase === 'awaitingClue' && !isAiTurn && <span className="muted">esperando la pista del jefe…</span>}
          {state.phase === 'guessing' && state.clue && (
            <span className="clue">
              «{state.clue.word.toUpperCase()}» · {state.clue.count} · intentos: {guessesLeft}
            </span>
          )}
        </div>
      )}

      {state.aiActivity && (
        <div className="ai-activity">
          <span className="ai-activity-bot"><RobotIcon size={18} /></span>
          <span className="ai-activity-text">{state.aiActivity.headline}</span>
          {state.aiActivity.thinking && (
            <span className="ai-dots" aria-hidden="true"><i /><i /><i /></span>
          )}
        </div>
      )}

      {showDisconnects && (
        <div className="notice-bar">
          <div className="notice-msg">
            <WarnIcon size={16} className="txt-ico" /> <strong>{discNames}</strong> {verb}.{atRisk && ' Si no vuelve, la partida se cancela.'}
          </div>
          {atRisk && graceMs !== null && (
            <div className="grace">
              <span className="grace-text"><HourglassIcon size={14} className="txt-ico" /> Vuelve al lobby en {Math.ceil(graceMs / 1000)}s</span>
              <span className="grace-bar">
                <i style={{ width: `${(graceMs / VIABILITY_GRACE_MS) * 100}%` }} />
              </span>
            </div>
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
            <div className="count-stepper">
              <button
                type="button"
                aria-label="menos"
                onClick={() => setClueCount(c => Math.max(1, c - 1))}
                disabled={clueCount <= 1}
              >−</button>
              <span className="count-value" aria-live="polite">{clueCount}</span>
              <button
                type="button"
                aria-label="más"
                onClick={() => setClueCount(c => Math.min(9, c + 1))}
                disabled={clueCount >= 9}
              >+</button>
            </div>
            <button onClick={submitClue} disabled={!clueWord.trim()}>Enviar</button>
          </div>
          <div className="ai-row">
            <button className="ghost ai-btn" onClick={askAI} disabled={askingAI || aiCluesLeft <= 0}>
              <span className="ai-ico"><BulbIcon size={16} /></span>
              {askingAI ? 'Pensando…' : 'Sugerir pista'}
              <span className="ai-credits" aria-label={`${aiCluesLeft} de ${MAX_AI_CLUES} sugerencias`}>
                {Array.from({ length: MAX_AI_CLUES }).map((_, i) => (
                  <i key={i} className={i < aiCluesLeft ? 'on' : ''} />
                ))}
              </span>
            </button>
            {aiCluesLeft <= 0 && (
              <span className="tip" tabIndex={0} role="img"
                aria-label={`info: ya usaste tus ${MAX_AI_CLUES} sugerencias`}
                data-tip={`Ya usaste tus ${MAX_AI_CLUES} sugerencias de IA de esta partida.`}>i</span>
            )}
          </div>
          {clueSuggestion && (
            <div className="ai-suggestion">
              <div className="ai-suggestion-head">
                <span className="ai-clue"><BulbIcon size={16} className="txt-ico" /> «{clueSuggestion.word.toUpperCase()}» · {clueSuggestion.count}</span>
                <button className="ai-use" onClick={useSuggestion}>Usar</button>
              </div>
              {clueSuggestion.words.length > 0 && (
                <p className="ai-words">
                  Conecta: {clueSuggestion.words.map(w => w.toUpperCase()).join(', ')}
                </p>
              )}
              {clueSuggestion.reasoning && <p className="ai-reason">{clueSuggestion.reasoning}</p>}
            </div>
          )}
        </section>
      )}

      <Board
        cards={state.board}
        spy={seesColors}
        canReveal={guessingNow}
        gameOverId={gameOverId}
        isTense={isTense}
        onReveal={id => send({ type: 'guess', cardId: id })}
        onRevealStart={onRevealStart}
        onRevealEnd={onRevealEnd}
      />

      {state.aiTeam && state.aiLog && <AiAnalysis log={state.aiLog} />}

      <section className="actions">
        {guessingNow && <button onClick={() => send({ type: 'endTurn' })}>Terminar turno</button>}
        {showWin && isHost && (
          <button className="start-btn" onClick={() => send({ type: 'newGame' })}>Nueva partida</button>
        )}
      </section>

      {error && <p className="err toast"><WarnIcon size={15} className="txt-ico" /> {error}</p>}
    </div>
  );
}
