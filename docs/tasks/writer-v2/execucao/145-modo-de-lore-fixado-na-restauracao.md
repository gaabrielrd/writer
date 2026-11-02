# P1 — modo de lore fixado na restauração

## Descoberta e objetivo

Após afed57c, inventário verificou leitores/produtores de texto/lore, composição
de exportação e exclusão. O modo indexedLoreBodies ainda depende da instância
de serviço em cada advanceBookRestoreLore. Uma mudança de configuração pode
trocar a representação de pedidos em andamento. Fixar política por preparação
antes de habilitar o runtime novo; não mudar o padrão global neste incremento.

Grafo não disponível após falha fast; arquivos reais Upload/Contracts/Lore/
ActivationProof, namespaces e fixtures conferidos.

## Contrato antes do código

1. StartBookRestore fixa loreMode inline-v1/indexed-v2 a partir da configuração
   interna indexedLoreBodies, no job e na reserva nativa imutável criada junto.
   Cliente não declara esse modo. Retry/start/resolve conservam a política original.
2. Load confere presença/valor iguais entre job e reserva e nascimento/update
   imutáveis da reserva quando houver modo novo. JobShape recusa modo inválido.
   Ativação/histórico também conferem a mesma reserva. Não adicionar prosa ou
   conceder acesso; progress público permanece inalterado.
3. Avanço de lore usa somente modo fixado, ignorando configuração posterior.
   Pedido inline continua inline; indexado continua indexado, inclusive entre
   fichas quando lorePayload volta a null.
4. Compatibilidade de job sem loreMode: prefixo streamed continua; prefixo legado
   em andamento continua legado. Sem prefixo e sem ficha preparada, manter legado.
   Se já há ficha nativa v2, consulta metadata de no máximo um candidato, no livro
   reservado, e autenticação pelo journal original certificam modo indexado.
   Não usar perfil/ficha estrangeira ou campo sem prova como inferência.
5. Decisão de legado com consulta é reconferida na transação de gravação, antes
   de writes. Checkpoint original impede mutações concorrentes normais.
   Ausência de evidência permanece legado; infraestrutura/ABA não vira ausência.
   Não reescrever reserva antiga nem criar certificado retrospectivo.
6. Nenhuma migração automática de corpo/cursor/hash ou reaplicação de efeito.
   Modos existentes e cancel/cleanup/recibos continuam suportados. Selo de
   revisão e recuperação não mudam. Não apagar raiz/conteúdo para adaptar modo.
7. Campo interno opcional, sem namespace/endpoint novo ou campo público.
   Padrão da factory fica false neste incremento. Runtime só será alterado após
   inventário/validação de conjunto, em entrega explícita do mesmo objetivo.

## Sequência e arquivos

- [x] Job/reserva/load/prova de ativação e escolha por modo fixado.
- [x] Node de retry/troca de configuração/recibo/cancelamento/integridade.
- [x] Legados sem modo nos limites de prefixo/ficha, prova nativa e SDK dirigido.
- [x] Checks/revisão/ADR/docs/evidência/AGENTS e commit local.

Arquivos previstos: functions/src/bookRestoreUpload.mjs,
bookRestoreUploadContracts.mjs, bookRestoreActivationProof.mjs, bookRestoreLore.mjs;
testes Upload/LoreStream/fixtures e SDK existentes. Sem nova camada genérica.

## Inventário e limites

Exclusão usa sceneJobs (filhos/cenas/narrativa/histórico/texto) e bookLoreDeletion
(corpos/gerações/segmentos/recuperações/edição/criação/retirada/aplicação).
Publicação lê raiz servidor, não depende do flag omitido no DTO Book.
Backup usa relógio C1 v1 deliberadamente, incluindo fonte v2; não é limitação a
corpos v1. Estes achados seguem para matriz final, não provam produção/drain.

JSON v1–v6 novo usa normalizador v2; replay interno v1 conserva hashes antigos.
Raízes internas antigas sem metadata de ausência não recebem inferência/reparo
por esse campo. Auditoria operacional precisa identificar esses casos antes
do rollout; nenhuma conta real foi auditada.

Sem CI, push, PR, merge, deploy, dependência ou subagente. Validate integral no
fechamento de P1. Inventário final/legados/coleta/rollout e fases/gates continuam.

## Fixture nativa

Oito casos novos passaram na primeira rodada; 11 regressões de upload falharam
porque duas fixtures ainda deixavam updateTime genérico diferente de createTime
até na criação. Usar nativeUpdates true em Upload/Integrity, como os testes mais
recentes, para conferir a imutabilidade real da reserva. Não relaxar o servidor
nem alterar o double global utilizado por funcionalidades diferentes.
