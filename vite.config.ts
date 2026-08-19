import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
    // Mantém os peers do pacote na mesma instância usada pelo consumidor.
    dedupe: ['react', 'react-dom'],
  },
});
