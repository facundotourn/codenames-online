import { useState, useRef, useEffect } from 'react';
import type { Card as CardType, CardColor } from '../../party/types';

// CardColor → letra de clase CSS (reusamos las clases de la v1: team-r/a/n/x).
const LETTER: Record<CardColor, 'r' | 'a' | 'n' | 'x'> = {
  red: 'r', blue: 'a', neutral: 'n', assassin: 'x',
};

interface Phase {
  reveal: string;            // letra de color que aterriza este flip
  isReal: boolean;           // true para el flip real (color verdadero)
  face: 'front' | 'back';    // cara visible cuando aterriza el flip
  rotation: number;          // grados rotateY absolutos — acumulan hacia adelante
  duration: number;
}

const FAKE_SPEEDS = [1.1, 0.65, 0.38];

// Un flip por reveal: reverso → fake1 → fake2 → … → real.
// Cada flip suma 180°, así los reveals alternan entre cara trasera (múltiplos
// impares de 180°) y delantera (pares) — sin volver al reverso en el medio.
function buildSequence(realLetter: string): Phase[] {
  const pool = ['r', 'a', 'n', 'x'].filter(c => c !== realLetter);
  const numFakes = 1 + Math.floor(Math.random() * 3);
  const phases: Phase[] = [];
  let rotation = 0;
  let last = '';

  for (let i = 0; i < numFakes; i++) {
    const speed = FAKE_SPEEDS[Math.min(i, FAKE_SPEEDS.length - 1)];
    const choices = pool.filter(c => c !== last);
    const fake = choices[Math.floor(Math.random() * choices.length)];
    last = fake;
    rotation += 180;
    phases.push({ reveal: fake, isReal: false, face: rotation % 360 === 180 ? 'back' : 'front', rotation, duration: speed });
  }
  rotation += 180;
  phases.push({ reveal: realLetter, isReal: true, face: rotation % 360 === 180 ? 'back' : 'front', rotation, duration: 1.9 });
  return phases;
}

interface Props {
  card: CardType;
  spy: boolean;              // este espectador ve los colores ocultos
  clickable: boolean;        // puede revelar esta carta ahora
  isGameOverCard: boolean;   // carta que decidió la partida (💀 / 👏)
  isTense: boolean;          // suspenso final activo para este reveal
  onReveal: (id: string) => void;
  onRevealStart: (id: string) => void;
  onRevealEnd: (id: string) => void;
}

export function Card({ card, spy, clickable, isGameOverCard, isTense, onReveal, onRevealStart, onRevealEnd }: Props) {
  const { id, word, color, revealed } = card;
  const colorLetter = color ? LETTER[color] : null;

  const [sequence, setSequence] = useState<Phase[]>([]);
  const [phaseIdx, setPhaseIdx] = useState(-1);
  const [backColorClass, setBackColorClass] = useState('');
  const [frontColorClass, setFrontColorClass] = useState('');
  const [resetRotation, setResetRotation] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cardOuterRef = useRef<HTMLDivElement>(null);
  const prevRevealed = useRef(revealed);

  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  // El flip lo dispara el ESTADO sincronizado: cuando la carta pasa de oculta a
  // revelada (y por ende ya conocemos su color), animamos. Si es un momento
  // tenso, corremos la secuencia dramática; si no, basta la clase .flipped.
  useEffect(() => {
    const was = prevRevealed.current;
    prevRevealed.current = revealed;
    if (was || !revealed || !colorLetter) return;

    onRevealStart(id);
    if (isTense) {
      const seq = buildSequence(colorLetter);
      setSequence(seq);
      // El primer flip siempre aterriza en la cara trasera — la pre-pintamos con el fake #1.
      setBackColorClass(`dramatic-${seq[0].reveal}`);
      setPhaseIdx(0);
    }
    // Sin suspenso: la clase .flipped anima el volteo; onRevealEnd se dispara
    // en handleTransitionEnd al terminar la transición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const isDramatic = phaseIdx >= 0;
  const canReveal = clickable && !revealed && !isDramatic;

  const handleClick = () => {
    if (canReveal) onReveal(id);
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;

    if (phaseIdx < 0) {
      // Volteo normal (sin suspenso) terminado.
      if (revealed) onRevealEnd(id);
      return;
    }

    const phase = sequence[phaseIdx];
    if (!phase) return;

    if (phase.isReal) {
      timerRef.current = setTimeout(() => {
        const el = cardOuterRef.current;
        if (el) el.style.transform = getComputedStyle(el).transform;

        // Batch: resetRotation=true clava el inner en rotateY(180deg) sin transición,
        // y limpiar los colores dramáticos revierte la cara trasera al color real —
        // así el salto es invisible (ambas caras ya muestran el color real).
        setResetRotation(true);
        setPhaseIdx(-1);
        setBackColorClass('');
        setFrontColorClass('');

        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (el) el.style.transform = '';
          setResetRotation(false);
          onRevealEnd(id);
        }));
      }, 900);
    } else {
      // Pinta la cara que aterrizará el PRÓXIMO flip mientras está oculta, así
      // cada flip revela un color fresco (sin mostrar el reverso en el medio).
      const next = sequence[phaseIdx + 1];
      if (next) {
        if (next.face === 'back') setBackColorClass(next.isReal ? '' : `dramatic-${next.reveal}`);
        else setFrontColorClass(`front-${next.reveal}`);
      }
      setPhaseIdx(i => i + 1);
    }
  };

  // Transform inline del card-inner-3d para las rotaciones dramáticas.
  // resetRotation: clava 180° instantáneamente (sin transición) antes de que el CSS retome.
  const currentPhase = isDramatic ? sequence[phaseIdx] : null;
  let innerStyle: React.CSSProperties | undefined;
  if (resetRotation) {
    innerStyle = { transform: 'perspective(900px) rotateY(180deg)', transitionDuration: '0s' };
  } else if (currentPhase) {
    innerStyle = {
      transform: `perspective(900px) rotateY(${currentPhase.rotation}deg)`,
      transitionDuration: `${currentPhase.duration}s`,
    };
  }

  // La clase .flipped solo aplica fuera de la secuencia dramática (esta usa
  // transform inline). Al terminar, resetRotation cede a .flipped sin salto.
  const flipped = revealed && !isDramatic && !resetRotation;

  const classes = [
    'card-outer',
    colorLetter ? `team-${colorLetter}` : '',
    flipped ? 'flipped' : '',
    spy && !revealed && colorLetter ? 'spy' : '',
    canReveal ? 'can-reveal' : '',
    isDramatic ? 'dramatic' : '',
    backColorClass,
    frontColorClass,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={handleClick} ref={cardOuterRef}>
      <div className="card-inner-3d" style={innerStyle} onTransitionEnd={handleTransitionEnd}>
        <div className="card-face card-front">
          <span className="card-word">{word}</span>
        </div>
        <div className="card-face card-back">
          <span className="card-word">
            {isGameOverCard ? (color === 'assassin' ? `💀 ${word} 💀` : `👏 ${word} 👏`) : word}
          </span>
        </div>
      </div>
    </div>
  );
}
