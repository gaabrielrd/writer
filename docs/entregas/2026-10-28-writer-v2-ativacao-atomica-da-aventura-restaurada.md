# Writer V2 — ativação atômica da aventura restaurada

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: 3147888.
- Plano: [186](../tasks/writer-v2/execucao/186-ativacao-atomica-da-aventura-restaurada.md).
- Decisão: [ADR 0208](../decisions/0208-adventure-atomic-restore-activation.md).

## Objetivo e funcionalidades

O serviço interno permite revisar e confirmar a nova cópia privada da aventura,
depois de instalar a biblioteca e refazer a auditoria física. A mesma transação
libera raiz, contagens e personas, reautoriza e vincula o universo original quando
disponível e confirma o recibo. A raiz mantém seu nascimento na reserva inicial;
a criação autoral é preservada e a atualização avança monotonicamente.

Revisão contém resumo limitado e token das provas atuais. Universo revogado ou
recriado invalida a decisão anterior; nova revisão pode confirmar sem vínculo,
preservando o universo substituto. Imagens continuam preparing/URL null.
Não há novo endpoint/UI, dependência, índice ou alteração de Rules.

Um pedido sem resposta pode ser encerrado pelo mesmo ID/fingerprint antes de
uma ativação atrasada. Se já confirmou, retorna seu resultado. Histórico permanece
consultável após editar, excluir ou recriar a aventura, sem ler ou autorizar a
raiz atual. Cancelamento e limpeza pré-ativação recusam o estado ativo.
O job final fica congelado; mídia/coleta posteriores precisam de sidecars.

## Critérios de aceite

- [x] Revisão com selo final posterior à biblioteca, controles e origem provados.
- [x] Raiz/countReady/personas/universo/job/recibo atômicos.
- [x] Respostas perdidas, encerramento e ativação atrasada sem duplicação.
- [x] Histórico independente da raiz atual e sem novo grant.
- [x] Editor real aplica deltas após ativação real, sem gate simulado.
- [x] SDK integrado e revisão final registrados.
- [ ] Validate integral do próximo grande bloco.
- [ ] Finalização de mídia, coleta da fonte, recuperação e UI/roundtrip.

## Arquivos alterados

Três módulos novos Activation/Review/Meta, composição Transfer, Store e
metadados Contracts/Validation/Staging/ImageStorage. Dois arquivos Node e helper
novos, teste SDK novo e corpus de contagens do Writer atualizado. ADR, arquitetura,
progresso, índice de execução, plano e AGENTS mantêm os novos contratos.

## Testes e verificações locais

Quinze testes Node novos distintos em duas seleções. A rodada de integração
dirigida passou em **92/92**, sete arquivos, **17.993,887 ms**, sem skips/falhas:
14 casos novos e 78 regressões diretamente afetadas. Um caso adicional do DTO
fechado/frozen e resolução de operação passou em **808,933 ms** totais.

Cobertura comportamental: nascimento nativo e atomicidade; rollback de cada um
dos cinco writes, ou sete com universo; provas/source/controles/batch recriados;
conta/token/revisão/checkpoint/campos extras; primeira auditoria insuficiente;
CAS/replay, ACK perdido, encerramento e atraso; universo revogado/recriado;
cancelamento recusado; personas disponíveis por prova real, mesmo após excluir
a raiz. Job/DTO fechado recusa alterações de fase, checkpoint, origem e mídia.

Dois Vitest do corpus real passaram em **4,79 s** totais. O caso do editor agora
usa auditorias/biblioteca/ativação reais e verifica a sequência de palavras
5 → 7 → 0 → 7 → 4 após editar/arquivar/restaurar, preservando o original.
O caso de texto órfão continua preservado. Não são testes de interface nova.

Formatação e ESLint dirigidos positivos, inclusive após acrescentar o caso de DTO
e corrigir a expectativa SDK; sintaxe das **379** Functions, arquitetura,
documentação e diff passaram. Revisão final confirma escopo, fingerprints,
provas de encarnação e ausência de dependências/endpoints. Scan dos 21 arquivos
alterados sem chaves privadas/tokens identificados e sem arquivos .env; nenhum
artefato acima de 5 MiB. Nenhum limite de cobertura foi alterado.

## SDK local

Primeira execução SDK não passou: **0/1 em 221.397,948 ms** totais. A expectativa
de negar leitura direta da persona pendente ao próprio dono contrariava as Rules
existentes. A raiz permaneceu indisponível como esperado. Corrigido o teste para
permitir inspeção privada e exigir bloqueio de edição/consumo até ativar;
Rules/implementação não foram alteradas para fazer passar.

Repetição SDK **1/1 verde**, sem skips/falhas, em **231.955,775 ms** totais;
o caso levou **230.986,263 ms**. Firestore 1.22.0 dedicado em loopback 61247.
Confirma rollback de raiz/contagens/lote/job/recibo, duas ativações concorrentes
idênticas, createTime original da raiz e updateTime comum ao recibo, countReady,
consumo/edição da persona apenas após ativação, isolamento entre contas, job
sem escrita SDK e cancelamento ativo recusado. Edição/exclusão/recriação da raiz
preservam a confirmação, sem dar acesso ao substituto; personas próprias seguem
utilizáveis. Negativas de Rules esperadas aparecem no log.

JVM dedicada encerrada no finally. Ambiente demo, sem serviços de produção.
Não atribuir o validate integral de 183–185 ao código novo deste incremento.

## Limites e próximas entregas

Serviço ainda interno. Mídia permanece pendente; finalização por ativo deve
respeitar desvínculo/retirada e não religar vínculos históricos. Coleta da fonte
após mídia, recuperação/transportes/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e gates
humanos/comerciais permanecem abertos. Macro 8/35 inalterada.

Conforme orientação do operador, apenas testes necessários durante ajustes;
validate integral no fechamento do próximo grande bloco. Sem CI, push/PR,
merge/deploy ou subagentes. Checkout principal e servidor local preservados.
