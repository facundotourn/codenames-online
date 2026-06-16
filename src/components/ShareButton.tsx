import { useState } from 'react';
import { ShareIcon, CheckIcon } from './icons';

// Botón "Compartir" el link de la sala. En el celu abre la hoja de compartir
// nativa (WhatsApp, etc.) vía Web Share API; en desktop (sin esa API) copia el
// link al portapapeles y avisa.
export function ShareButton({ room }: { room: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/room/${room}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Codenames Online', text: 'Sumate a mi sala de Codenames', url });
      } catch { /* el usuario canceló la hoja de compartir */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* sin portapapeles disponible */ }
  };

  return (
    <button className="ghost share-btn" onClick={share}>
      {copied
        ? <><CheckIcon size={15} /> ¡Link copiado!</>
        : <><ShareIcon size={15} /> Compartir</>}
    </button>
  );
}
