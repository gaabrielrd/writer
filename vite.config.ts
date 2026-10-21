import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const projectId =
    loadEnv(mode, import.meta.dirname, 'VITE_').VITE_FIREBASE_PROJECT_ID?.trim() || 'writer-44cd5';
  if (command === 'serve' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('VITE_FIREBASE_PROJECT_ID inválido para encaminhar a API local.');
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '^/api/adventure-import/recovery-key(?:\\?.*)?$': {
          target: `https://us-central1-${projectId}.cloudfunctions.net`,
          changeOrigin: true,
          rewrite: () => '/getAdventureImportRecoveryKey',
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, './src'),
      },
      // Mantém os peers do pacote na mesma instância usada pelo consumidor.
      dedupe: ['react', 'react-dom'],
    },
  };
});
