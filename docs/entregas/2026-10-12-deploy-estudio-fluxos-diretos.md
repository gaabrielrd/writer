# Deploy do estúdio de escrita — 2026-10-12

## Escopo e autorização

O usuário solicitou o deploy após a integração e o commit local dos formulários
diretos e da consistência visual. Publicado somente o Firebase Hosting do projeto
e site `writer-44cd5`: [Writer](https://writer-44cd5.web.app).

Fonte: `61a6532eb2f03f0b4878a25de8501ddf3f3d4763`, branch `master`, checkout principal limpo antes da
preparação. Os recursos de backend não mudaram nesta entrega. Nenhum push Git,
migração, criação de conteúdo real ou débito de créditos foi executado.

## Preparação e validação

- Gate completo já aprovado no principal: 680 testes de frontend, 69 de scripts
  e 63 de backend; lint, typecheck, build e smoke passaram.
- `npm run test:rules` executado novamente: 46 testes passaram no emulador demo.
- `npm run build` executado novamente: TypeScript, bundle e smoke passaram.
- Site confirmado pela CLI Firebase 15.24.0. Artefato congelado com inventário
  SHA-256 dos 15 arquivos; configuração de deploy fixa projeto/site e publica
  exclusivamente Hosting.
- Verificação remota antes da liberação: 22 funções ACTIVE, índices READY, regras
  Firestore/Storage iguais às locais e recusa HTTP 401 da chamada sem Auth/App Check.

## Publicação e verificação

- Versão: `sites/writer-44cd5/versions/121c89a437c5fc45`.
- Release: `sites/writer-44cd5/releases/1791812294212000`.
- Estado: **FINALIZED**.
- Horário informado pela API: `2026-10-12T13:38:14.212Z`.
- Os 15 arquivos publicados responderam HTTP 200 e coincidem com o artefato local
  por SHA-256. As rotas `/`, `/library`, `/settings/ai`, `/books/new/assisted` e
  `/read/__deploy_check__` responderam HTTP 200 com o index da SPA.
- Chromium anônimo renderizou a página inicial e abriu `/login`; nenhum erro de
  JavaScript foi capturado.

## Evidências e limites

Logs, inventário do artefato, releases anterior/atual, verificação de backend,
índices, hashes e navegador ficam em
`C:/Users/gaabr/Documents/Codex/2026-10-12/realtime-voice-chat/work/deploy-studio`.
Relatório e captura de produção ficam em `outputs` no mesmo diretório.

O build conserva os avisos de tamanho de bundle e importação dinâmica/estática
de `exportDocx`. A checagem de produção cobriu inicialização anônima, navegação
e artefatos; os fluxos autenticados foram validados anteriormente com fixtures.
Nenhuma geração real de IA ou modificação de dados de autor foi realizada.
Este registro local foi criado após a publicação, sem novo commit ou push.
