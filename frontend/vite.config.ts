import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind every interface, not just loopback, so the dev server is reachable
    // from other machines on the LAN (e.g. http://192.168.0.50:5175).
    host: true,
    port: 5175,
    // Fail loudly if the port is taken instead of silently drifting to the next
    // free one - a moving port is how this ends up served from an unexpected URL.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
