// Lógica pura compartida cliente ↔ servidor (sin dependencias pesadas como la
// lista de palabras), para que el cliente la importe sin inflar el bundle.
import type { GameState, Player, Role, Team } from './types';

export function teamLabel(team: Team): string {
  return team === 'red' ? 'Rojo' : 'Azul';
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'spymaster': return 'Jefe de espías';
    case 'operative': return 'Agente';
    case 'tableBoard': return 'Mesa / TV';
    case 'spectator': return 'Espectador';
  }
}

export const isTeamRole = (role: Role): boolean =>
  role === 'spymaster' || role === 'operative';

// Devuelve el motivo por el que NO se puede iniciar, o null si se puede.
// (La validación de "solo el host" es aparte; esto cubre la composición §7.1.)
export function startBlockReason(players: Player[]): string | null {
  const connected = players.filter(p => p.connected);
  const teamPlayers = connected.filter(p => isTeamRole(p.role));
  const hasTable = connected.some(p => p.role === 'tableBoard');

  for (const team of ['red', 'blue'] as Team[]) {
    const members = teamPlayers.filter(p => p.team === team);
    if (!members.some(p => p.role === 'spymaster')) {
      return `El equipo ${teamLabel(team)} necesita un jefe de espías.`;
    }
    const canGuess = members.some(p => p.role === 'operative') || hasTable;
    if (!canGuess) {
      return `El equipo ${teamLabel(team)} necesita un agente (o una mesa compartida en la sala).`;
    }
  }

  if (teamPlayers.some(p => !p.ready)) {
    return 'Faltan jugadores por marcarse listos.';
  }
  return null;
}

// ¿La partida en curso sigue siendo jugable? (§16) Solo cuentan los conectados:
// cada equipo necesita un jefe, y alguien que adivine (un agente del equipo o
// una mesa compartida). Si no se cumple, la partida debe volver al lobby.
export function gameViable(players: Player[]): boolean {
  const conn = players.filter(p => p.connected);
  const hasTable = conn.some(p => p.role === 'tableBoard');

  for (const team of ['red', 'blue'] as Team[]) {
    const members = conn.filter(p => isTeamRole(p.role) && p.team === team);
    if (!members.some(p => p.role === 'spymaster')) return false;
    if (!members.some(p => p.role === 'operative') && !hasTable) return false;
  }
  return true;
}

// Vista redactada según el rol: solo el jefe de espías ve los colores ocultos.
// Excepción: con la partida terminada se revela el tablero completo a todos
// (ya no hay nada que proteger), para mostrar la solución como en la v1.
export function viewFor(state: GameState, role: Role): GameState {
  if (role === 'spymaster' || state.phase === 'finished') return state;
  return {
    ...state,
    board: state.board.map(c => (c.revealed ? c : { ...c, color: undefined })),
  };
}
