import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev the Express API runs separately on :4000. SSE (/api/events) goes
    // through the same proxy, so EventSource works without CORS.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist', // served by Express in production
    emptyOutDir: true,
  },
});
