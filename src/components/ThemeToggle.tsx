import { useState } from 'react';
import { getTheme, toggleTheme, type Theme } from '../theme';
import { SunIcon, MoonIcon } from './icons';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const toggle = () => setTheme(toggleTheme());
  return (
    <button
      className="ghost theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
    >
      {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}
