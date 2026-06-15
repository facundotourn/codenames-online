import { useEffect, useState } from 'react';
import type { Draft, DraftPick, Player } from '../../party/types';
import { DRAFT_MS } from '../../party/types';
import { teamLabel } from '../../party/rules';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Ruleta sobre `n` nombres que aterriza en `chosenIndex`: el resaltado va
// pasando de nombre en nombre cada vez más lento (ease-in: rápido al inicio,
// frena al final) y se detiene en el elegido. Determinista → todos los clientes
// ven el mismo resultado. `done` avisa cuando ya frenó.
function useRoulette(n: number, chosenIndex: number) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (n <= 1 || prefersReduced()) { setIndex(Math.max(0, chosenIndex)); setDone(true); return; }
    setIndex(0);
    setDone(false);
    const loops = 4; // vueltas completas antes de aterrizar
    const steps = loops * n + (((chosenIndex % n) + n) % n);
    const spinTime = DRAFT_MS * 0.72; // el resto queda para mostrar al ganador
    const timers: number[] = [];
    for (let i = 1; i <= steps; i++) {
      const t = spinTime * Math.pow(i / steps, 2.6); // ease-in → desacelera
      timers.push(window.setTimeout(() => {
        setIndex(i % n);
        if (i === steps) setDone(true);
      }, t));
    }
    return () => timers.forEach(clearTimeout);
  }, [n, chosenIndex]);

  return { index, done };
}

function Roulette({ pick, players }: { pick: DraftPick; players: Record<string, Player> }) {
  const names = pick.candidateIds.map(id => players[id]?.name ?? '—');
  const chosenIndex = Math.max(0, pick.candidateIds.indexOf(pick.chosenId));
  const { index, done } = useRoulette(names.length, chosenIndex);
  const teamClass = pick.team === 'red' ? 'team-r' : 'team-a';

  return (
    <div className={`draft-panel ${teamClass}${done ? ' done' : ''}`}>
      <p className="draft-team">
        Eligiendo jefe de espías · <strong>{teamLabel(pick.team)}</strong>
      </p>
      <ul className="draft-names">
        {names.map((name, i) => (
          <li
            key={pick.candidateIds[i]}
            className={`draft-name${i === index ? ' on' : ''}${done && i === chosenIndex ? ' winner' : ''}`}
          >
            {name}
          </li>
        ))}
      </ul>
      <p className={`draft-result${done ? ' show' : ''}`} aria-live="polite">
        {done ? <>🎩 ¡<strong>{names[chosenIndex]}</strong> es el jefe!</> : 'Girando…'}
      </p>
    </div>
  );
}

// Pantalla del sorteo (fase 'drafting'): todos ven la(s) misma(s) ruleta(s)
// elegir al jefe antes de entrar a la partida.
export function SpymasterDraft({ draft, players }: { draft: Draft; players: Record<string, Player> }) {
  return (
    <div className="screen draft-screen">
      <h2 className="draft-heading">🎩 Sorteando jefe de espías</h2>
      <div className="draft-panels">
        {draft.picks.map(p => <Roulette key={p.team} pick={p} players={players} />)}
      </div>
      <p className="draft-sub">
        El equipo no tenía jefe, así que se elige uno al azar entre sus agentes.
      </p>
    </div>
  );
}
