import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PartyKit serves the built client (see partykit.json `serve: dist`), so the app
// is hosted at the root path — no `base` subpath needed (unlike the v1 GitHub Pages build).
export default defineConfig({
  plugins: [react()],
});
