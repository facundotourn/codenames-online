import { useEffect, useRef } from 'react';
import type { GameState } from '../party/types';

// Título base (lo fija index.html) y el que parpadea al llegar una pista.
const BASE_TITLE = document.title;
const ALERT_TITLE = '¡Pista lista! · Codenames';

// Avisa al agente cuando el jefe da una pista para su equipo mientras está en
// OTRA pestaña: reproduce un sonido corto y hace parpadear el <title> para que
// lo note en la barra del navegador. Al volver a la pestaña, restaura el título.
export function useTurnNotification(state: GameState | null, playerId: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const wasGuessing = useRef(false);
  const flashId = useRef<number | null>(null);

  // Prepara el <audio> y lo "desbloquea" en la primera interacción del usuario
  // (los browsers bloquean el autoplay hasta que hay un gesto en la página).
  useEffect(() => {
    const a = new Audio('/notify.mp3');
    a.preload = 'auto';
    audio.current = a;

    const unlock = () => {
      a.muted = true;
      a.play()
        .then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
        .catch(() => { a.muted = false; });
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Corta el parpadeo del título y lo restaura.
  const stopFlash = () => {
    if (flashId.current !== null) {
      clearInterval(flashId.current);
      flashId.current = null;
    }
    document.title = BASE_TITLE;
  };

  // Al volver a la pestaña, cortar la notificación visual.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) stopFlash(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stopFlash();
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const me = state.players[playerId];
    const clue = state.clue;
    const isGuessing = state.phase === 'guessing';

    // Transición hacia 'guessing' (recién se dio una pista); solo entonces.
    const enteringGuess = isGuessing && !wasGuessing.current;
    wasGuessing.current = isGuessing;

    if (
      enteringGuess &&
      me?.role === 'operative' &&
      clue && clue.team === me.team &&
      document.hidden
    ) {
      const a = audio.current;
      if (a) { a.currentTime = 0; a.play().catch(() => {}); }
      // Arranca el parpadeo del título si no está ya andando.
      if (flashId.current === null) {
        let on = false;
        flashId.current = window.setInterval(() => {
          document.title = on ? BASE_TITLE : ALERT_TITLE;
          on = !on;
        }, 1000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerId]);
}
