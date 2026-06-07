import confetti from 'canvas-confetti';
import type { Team } from '../party/types';

// Paletas que reflejan los gradientes de la cara trasera de las cartas
// (ver styles.css .team-r / .team-a). Portado de la v1.
const PALETTES: Record<Team, string[]> = {
  red: ['#f87171', '#ef4444', '#c81e1e'],
  blue: ['#60a5fa', '#3b82f6', '#1a40b8'],
};

// Solo en escritorio: se saltea punteros táctiles/gruesos y viewports angostos.
export function confettiSupported(): boolean {
  return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
}

// Dos cañones disparan desde las esquinas inferiores hacia el centro, en el
// color del equipo ganador.
export function fireVictoryConfetti(team: Team): void {
  const colors = PALETTES[team];
  const end = Date.now() + 900;

  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, startVelocity: 60, origin: { x: 0, y: 1 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 60, startVelocity: 60, origin: { x: 1, y: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
