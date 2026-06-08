import { useState } from 'react';
import { getTheme, applyTheme, type Theme } from '../theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button
      className="ghost theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
