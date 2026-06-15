import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, getTheme } from './theme';
import { initAnalytics } from './analytics';
import './styles.css';

// Aplicar el tema guardado antes del primer render (evita parpadeo).
applyTheme(getTheme());

// Google Analytics (registra el page_view inicial). No-op sin measurement id.
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
