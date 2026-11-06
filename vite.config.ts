import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, 'VITE_');
  const useEmulators = localEnv.VITE_USE_FIREBASE_EMULATORS === 'true';
  const projectId = useEmulators
    ? 'demo-writer'
    : localEnv.VITE_FIREBASE_PROJECT_ID?.trim() || 'writer-44cd5';
  const functionsTarget = useEmulators
    ? 'http://127.0.0.1:5001'
    : `https://us-central1-${projectId}.cloudfunctions.net`;
  const functionPath = (name: string) =>
    useEmulators ? `/${projectId}/us-central1/${name}` : `/${name}`;
  if (command === 'serve' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('VITE_FIREBASE_PROJECT_ID inválido para encaminhar a API local.');
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '^/api/book-lore/recovery-key(?:\\?.*)?$': {
          target: functionsTarget,
          changeOrigin: true,
          rewrite: () => functionPath('getBookLoreEditRecoveryKey'),
        },
        '^/api/adventure-restore/recovery-key(?:\\?.*)?$': {
          target: functionsTarget,
          changeOrigin: true,
          rewrite: () => functionPath('getAdventureRestoreRecoveryKey'),
        },
        '^/api/book-restore/recovery-key(?:\\?.*)?$': {
          target: functionsTarget,
          changeOrigin: true,
          rewrite: () => functionPath('getBookRestoreRecoveryKey'),
        },
        '^/api/adventure-import/recovery-key(?:\\?.*)?$': {
          target: functionsTarget,
          changeOrigin: true,
          rewrite: () => functionPath('getAdventureImportRecoveryKey'),
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
