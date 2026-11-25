import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, /api se redirige al gateway (en Docker lo hace Nginx).
    proxy: { '/api': { target: process.env.VITE_GATEWAY_URL ?? 'http://localhost:3000', changeOrigin: true } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
