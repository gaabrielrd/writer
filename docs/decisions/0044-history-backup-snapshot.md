# ADR 0044 — Catálogo histórico consistente para portabilidade

**Estado:** marco interno M1 implementado e validado localmente; CI própria pendente, sem rollout.
**Contrato:** [P1 M1](../tasks/writer-v2/execucao/32-captura-consistente-do-historico.md).

## Contexto

O operador escolheu guardar no backup estado atual e todo o histórico, incluindo
versões de capítulos/cenas removidos. A lista existente é paginada; suas criações
e exclusões não alteravam uma revisão da seleção. Comparar só hashes das páginas
não detecta omissões por mutação entre consultas. Os clocks de cenas/lore não
cobrem essa coleção. A recuperação do universo, confirmada separadamente, religa
a origem autorizada sem duplicar fichas globais.

## Decisão

Persistir historyRevision na raiz de livro/aventura e avançá-la atomicamente com
cada versão nova, cópia before-restore e retirada da seleção. Replay, leitura e
remoção física de chunks já retirados não avançam. Ausência é baseline legado
zero, sem presumir catálogo vazio; valores inválidos/overflow falham. Rules de
livro preservam o campo no cliente. A manutenção Admin segue o mesmo protocolo.

getWorkHistoryBackupSource autoriza e devolve revisão/token, sem corpo ou escrita.
O token liga UID, target e timestamps nativos precisos de criação/atualização da
raiz. Lista/corpo aceitam expectedHistoryToken opcional e o conferem na transação
autorizada; chamadas legadas sem a opção conservam seu comportamento. Token não
é grant nem vale após troca de conta, encarnação ou catálogo.

captureWorkHistoryBackup percorre todo o projeto, mantém versões de recursos
removidos, verifica os corpos/resumos e confere o source novamente ao fim.
Rejeita seleção inconsistente e não entrega resultado parcial; o DTO final não
inclui token. Invalidação do host antes/depois de I/O descarta a captura.

## Limites e consequências

Isso protege o catálogo histórico e a raiz; não comprova sozinho uma captura de
todos os metadados, personas, progresso ou imagens do livro. O helper atual reúne
as versões em memória; orçamento/streaming/arquivo são contratos do próximo marco,
sem truncar histórico ou reinterpretar retenção. O JSON v6 continua sem histórico;
não há pacote restaurável, tela de revisão de backup ou roundtrip P1 nesta entrega.

O rollout precisa atualizar writers e Rules conjuntamente e drenar instâncias
antigas antes de expor a captura. Não depender de readTime/PITR sem prova de sua
semântica no SDK e serviço. Não há dependência nova nem migração retroativa de
históricos que nunca existiram. O universo inline dos JSON legados não concede
acesso nem vira lore próprio automaticamente.

## Evidência

Validate local verde: 2.545 testes frontend, 85 scripts, 635 Functions. SDK real
local de histórico 10/10; navegador 6/6 regressões de continuidade com transporte
fictício. Falhas/limites e estado de Git/CI ficam na
[entrega M1](../entregas/2026-10-21-writer-v2-captura-do-historico.md).
