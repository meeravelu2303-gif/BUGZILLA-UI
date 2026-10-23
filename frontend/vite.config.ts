import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/*
 * The public address people use from outside the office (a Cloudflare Tunnel
 * hostname such as bugs.example.com), read from PUBLIC_APP_URL in backend/.env so
 * it is set in ONE place - the same value password-reset emails link to. Vite
 * refuses requests for any host not listed (403 "Blocked request").
 */
function publicHost(): string[] {
  try {
    const env = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
    const url = /^PUBLIC_APP_URL=\s*"?([^"\r\n]+)"?/m.exec(env)?.[1];
    return url ? [new URL(url).hostname] : [];
  } catch {
    return [];
  }
}

/*
 * Shared by the dev server (`npm run dev`) and the production server
 * (`npm run serve` = build + `vite preview`), so either can run on the same
 * address with the same /api route to the backend.
 */
const lan = {
  // Bind every interface, not just loopback, so the app is reachable from
  // other machines on the LAN (e.g. http://192.168.0.50:5175).
  host: true,
  // Vite rejects any request whose Host header it does not recognise (403
  // "Blocked request"), which silently broke access by machine name from other
  // LAN boxes - the IP worked, the hostname did not. Inbound 5175 is already
  // restricted to private ranges at the Windows firewall.
  allowedHosts: [...new Set(['192.168.0.50', 'WIN-P5DVFP5JNVE', 'localhost', '.local', ...publicHost()])],
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
};

export default defineConfig({
  plugins: [react()],
  server: lan,
  /*
   * `vite preview` serves the built, minified bundle (dist/) - a handful of
   * compressed files instead of the dev server's hundreds of unbundled modules.
   * This is what everyone else on the LAN should be given; `npm run dev` is
   * for working on the code.
   */
  preview: lan,
});
