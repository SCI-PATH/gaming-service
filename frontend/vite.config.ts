import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendRoot, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const assessmentTarget = (
    env.ASSESSMENT_API_PROXY_TARGET ||
    env.VITE_ASSESSMENT_DEPLOYED_BASE ||
    'http://43.204.6.115:8004'
  ).replace(/\/+$/, '');

  const gamingTarget = (
    env.GAMING_API_PROXY_TARGET ||
    env.VITE_GAMING_API_BASE ||
    'http://3.6.20.31:8002'
  ).replace(/\/+$/, '');

  const proxy = {
    // Same-origin path for the Intelligent Assessment Engine (Component 2).
    // Must be listed before `/api` so it is not sent to the gaming backend :8002.
    '/assessment-api': {
      target: assessmentTarget,
      changeOrigin: true,
      timeout: 60000,
      rewrite: (p: string) => p.replace(/^\/assessment-api/, ''),
    },
    '/api': {
      target: gamingTarget,
      changeOrigin: true,
      timeout: 60000,
      configure(proxyServer) {
        let lastLog = 0;
        proxyServer.on('error', (err, _req, res) => {
          const now = Date.now();
          if (now - lastLog > 8000) {
            lastLog = now;
            console.warn(
              `[vite] gaming API (${gamingTarget}) is not reachable. ` +
                'For local: npm run backend. For EC2: check GAMING_API_PROXY_TARGET.',
            );
            if (err?.message) console.warn(`[vite] ${err.message}`);
          }
          if (res && !res.headersSent && typeof res.writeHead === 'function') {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ok: false,
                skipped: true,
                error: 'gaming_backend_unavailable',
              }),
            );
          }
        });
      },
    },
  };

  return {
    root: frontendRoot,
    envDir: repoRoot,
    publicDir: 'public',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 4173,
      host: true,
      allowedHosts: true,
      proxy,
    },
  };
});
