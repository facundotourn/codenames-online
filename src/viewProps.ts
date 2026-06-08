import type { GameState, Player, ClientMessage } from '../party/types';

// Sugerencia de pista por IA recibida del server (§13).
export interface ClueSuggestion {
  word: string;
  count: number;
  words: string[];
  reasoning: string;
}

// Props comunes que Room pasa a las vistas de lobby y de partida.
export interface RoomViewProps {
  state: GameState;
  me: Player | undefined;
  room: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  error: string | null;
  clueSuggestion: ClueSuggestion | null;
  onClearSuggestion: () => void;
}
