import type { GameState, Player, ClientMessage } from '../party/types';

// Props comunes que Room pasa a las vistas de lobby y de partida.
export interface RoomViewProps {
  state: GameState;
  me: Player | undefined;
  room: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
  error: string | null;
}
