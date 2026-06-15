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
    const operatives = members.filter(p => p.role === 'operative');
    if (!members.some(p => p.role === 'spymaster')) {
      // Sin jefe se puede iniciar igual si hay ≥2 agentes: el server sortea a uno
      // como jefe (quedando ≥1 agente que adivine). Con menos, falta jefe.
      if (operatives.length >= 2) continue;
      return `El equipo ${teamLabel(team)} necesita un jefe de espías (o 2+ agentes para sortear uno).`;
    }
    const canGuess = operatives.length > 0 || hasTable;
    if (!canGuess) {
      return `El equipo ${teamLabel(team)} necesita un agente (o una mesa compartida en la sala).`;
    }
  }

  if (teamPlayers.some(p => !p.ready)) {
    return 'Faltan jugadores por marcarse listos.';
  }
  return null;
}

// Equipos que arrancan SIN jefe de espías pero con ≥2 agentes: el server
// sorteará uno como jefe. Lo usan el server (para hacerlo) y el lobby (para
// avisarle al host antes de iniciar). Solo cuenta a los conectados.
export function draftTeams(players: Player[]): Team[] {
  const connected = players.filter(p => p.connected);
  const teamPlayers = connected.filter(p => isTeamRole(p.role));
  const out: Team[] = [];
  for (const team of ['red', 'blue'] as Team[]) {
    const members = teamPlayers.filter(p => p.team === team);
    const hasSpy = members.some(p => p.role === 'spymaster');
    const operatives = members.filter(p => p.role === 'operative');
    if (!hasSpy && operatives.length >= 2) out.push(team);
  }
  return out;
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
