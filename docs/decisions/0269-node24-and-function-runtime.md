# 0269 — Node 24 no desenvolvimento, CI e Functions

Status: aceita pelo operador em 2026-11-02; validação e publicação em andamento.

## Decisão

Usar Node 24.12+ no desenvolvimento/CI e Node 24 nas Functions. Firebase 13 e
Rules Testing 6 são atualizados juntos. Vitest e cobertura V8 permanecem na
mesma versão (5.1); `clearMocks: false` conserva o comportamento anterior dos
hooks sem reduzir cobertura. Incorporar as atualizações compatíveis dos PRs de
dependências sem substituir scripts novos do Writer V2 por lockfiles antigos.

## Gatilho de exclusão de conta

Node 24 não está disponível na primeira geração. O SDK de Functions 7.4 já
oferece `onUserDeleted` em `firebase-functions/v2/identity`. A limpeza passa a
`cleanupDeletedAccountChatV2`, com o mesmo escopo (chats e limites do usuário),
540 segundos, 512 MiB e retry. O gatilho fica restrito às contas do projeto
padrão (`IS_NOT_TENANT`), evitando confundir UIDs de tenants diferentes. Publicar e verificar a função nova antes de
retirar `cleanupDeletedAccountChat` de primeira geração; duplicatas são seguras
porque a exclusão é idempotente. Não testar excluindo contas reais.

## Rollout e auditoria

Backend, índices e regras precedem Hosting. O gate automático de Hosting está
habilitado e deve ser considerado antes do push. Preservar snapshots e
respeitar invocações antigas antes de publicar clientes que dependem do backend.
Não usar `npm audit fix --force`, rebaixar ferramentas ou suprimir advisories
para aparentar uma auditoria limpa. Pendências sem correção compatível devem
ser registradas com o resultado real da validação.

## Quotas durante a implantação

A CLI tentou até 40 liberações concorrentes. Além dos 429 de mutações da API,
o startup simultâneo esgotou a quota regional de CPU em cinco criações.
Retomar somente serviços sem estado ACTIVE/Node 24, em lotes sequenciais de
até 12 com intervalo entre lotes. Preservar os healthchecks, o runtime e os
limites de execução; não reprovisionar App Engine pela mensagem genérica da CLI.

## Pendências de dependências

A auditoria final das dependências atualizadas registra zero vulnerabilidades
altas ou críticas. Permanecem 13 ocorrências moderadas no frontend/ferramentas
e seis em Functions, decorrentes dos advisories minimatch
GHSA-g3hv-75wg-m249 e glob GHSA-3g3m-2fjr-6pw4. Não há atualização
transitiva compatível para todos os consumidores: forçar minimatch 11 quebra
a API consumida pelo lint de acessibilidade. Preservar esse lint e acompanhar
a correção upstream; não apresentar a auditoria como livre de pendências.

## Índices de produção

O deploy rejeitou nove declarações redundantes de índice composto contendo
apenas um campo e `__name__` na mesma direção. Preservar os índices simples
automáticos de coleção; declarar `uses.adventureId` com escopo de grupo em
`fieldOverrides`. Conservar os compostos cujo desempate por nome tem direção
diferente. A configuração corrigida foi aceita pelo Firestore em produção.

## Referências

- [Runtimes suportados](https://docs.cloud.google.com/functions/docs/runtime-support)
- [Gatilhos de Authentication](https://firebase.google.com/docs/auth/extend-with-functions)
- [Migração do Vitest](https://vitest.dev/guide/migration/)
- [Tipos e ordenação dos índices](https://firebase.google.com/docs/firestore/query-data/index-overview)
- [Quotas de Functions](https://firebase.google.com/docs/functions/quotas)
