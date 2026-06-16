// Tema claro/oscuro, persistido en localStorage y aplicado en <html data-theme>.
export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
}

// Alterna el tema y devuelve el nuevo. Habilita la transición de colores solo
// durante el cambio (no en la carga). Lo usan el ThemeToggle y el menú de
// ajustes en partida.
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.add('theme-anim');
  window.setTimeout(() => root.classList.remove('theme-anim'), 450);
  applyTheme(next);
  return next;
}
