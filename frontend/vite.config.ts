import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/*
 * `vite` (live) keeps the defaults below. `vite --mode staging` reads frontend/.env.staging, which
 * moves the dev server to :5176 on localhost and points /api at the staging backend on :4001.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BZUI_');
  return {
    plugins: [react()],
    server: {
      // Bind every interface, not just loopback, so the dev server is reachable
      // from other machines on the LAN (e.g. http://192.168.0.50:5175).
      host: env.BZUI_HOST || true,
      // Vite rejects any request whose Host header it does not recognise (403
      // "Blocked request"), which silently broke access by machine name from other
      // LAN boxes - the IP worked, the hostname did not. Inbound 5175 is already
      // restricted to private ranges at the Windows firewall.
      allowedHosts: ['192.168.0.50', 'WIN-P5DVFP5JNVE', 'localhost', '.local'],
      port: Number(env.BZUI_PORT || 5175),
      // Fail loudly if the port is taken instead of silently drifting to the next
      // free one - a moving port is how this ends up served from an unexpected URL.
      strictPort: true,
      proxy: {
        '/api': {
          target: env.BZUI_API_TARGET || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
