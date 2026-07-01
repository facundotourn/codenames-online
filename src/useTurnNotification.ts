import { useEffect, useRef } from 'react';
import type { GameState } from '../party/types';

// Título base (lo fija index.html) y el que parpadea al llegar una pista.
const BASE_TITLE = document.title;
const ALERT_TITLE = '¡Pista lista! · Codenames';

// Preferencia de avisos (silenciable desde Ajustes). Default: activados.
export const NOTIFY_KEY = 'opt.notify';
export const notificationsOn = () => localStorage.getItem(NOTIFY_KEY) !== '0';

// Ganancia del aviso: >1 amplifica por encima del volumen del archivo (el
// <audio> tope en 1.0 se quedaba corto). Vía Web Audio (GainNode).
const NOTIFY_GAIN = 3;

// Avisa al agente cuando el jefe da una pista para su equipo mientras está en
// OTRA pestaña: reproduce un sonido corto y hace parpadear el <title> para que
// lo note en la barra del navegador. Al volver a la pestaña, restaura el título.
export function useTurnNotification(state: GameState | null, playerId: string) {
  const ctx = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const wasGuessing = useRef(false);
  const flashId = useRef<number | null>(null);

  // Prepara el AudioContext + decodifica el sonido, y lo "desbloquea" en la
  // primera interacción (los browsers suspenden el audio hasta que hay un gesto).
  useEffect(() => {
    const AC = window.AudioContext || (window as unknown as {
      webkitAudioContext: typeof AudioContext;
    }).webkitAudioContext;
    if (!AC) return;
    const audioCtx = new AC();
    ctx.current = audioCtx;

    fetch('/notify.mp3')
      .then(r => r.arrayBuffer())
      .then(ab => audioCtx.decodeAudioData(ab))
      .then(buf => { buffer.current = buf; })
      .catch(() => {});

    const unlock = () => {
      audioCtx.resume().catch(() => {});
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      audioCtx.close().catch(() => {});
    };
  }, []);

  // Reproduce el aviso amplificado con un GainNode.
  const playNotify = () => {
    const audioCtx = ctx.current;
    const buf = buffer.current;
    if (!audioCtx || !buf) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.value = NOTIFY_GAIN;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
  };

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
      notificationsOn() &&
      me?.role === 'operative' &&
      clue && clue.team === me.team &&
      document.hidden
    ) {
      playNotify();
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
