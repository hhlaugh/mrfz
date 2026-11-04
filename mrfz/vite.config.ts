import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

import { createRelayServer } from './relay-server/src/index.ts';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'integrated-relay-server',
        configureServer(server) {
          if (server.httpServer) {
            try {
              createRelayServer(server.httpServer, { origins: true });
              console.log('[integrated-relay] relay server successfully attached to dev server');
            } catch (err) {
              console.error('[integrated-relay] failed to attach relay server:', err);
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname ?? '.', '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
