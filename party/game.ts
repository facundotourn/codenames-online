import type { Card, CardColor, Team } from './types';
import { WORDS } from './words';

function shuffle<T>(arr: T[]): T[] {
  // Fisher-Yates in place.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface GeneratedBoard {
  board: Card[];
  startingTeam: Team;
  remaining: { red: number; blue: number };
}

// Tablero canónico de 25 cartas: 9 del equipo inicial, 8 del otro, 7 neutrales,
// 1 asesino. El equipo inicial (con 9) se elige al azar.
export function generateBoard(): GeneratedBoard {
  const startingTeam: Team = Math.random() < 0.5 ? 'red' : 'blue';
  const otherTeam: Team = startingTeam === 'red' ? 'blue' : 'red';

  const colors: CardColor[] = [
    ...Array<CardColor>(9).fill(startingTeam),
    ...Array<CardColor>(8).fill(otherTeam),
    ...Array<CardColor>(7).fill('neutral'),
    'assassin',
  ];
  shuffle(colors);

  const words = shuffle([...WORDS]).slice(0, 25);
  const board: Card[] = words.map((word, i) => ({
    id: String(i),
    word,
    color: colors[i],
    revealed: false,
  }));

  return {
    board,
    startingTeam,
    remaining: {
      red: colors.filter(c => c === 'red').length,
      blue: colors.filter(c => c === 'blue').length,
    },
  };
}
