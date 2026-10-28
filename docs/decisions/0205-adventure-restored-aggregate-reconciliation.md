# ADR 0205 — reconciliar agregados privados de aventuras

Data: 2026-10-28. Estado: implementado internamente e validado por testes dirigidos/SDK.

## Contexto e decisão

A estrutura copiada conserva prosa e referências com revisões iniciais, mas seus
agregados começam zerados. Ativar somente wordCount sem reconstruir o ledger
faria o primeiro escritor considerar palavras antigas como contribuição nova.

advanceAdventureRestoreCounts interno percorre o índice autenticado de recursos
em três passagens limitadas: blocos, cenas/controles narrativos e links. Cada
unidade confirma provas da fonte, cabeças/corpos e journals nativos antes de
gravar alvos/journals/checkpoint/recibo juntos. Replay precede a leitura da fonte.
Os cursores permanecem privados e cada operação escreve até oito artefatos.

Blocos ativos contribuem ao agregado da cena; blocos arquivados conservam texto e
reservam sua ordem em nextBlockOrder. Revisões iniciais head/body permanecem
coerentes; blocksStructureRevision é um agregado reconstruído. Cenas atualizam
partes/unassigned e usam createWorkProgressLedger por proxy que captura os writes.
Todos os alvos/ausências lidos pelo ledger são comprovados no mesmo snapshot
antes do prepare; nenhuma escrita do ledger escapa dos journals.

Cenas arquivadas, sem parte ou com agrupador ausente não contribuem ao manuscrito.
Não inventar o agrupador ausente nem remover a prosa. O ledger conserva a fonte
e o grupo desabilitado, com fingerprint produzido pelo serviço existente.

Controles de sequências narrativas recuperam revisão inicial e rankSlot
preservado. referenceCount soma somente links do source direto; sourceArcId é
índice de cascata e não autoriza somar ao arco os vínculos dos seus marcos.

counts-ready exige quantidades iguais ao summary e total igual ao controle.
O controle fica phase done, cursor null e processed igual às cenas, mas mantém
countReady false. A definição da raiz recebe o total somente em preparedRoot.
A raiz reservada continua sem ownerId; lote de personas continua preparing.

## Falhas, limpeza e limites

Journals de ledger usam os namespaces já inventariados na raiz. O inventário de
endereços é ampliado antes da escrita. Rollback mantém contagens e cursor;
resposta perdida retoma o mesmo recibo. Alteração/recriação de corpo ou alvo
bloqueia avanço em vez de adotar prosa sem prova.

O cancelamento continua revogando personas e confirmando fences de mídia antes
de limpar a fonte e os artefatos registrados, incluindo o ledger novo.
Não há callable/UI, ativação ou publicação neste incremento.

O corpus do Writer verifica partes, blocos/cenas arquivados, ordem reservada e
texto órfão. A simulação explícita do futuro gate no teste serve apenas para
exercitar os writers existentes: primeiro salvar/arquivar/restaurar aplica deltas
sem duplicar palavras. Não comprova a implementação da ativação produtiva.

Auditoria/ativação, biblioteca/usos, aceitação/URL, recuperação/UI/roundtrip,
P2/P3/D/F2-09, fases seguintes e gates humanos/comerciais permanecem obrigatórios.
