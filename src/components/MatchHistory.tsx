import { useState } from 'react';
import type { TurnRecord, Team, CardColor } from '../../party/types';
import { RobotIcon, ChevronRightIcon } from './icons';

// Clase de color del chip según lo que resultó la carta arriesgada.
const chipClass: Record<CardColor, string> = {
  red: 'red', blue: 'blue', neutral: 'neutral', assassin: 'assassin',
};

// Resumen al final de la partida: por cada turno, la pista del jefe y en qué
// orden arriesgaron los agentes (cada palabra pintada según su color real).
// Desplegable: arranca cerrado salvo en modo TV (defaultOpen).
export function MatchHistory(
  { history, aiTeam, defaultOpen = false }:
  { history: TurnRecord[]; aiTeam: Team | null; defaultOpen?: boolean },
) {
  const [open, setOpen] = useState(defaultOpen);
  if (history.length === 0) return null;
  return (
    <section className={`panel match-history${open ? ' open' : ''}`}>
      <button className="mh-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="mh-title">Historial de pistas</span>
        <span className="mh-count">{history.length}</span>
        <ChevronRightIcon size={16} className="mh-chevron" />
      </button>
      {open && (
        <ol className="mh-turns">
          {history.map((t, i) => {
            const isAI = t.team === aiTeam;
            return (
              <li key={i} className="mh-turn">
                <div className="mh-clue">
                  <span className={`mh-dot ${t.team}`} />
                  {isAI && <RobotIcon size={13} className="mh-bot" />}
                  <span className="mh-clue-word">«{t.clueWord.toUpperCase()}»</span>
                  <span className="mh-clue-count">{t.clueCount}</span>
                </div>
                <div className="mh-guesses">
                  {t.reveals.length === 0
                    ? <span className="mh-empty">pasaron sin arriesgar</span>
                    : t.reveals.map((r, j) => (
                      <span key={j} className={`mh-chip ${chipClass[r.color]}`}>{r.word.toUpperCase()}</span>
                    ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
