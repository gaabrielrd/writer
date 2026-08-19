import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Acessibilidade verificada no lint: erros de marcação (imagem sem alt,
      // clique em elemento não interativo, label sem controle) custam caro
      // para corrigir depois que a tela já está pronta.
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Decisões do template viradas em erro de lint: o `check:styleguide`
      // apenas avisa, mas trocar a biblioteca de ícones, adicionar um
      // framework de CSS/UI ou importar `react-router-dom` muda a base do
      // projeto e precisa de ADR antes. Rodam no pre-commit, então o desvio
      // é barrado sem depender de alguém ler um aviso.
      // Regras: docs/styleguide.md e docs/architecture.md.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-router-dom',
              message: 'Importe de "react-router" (ADR 0004).',
            },
          ],
          patterns: [
            {
              group: [
                'react-icons',
                'react-icons/*',
                '@heroicons/*',
                '@mui/icons-material',
                '@mui/icons-material/*',
                '@fortawesome/*',
                '@phosphor-icons/*',
                'phosphor-react',
                'react-feather',
                'feather-icons',
                '@tabler/icons-react',
                'bootstrap-icons',
              ],
              message: 'A biblioteca de ícones do projeto é "lucide-react" (docs/styleguide.md).',
            },
            {
              group: [
                'styled-components',
                '@emotion/*',
                'tailwindcss',
                'tailwindcss/*',
                '@mui/material',
                '@mui/material/*',
                'antd',
                'antd/*',
                '@chakra-ui/*',
                'react-bootstrap',
                'bootstrap',
                '@mantine/*',
              ],
              message:
                'A estilização do projeto é CSS Modules + tokens (ADR 0005 e ADR 0011). Registre um ADR antes de trocar.',
            },
          ],
        },
      ],
    },
  },
  {
    // Infra de testes não participa do HMR; a regra de react-refresh não se aplica.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Ferramentas do repositório: rodam no Node, fora do bundle da aplicação.
    // Sem este bloco, `eslint .` aplicaria configuração vazia a scripts/.
    files: ['scripts/**/*.mjs', '*.config.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
);
