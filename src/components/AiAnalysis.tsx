import { useState, useRef, useEffect } from 'react';

// Efecto "tipeado": muestra `text` de a poco. Si el texto nuevo continúa al
// anterior (se le agregó una línea), tipea solo lo nuevo; si cambió de raíz
// (turno nuevo), arranca de cero. Rápido a propósito (varios chars por tick).
function useTypewriter(text: string, charsPerTick = 3, tickMs = 16): string {
  const [count, setCount] = useState(text.length);
  const prev = useRef(text);

  useEffect(() => {
    const start = text.startsWith(prev.current) ? prev.current.length : 0;
    prev.current = text;
    if (start >= text.length) { setCount(text.length); return; }
    setCount(start);
    let c = start;
    const id = setInterval(() => {
      c = Math.min(text.length, c + charsPerTick);
      setCount(c);
      if (c >= text.length) clearInterval(id);
    }, tickMs);
    return () => clearInterval(id);
  }, [text, charsPerTick, tickMs]);

  return text.slice(0, count);
}

// Panel de razonamiento del agente IA: vive DEBAJO del tablero (para no moverlo)
// y arranca colapsado. El botón lo despliega; la preferencia se recuerda.
export function AiAnalysis({ log }: { log: string }) {
  const [open, setOpen] = useState(() => localStorage.getItem('aiAnalysisOpen') === '1');
  const shown = useTypewriter(log);
  const boxRef = useRef<HTMLDivElement>(null);

  // Autoscroll al fondo mientras se va tipeando.
  useEffect(() => {
    if (open && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [shown, open]);

  const toggle = () => {
    const v = !open;
    setOpen(v);
    localStorage.setItem('aiAnalysisOpen', v ? '1' : '0');
  };

  return (
    <div className="ai-analysis">
      <button className="ghost ai-analysis-toggle" onClick={toggle} aria-expanded={open}>
        <span className="ai-analysis-bot">🤖</span>
        Razonamiento del agente IA
        <span className="ai-analysis-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ai-analysis-box" ref={boxRef} role="log" aria-live="polite">
          {shown}
          <span className="ai-caret-blink">▍</span>
        </div>
      )}
    </div>
  );
}
