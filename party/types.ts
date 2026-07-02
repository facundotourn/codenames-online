// Modelo de dominio compartido entre cliente y servidor.
// Ver docs/design.html (§6, §7, §10) para el diseño completo.

export type Team = 'red' | 'blue';
export type CardColor = 'red' | 'blue' | 'neutral' | 'assassin';
// Variante del set de palabras: 'ar' (argentino, default) o 'es' (español neutro).
export type WordVariant = 'es' | 'ar';

// Roles de equipo (requieren team) + roles neutrales (sin team).
export type Role = 'spymaster' | 'operative' | 'tableBoard' | 'spectator';
export type Phase = 'lobby' | 'drafting' | 'awaitingClue' | 'guessing' | 'finished';

export interface Player {
  id: string;            // persistente, guardado en localStorage
  name: string;          // único en la sala; si se repite, se agrega " (n)" con n = 1..9
  role: Role;
  team: Team | null;     // spymaster/operative ⇒ Team; tableBoard/spectator ⇒ null
  connected: boolean;
  ready: boolean;        // listo en el lobby; cambiar de rol lo resetea a false
  aiCluesUsed: number;   // sugerencias de IA pedidas en la partida actual (tope MAX_AI_CLUES)
  isAI?: boolean;        // jugador sintético del equipo IA (sin conexión real)
}

export interface Card {
  id: string;
  word: string;
  color?: CardColor;     // verdad solo del server; se redacta para no-spymasters
  revealed: boolean;
}

export interface Clue {
  word: string;
  count: number;         // N: cantidad de palabras conectadas
  team: Team;
  guessesUsed: number;   // hasta N + 1
}

// Registro de un turno cerrado: la pista y en qué orden arriesgaron los agentes
// (cada intento con el color que resultó). Alimenta el resumen del final de la
// partida. Solo guarda cartas ya reveladas, así que no filtra info oculta.
export interface TurnRecord {
  team: Team;
  clueWord: string;
  clueCount: number;
  reveals: { word: string; color: CardColor }[];
}

// Titular corto del turno IA (arriba del tablero), efímero. El razonamiento
// largo va aparte en GameState.aiLog (transcripción, debajo del tablero).
export interface AiActivity {
  headline: string;      // estado corto: "Pensando", "Arriesga «X»", …
  thinking: boolean;     // true → puntos animados; false → afirmación
}

// Sorteo de jefe de espías: cuando un equipo arranca sin jefe pero con ≥2
// agentes, el server promueve a uno al azar. El detalle viaja a todos los
// clientes para que animen la MISMA "ruleta" y aterricen en el mismo elegido.
export interface DraftPick {
  team: Team;
  candidateIds: string[]; // agentes en juego al momento del sorteo (orden estable)
  chosenId: string;       // el promovido a jefe
}
export interface Draft {
  picks: DraftPick[];     // un sorteo por equipo que arrancó sin jefe
}

export interface GameState {
  phase: Phase;
  hostId: string;        // anfitrión; único que inicia. Si se va, migra al más antiguo conectado
  players: Record<string, Player>;
  board: Card[];
  startingTeam: Team;    // arranca con 9 cartas
  turn: Team;            // equipo en turno
  clue: Clue | null;     // pista vigente durante 'guessing'
  remaining: { red: number; blue: number };
  winner: Team | null;
  aiTeam: Team | null;   // equipo controlado por IA (solo 'blue'); null si no hay
  aiActivity: AiActivity | null; // titular corto del turno IA (efímero, arriba)
  aiLog: string;         // transcripción del razonamiento IA (debajo del tablero)
  draft: Draft | null;   // sorteo de jefe en curso (fase 'drafting'); null si no
  wordVariant: WordVariant; // set de palabras elegido por el host (lobby)
  history: TurnRecord[]; // turnos cerrados (pista + intentos); resumen al final
}

// ── Parámetros de configuración (ver §16) ──
export const MAX_PER_TEAM = 10;
// Sugerencias de pista por IA que cada jefe puede pedir por partida (§13).
export const MAX_AI_CLUES = 2;
// Gracia antes de abortar una partida inviable (§16). Compartida server/cliente
// para que la cuenta regresiva del aviso coincida con el timer real del server.
export const VIABILITY_GRACE_MS = 20 * 1000;
// Duración del sorteo del jefe de espías (ruleta sobre los agentes). Compartida
// para que la animación del cliente y el timer del server coincidan.
export const DRAFT_MS = 4800;

// ── Protocolo de mensajes ──

// Cliente → Servidor
export type ClientMessage =
  | { type: 'setName'; name: string }
  | { type: 'setRole'; role: Role; team: Team | null }
  | { type: 'setReady'; value: boolean }
  | { type: 'setAITeam'; enabled: boolean }
  | { type: 'setWordVariant'; variant: WordVariant }
  | { type: 'startGame' }
  | { type: 'giveClue'; word: string; count: number }
  | { type: 'guess'; cardId: string }
  | { type: 'endTurn' }
  | { type: 'requestClueSuggestion' }
  | { type: 'newGame' }
  | { type: 'returnToLobby' };

// Servidor → Cliente
export type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'clueSuggestion'; word: string; count: number; words: string[]; reasoning: string }
  | { type: 'error'; message: string };
