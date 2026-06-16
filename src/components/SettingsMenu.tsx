import { useState, useRef, useEffect, type ReactNode } from 'react';
import { getTheme, toggleTheme, type Theme } from '../theme';
import { GearIcon, MoonIcon } from './icons';

// Menú de ajustes (engranaje) reutilizable. Siempre trae el cambio de tema;
// `children` agrega filas extra (p. ej. las opciones in-game: suspenso, confeti).
export function SettingsMenu({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="settings-wrapper" ref={ref}>
      <button
        className={`settings-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Ajustes"
      >
        <GearIcon size={18} />
      </button>
      {open && (
        <div className="settings-dropdown">
          <div className="settings-row">
            <span className="settings-label"><MoonIcon size={15} className="settings-ico" /> Tema oscuro</span>
            <label className="switch">
              <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(toggleTheme())} />
              <span className="slider" />
            </label>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
