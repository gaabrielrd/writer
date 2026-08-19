# Build & Deploy

O processo de build do template web é projetado para garantir que a aplicação possa ser entregue com confiabilidade, empacotando os assets de forma otimizada para produção.

## Comandos Principais

- `npm run build`: Roda o ciclo de build completo, incluindo verificação de tipos, build com Vite e smoke test.
- `npm run build:bundle`: Gera o bundle final via Vite (`vite build`).
- `npm run smoke:build`: Inicia um servidor efêmero e valida se os artefatos em `dist/` renderizam adequadamente no navegador.

## Variáveis de Ambiente

O Vite utiliza variáveis de ambiente com o prefixo `VITE_` (ex: `VITE_API_URL`).

- Durante o desenvolvimento, o Vite lê de arquivos `.env`, `.env.local`, etc.
- No CI/CD, as variáveis devem ser passadas no momento do build (ex: `VITE_API_URL=https://api.exemplo.com npm run build`), para serem injetadas estaticamente na aplicação pelo Vite.

Variáveis ausentes ou malformadas falham no boot da aplicação, com mensagem nomeando a variável — a validação fica em `src/shared/config/env.ts`. Isso vale também para o bundle de produção.

## Integração contínua

O workflow `.github/workflows/ci.yml` roda `npm ci` e `npm run validate` em Node
22 e 24 a cada Pull Request, audita as dependências com
`npm audit --audit-level=high` e executa o fluxo crítico no Chromium em jobs
separados. Configure a branch principal para exigir os checks **Validate** e
**E2E (Chromium)** antes do merge.

Todos os jobs leem `packageManager` do `package.json`, instalam essa versão exata
do npm e executam `npm run check:toolchain` antes de `npm ci`. Assim Node 22 e 24
usam o mesmo resolvedor e a mesma interpretação do lockfile. Ao atualizar a
toolchain, altere em conjunto `packageManager`, `.nvmrc`, `engines`, a matriz do
CI e `package-lock.json`.

## Smoke Test

O script `scripts/smoke-build.mjs` serve como um sanity check após o build. Ele sobe o bundle resultante (`dist/`) localmente, faz uma requisição para a raiz e verifica se o conteúdo base (como as tags do React ou conteúdo estático esperado) estão presentes. Se o smoke test falhar, a pipeline quebra, impedindo o deploy de um pacote com erro fatal.

O smoke HTTP não executa JavaScript. O comando `npm run test:e2e` complementa
essa verificação iniciando o bundle em porta efêmera e exercitando o fluxo
principal no Chromium.
