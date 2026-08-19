import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      exclude: [...configDefaults.exclude, 'scripts/**/*.test.mjs', 'e2e/**'],
      css: true,
      typecheck: {
        tsconfig: './tsconfig.app.json',
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
        // Aplicados de fato: `npm run test` roda `test:coverage`, entao uma
        // queda abaixo destes limites falha o `validate` e o CI.
        thresholds: {
          statements: 85,
          lines: 85,
          branches: 75,
          functions: 90,
        },
      },
    },
  }),
);
