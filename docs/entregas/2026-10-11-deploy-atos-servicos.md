# Deploy de atos e serviços — 2026-10-11

## Escopo e autorização

O usuário solicitou o deploy de functions, rules e Hosting após a integração
de atos na master. Projeto/site confirmado na CLI: writer-44cd5.
Fonte implantada: 6ddddfb2bb6c08a31bc9acd1213f4ec42dcba154.
O estado inclui atos, seleção/filtro de capítulos, leitor/exportações, personas,
universos e criação assistida já presentes na master.

## Preparação

- A revisão implantada passou anteriormente pelo gate completo: 660 testes
  de frontend, 68 de setup e 63 de backend; 46 testes de regras no emulador
  e 30 cenários finais de navegador.
- `npm ci --prefix functions` e `npm run build` executados antes do deploy;
  TypeScript, bundle de produção e smoke test passaram.
- A execução inicial no sandbox recebeu spawn EPERM; a preparação autorizada
  com os processos necessários passou.
- A primeira tentativa de functions foi interrompida pela ausência de
  BOOK_ASSISTED_CREDITS no ambiente do projeto. Foi configurado 2, conforme
  o contrato da feature, no arquivo local ignorado; a repetição passou.
- CLI Firebase 15.24.0; funções implantadas em Node.js 22, 2nd Gen,
  us-central1.

## Implantação e verificação

1. Functions do codebase book-generation e índices do Firestore.
2. Regras de Firestore e Storage.
3. Espera pelo índice assistedSessions/expiresAt em COLLECTION_GROUP
   ficar READY. Os três índices compostos também estão READY.
4. Hosting publicado após backend e índices prontos.

As 22 functions estão ACTIVE. Foram criadas assistedBook, cleanupAssistedSessions
e as cinco functions de universos/lore global; as 15 existentes foram atualizadas.
A rotina de limpeza de sessões está ENABLED, com frequência every 60 minutes.
A configuração remota confirma BOOK_ASSISTED_CREDITS=2.
Uma chamada sem autenticação/App Check a assistedBook retornou HTTP 401.

As regras remotas correspondem ao conteúdo local normalizado:

- firestore.rules: projects/writer-44cd5/rulesets/0b3648d9-051f-42ce-88d8-4818eb87536b; SHA-256 2e1f2d7a8417c42bd427059e47f695d37791ea8be91190893f5648249350561a.
- storage.rules: projects/writer-44cd5/rulesets/fa602c6c-be42-4de5-b181-d36739d24e07; SHA-256 dd9ff95e778df75bb8ec98babce898f156e559704411db2b4c7b6d7ec7b86def.

Hosting: https://writer-44cd5.web.app

- Versão: sites/writer-44cd5/versions/49cce0b79715f8b4
- Release: sites/writer-44cd5/releases/1791739164392000
- Estado: FINALIZED.
- Horário informado pela API: 2026-10-11T17:19:24.392Z
- Os 15 arquivos de dist publicados coincidem com o build local por SHA-256.
- As rotas /, /library, /settings/ai, /books/new/assisted e
  /read/**deploy_check** retornam HTTP 200 e o index da SPA.
- Chromium em contexto anônimo renderizou a página inicial e abriu /login;
  nenhum erro de JavaScript foi capturado.

Logs, relatórios de API, hashes e captura ficam em .firebase/deploy-acts,
diretório ignorado pelo Git. Nenhum segredo ou credencial faz parte deste registro.

## Limites da verificação

A checagem de produção cobriu infraestrutura, artefatos, inicialização anônima
e recusa de acesso sem credenciais. Não realizou geração real de IA, débito
de créditos ou criação de livro de um autor. Os fluxos autenticados foram
testados anteriormente com fixtures e emulador.

O compilador das regras emitiu aviso de tipo null em validação de persona,
mas compilou e publicou as regras. O deploy também informou o trigger de
cleanupDeletedBookCover em região diferente da function; a operação foi
atualizada com sucesso. O build conserva os avisos anteriores de tamanho
de bundle e importação dinâmica ineficaz.

Nenhum push Git nem ativação dos workflows automáticos foi realizado.
