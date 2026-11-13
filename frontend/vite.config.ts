import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

function publicHost(): string[] {
  try {
    const env = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
    const url = /^PUBLIC_APP_URL=\s*"?([^"\r\n]+)"?/m.exec(env)?.[1];
    return url ? [new URL(url).hostname] : [];
  } catch {
    return [];
  }
}

const lan = {
  host: true,
  allowedHosts: [...new Set(['192.168.0.50', 'WIN-P5DVFP5JNVE', 'localhost', '.local', ...publicHost()])],
  port: 5175,
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
  preview: lan,
});
