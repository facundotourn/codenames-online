// Tema claro/oscuro, persistido en localStorage y aplicado en <html data-theme>.
export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
}
