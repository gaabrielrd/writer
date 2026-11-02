# Writer V2 — inventário físico dos corpos de variantes

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 209](../tasks/writer-v2/execucao/209-inventario-fisico-das-variantes.md).
- Decisão: [ADR 0239](../decisions/0239-campaign-lore-physical-body-inventory.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Implementado

Inventário de lojas e corpos, sonda de órfãos por encarnação e cobertura por
variante. Referenciados, revogados e resíduos operacionais são explícitos;
sem leitura de prosa e sem promover conteúdo descartado ou reativar estados.
Bindings históricos/implícitos e revisão de corpo são preservados. Cobertura
detecta partes ausentes e coincide com provas do inventário físico.

A sonda encontra corpos nativos sob pai ausente. Cursor completo não perde
IDs iguais entre lojas. Lojas conhecidas são varridas sem filtro de token;
sonda de grupo cobre o cohort tipado da encarnação, sem alegar vazio genérico.
Índice local de campaignToken preparado; content permanece fora do índice.

Fixture específico acrescenta collectionGroup por metadata ao mesmo banco de
timestamps nativos simulados. studioDb compartilhado não mudou; helper de
backup permite injetar banco, preservando seu padrão e os leitores existentes.

## Testes e validações reais

- Node: conjunto de 52 testes passou, saída 0, 977,3098 ms (24 novos e
  28 regressões dos leitores/fixtures afetados).
- Após reforçar a porta read-only e acrescentar o caso de base incompatível em
  loja histórica, apenas a suíte nova foi repetida: 25/25, saída 0, 707,5804 ms.
  Total de 53 testes distintos dirigidos positivos.
- Casos incluem legado, gerações anteriores, removed/inactive, referência
  revogada, resíduos preparing, ausência/extra/órfão, pai ausente, token em
  outro namespace, 31 lojas paginadas, partes multichunk, IDs iguais em
  lojas diferentes, identidade nativa regravada, cursores, conta/C4/adoção,
  escopos e pedidos desprendidos.
- A porta de teste recusa escrita e full-read de documentos. Metadata observada
  não inclui nomes/títulos/content/detalhes. Manifests só no caminho autorizado.
- Lint inicial encontrou variável path não usada na projeção do teste; substituída
  por projeção explícita. Lint final dos cinco arquivos passou, saída 0.
  Check:docs e formato dos 14 arquivos passaram, saída 0, assim como diff
  e scan de segredos/artefatos grandes. Revisão conferiu escopos, classificação,
  prova de cobertura, limites, famílias/lojas nos envelopes e ausência de prosa;
  nenhum bloqueador pendente.

## Limites

Nenhum endpoint, interface, Rules, dependência, segredo ou produtor persistente
novo. Sem TypeScript/frontend de produção alterados; não repetidos typecheck,
build ou testes de navegador. `npm run validate` permanece para o fechamento
do grande bloco, conforme orientação do operador. Sem CI/push/PR/merge/deploy.

Ainda faltam reconferência/reconciliação conjuntas, imagens/Storage, atestado/
procedência, arquivo/restauração/UI/ciclo. Índice não foi implantado e consultas
não foram provadas com índices ativos/credenciais reais. Nenhuma alegação de
validação integral ou de limpeza C4 de árvore arbitrária.
