import { useState, type ReactNode } from 'react';
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
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules-modal" onClick={e => e.stopPropagation()}>
        <button className="rules-close" onClick={onClose} aria-label="Cerrar"><CloseIcon size={18} /></button>

        <div className="rules-step" key={i}>
          <h3>{step.title}</h3>
          <div className="rules-body">{step.body}</div>
        </div>

        <div className="rules-nav">
          <button
            className="rules-arrow"
            onClick={() => setI(n => Math.max(0, n - 1))}
            disabled={i === 0}
            aria-label="Anterior"
          ><ChevronLeftIcon size={18} /></button>

          <div className="rules-dots">
            {steps.map((_, n) => (
              <button
                key={n}
                className={`rules-dot${n === i ? ' on' : ''}`}
                onClick={() => setI(n)}
                aria-label={`Paso ${n + 1}`}
              />
            ))}
          </div>

          {last ? (
            <button className="rules-done" onClick={onClose}>Entendido</button>
          ) : (
            <button
              className="rules-arrow"
              onClick={() => setI(n => Math.min(steps.length - 1, n + 1))}
              aria-label="Siguiente"
            ><ChevronRightIcon size={18} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
