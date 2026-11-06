# Backend local conectado ao front dev

Em 2026-11-05, a pedido do operador, foram iniciados Auth, Firestore, Storage e
Functions em loopback para o projeto fictício `demo-writer`. O front Vite está
em <http://127.0.0.1:5173> e o painel em <http://127.0.0.1:4000>.

## Implementação

- `npm run emulators` inicia os quatro serviços e a interface local.
- `npm run dev:local` seleciona `.env.emulators` e porta 5173 fixa.
- O boot conecta os quatro SDKs antes das features; configuração demo separa
  projeto, bucket, Auth, app e cache de produção.
- App Check local usa CustomProvider com token sem assinatura, interpretado
  somente pelo emulador de callables. O modo é recusado no front de produção.
- As quatro rotas HTTP de recuperação são encaminhadas às Functions locais.
- Parâmetros locais e chave fictícia foram preparados em arquivos ignorados.
- Instruções e limites em [backend local](../local-backend.md).

## Verificação

- 15 testes Vitest em três arquivos passaram: configuração, cliente habitual e
  Auth/App Check locais. Há cobertura para opt-in, isolamento demo, configuração
  inválida e recusa em produção.
- Lint direcionado, typecheck, checks de arquitetura/documentação e diff
  conferidos. Não foi solicitado commit/merge; `npm run validate` não executado.
- Navegador real: login da conta sintética `dev@writer.local`, perfil Firestore,
  entrada no Estúdio, criação de “Teste do backend local” e listagem após reload.
- O log das Functions confirmou `loreApi/createUniverse`, Auth/App Check VALID
  e outcome `ok`; `workApi` e inspeção do assistente também responderam localmente.
- Hub confirmou Auth 9099, Functions 5001, Firestore 8080 e Storage 9199 ativos.
- POST sem credenciais às quatro rotas HTTP recebeu JSON 401; comprova proxy e
  preservação da recusa de acesso, sem comprovar recuperação autenticada.
- Captura local em `.firebase/local-backend.png`, ignorada pelo Git.

## Limites

Sem commit, push ou deploy. Sem geração real de IA, upload de mídia ou execução
integral das jornadas de produto. Os handlers HTTP conservam App Check Admin:
o token local não habilita recuperação HTTP. Jobs agendados dependem de Pub/Sub,
que não foi iniciado. Dados dos emuladores são temporários nesta execução.

O sandbox bloqueou subprocessos Java/Vite e caches de tipos; a execução local
foi feita com a escalada autorizada pela revisão automática. A CLI 15.24.0 usou
os artefatos oficiais já instalados no computador. Java 26 emitiu avisos de API
obsoleta no runtime Storage; os quatro emuladores ficaram prontos.

Alterações simultâneas em `docs/deployment.md` e na entrega de sincronização de
lore/Hosting foram preservadas e não pertencem a esta entrega.
