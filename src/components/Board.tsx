import type { Card as CardType } from '../../party/types';
import { Card } from './Card';

interface Props {
  cards: CardType[];
  spy: boolean;              // ve los colores ocultos (jefe, o partida terminada)
  canReveal: boolean;       // este cliente puede revelar en el turno actual
  gameOverId: string | null;
  isTense: boolean;         // suspenso final activo
  onReveal: (id: string) => void;
  onRevealStart: (id: string) => void;
  onRevealEnd: (id: string) => void;
}

export function Board({ cards, spy, canReveal, gameOverId, isTense, onReveal, onRevealStart, onRevealEnd }: Props) {
  return (
    <div className="board">
      {cards.map(card => (
        <Card
          key={card.id}
          card={card}
          spy={spy}
          clickable={canReveal}
          isGameOverCard={card.id === gameOverId}
          isTense={isTense}
          onReveal={onReveal}
          onRevealStart={onRevealStart}
          onRevealEnd={onRevealEnd}
        />
      ))}
    </div>
  );
}
