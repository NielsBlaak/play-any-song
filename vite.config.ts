import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev serves from `/` so the Spotify redirect URI stays `http://127.0.0.1:5173/`.
// Production build targets GitHub Pages at `/play-any-song/`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/play-any-song/' : '/',
  server: {
    host: '0.0.0.0',
  },
  build: {
    // The bundled-tracks JSON is intentionally large (data, not code) and lazy-loaded.
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Play Any Song',
        short_name: 'Play Any Song',
        description: 'Hitster-style Spotify card game',
        theme_color: '#0f0f1a',
        background_color: '#0f0f1a',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
}));
