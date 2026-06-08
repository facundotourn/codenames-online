import { useRef, useLayoutEffect, type ReactNode } from 'react';

// Anima los cambios de alto de su contenido (p. ej. cuando entran/salen
// jugadores de un equipo) para que la interfaz no "salte". Usa la Web Animations
// API: mide el alto antes/después de cada render y anima de uno a otro, dejando
// el alto en auto el resto del tiempo.
export function AutoHeight({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = el.offsetHeight;
    if (prev.current !== null && prev.current !== next && typeof el.animate === 'function') {
      el.animate(
        [{ height: `${prev.current}px` }, { height: `${next}px` }],
        { duration: 340, easing: 'cubic-bezier(0.34, 1.4, 0.6, 1)' },
      );
    }
    prev.current = next;
  });

  return <div ref={ref} className={className} style={{ overflow: 'hidden' }}>{children}</div>;
}
