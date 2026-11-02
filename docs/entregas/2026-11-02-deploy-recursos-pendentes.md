# Publicação dos recursos pendentes — 2026-11-02

Publicado no projeto Firebase `writer-44cd5`, com frontend em
https://writer-44cd5.web.app, a partir do snapshot imutável da master
`02360122839a9c92dbe31296234a713762c6b0f7`.

## Recursos publicados

- `generationApi`: geração contextual de personas integrada ao setor existente.
- `cleanupBookAssets`: coleta dos pedidos expirados de personas.
- Firestore Rules: coleção privada `personaGenerations` sem acesso SDK.
- Índice collection-group `personaGenerations/expiresAt` ascendente.
- Hosting: interface consolidada do Estúdio, editor e criação assistida, além do fluxo de personas.

Storage e demais Functions preservados. Não houve push Git.

## Evidência

- As duas Functions conferidas ACTIVE em Node 24; inventário permanece com 30 Functions.
- Regras remotas comparadas integralmente com o snapshot local: iguais.
- Índice confirmado READY antes do Hosting.
- Chamada anônima ao generationApi retornou HTTP 401, sem geração ou débito.
- Bundle de produção gerado do snapshot congelado; smoke do bundle passou.
- Hosting finalizado com 17 arquivos, todos conferidos remotamente por SHA-256.
- Rotas /, /studio, /books/new/assisted e /settings/ai retornaram HTTP 200.
- Chromium anônimo carregou a página pública sem pageerror; captura inspecionada.
- Não foi executado npm run validate, conforme orientação do mantenedor.
- Fluxos autenticados e geração real de conteúdo não foram exercitados nesta publicação.

A primeira tentativa do Cloud Build de generationApi falhou ao restaurar uma
camada do cache, com INTERNAL_ERROR recebido do servidor. A repetição isolada
da Function concluiu com sucesso, sem mudança no código.

Artefato congelado, manifestos, logs, estados remotos e captura ficam localmente
em `.firebase/pending-release-0236012/` (ignorado pelo Git).
