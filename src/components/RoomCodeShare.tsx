import { useState, useRef, useEffect } from 'react';
import { CopyIcon, ShareIcon, CheckIcon } from './icons';

// El código de sala es clickeable: abre un popover para compartir el link.
// - Copiar link (siempre): copia al portapapeles.
// - Compartir (solo touch/mobile con Web Share API): abre la hoja nativa
//   (WhatsApp, etc.) para mandárselo a un contacto.
export function RoomCodeShare({ room }: { room: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const url = `${window.location.origin}/room/${room}`;
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* sin portapapeles disponible */ }
  };

  const share = async () => {
    try {
      await navigator.share!({ title: 'Codenames Online', text: 'Sumate a mi sala de Codenames', url });
      setOpen(false);
    } catch { /* el usuario canceló la hoja de compartir */ }
  };

  return (
    <span className="code-share" ref={ref}>
      <button
        className="room-code code-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Compartir sala"
        aria-expanded={open}
      >
        {room}
      </button>
      {open && (
        <span className="code-pop" role="dialog">
          <button className="code-copy" onClick={copy}>
            {copied ? <><CheckIcon size={15} /> ¡Copiado!</> : <><CopyIcon size={15} /> Copiar link</>}
          </button>
          {canShare && (
            <button className="code-share-btn" onClick={share} aria-label="Compartir por WhatsApp u otra app">
              <ShareIcon size={16} />
            </button>
          )}
        </span>
      )}
    </span>
  );
}
