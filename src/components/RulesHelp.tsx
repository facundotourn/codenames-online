import { useState, useRef, type ReactNode } from 'react';
import { HelpIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

export type HelpStep = { title: string; body: ReactNode };

// Botón "?" + modal con steps (reglas / ayuda). Los `steps` los arma quien lo
// usa (reglas generales en home/lobby; ayuda por rol in-game). Ver src/help.tsx.
export function HelpButton({ steps }: { steps: HelpStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="help-btn" onClick={() => setOpen(true)} aria-label="Reglas y ayuda" title="Reglas">
        <HelpIcon size={18} />
      </button>
      {open && <RulesModal steps={steps} onClose={() => setOpen(false)} />}
    </>
  );
}

function RulesModal({ steps, onClose }: { steps: HelpStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  // Dirección del último cambio (1 = avanzar, -1 = retroceder), para animar el
  // body deslizándose hacia el lado correcto.
  const [dir, setDir] = useState<1 | -1>(1);
  const step = steps[i];
  const last = i === steps.length - 1;

  const go = (target: number) => {
    const t = Math.max(0, Math.min(steps.length - 1, target));
    if (t === i) return;
    setDir(t > i ? 1 : -1);
    setI(t);
  };
  const prev = () => go(i - 1);
  const next = () => go(i + 1);

  // Swipe táctil (mobile): deslizar a la izquierda avanza, a la derecha retrocede.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx <= -45) next();
    else if (dx >= 45) prev();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal rules-modal"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button className="rules-close" onClick={onClose} aria-label="Cerrar"><CloseIcon size={18} /></button>

        <div className={`rules-step ${dir === 1 ? 'slide-next' : 'slide-prev'}`} key={i}>
          <h3>{step.title}</h3>
          <div className="rules-body">{step.body}</div>
        </div>

        <div className="rules-nav">
          <button className="rules-arrow" onClick={prev} disabled={i === 0} aria-label="Anterior">
            <ChevronLeftIcon size={18} />
          </button>

          <div className="rules-dots">
            {steps.map((_, n) => (
              <button
                key={n}
                className={`rules-dot${n === i ? ' on' : ''}`}
                onClick={() => go(n)}
                aria-label={`Paso ${n + 1}`}
              />
            ))}
          </div>

          {last ? (
            <button className="rules-done" onClick={onClose}>Entendido</button>
          ) : (
            <button className="rules-arrow" onClick={next} aria-label="Siguiente">
              <ChevronRightIcon size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
