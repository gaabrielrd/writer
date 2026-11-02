# P1 / M38c5b — Coordenador cliente da edição preparada

## Objetivo e fronteira

Ligar captura/diff/codec de M38c5a aos serviços reais existentes, por uma
operação explícita em memória. Avançar preparo por unidade, confirmar adoção
separadamente e preservar a requisição exata após resposta perdida.
Cancelamento deve cercar jobs mesmo com RPC de produção ainda pendente.
Sem UI, persistência, novo callable ou liberação do CRUD legado para payloads.

## Requisitos e sequência

1. Construir plano/IDs/manifestos e congelar valores antes do primeiro RPC.
   IDs derivam do UID, writeId, livro/lore e posição; startHashes/domínios
   iguais aos do servidor. No-op não envia nada.
2. Uma unidade por avanço: inspeção, upload/parte/selo, reserva/inicialização,
   slots e composição. Ready não adota; apply explícito faz o commit.
   Guard de conta/escopo antes/depois de RPC; abort bloqueia nova produção.
3. Validar DTOs metadata recebidos, IDs/hashes/tokens, fases e contagens.
   Não adotar corpo ou rebasing a partir do progresso. Snapshot expõe somente
   metadata operacional, sem prosa, base64, chaves ou ponteiros físicos.
4. Preservar pedido outbound integral antes de await. Retry repete método,
   operationId, CAS e bytes. Iterador de partes é sequencial; não reserializa
   o prefixo para cada parte. Bloquear avanços de produção concorrentes.
5. Intenção de cancel é síncrona e impede novos produtores. Canal de cleanup
   independente pode cercar o pai/filhos enquanto uma chamada não responde.
   Não repetir produção para resolver cancel; manter o pedido incerto até
   prova de fechamento/sucesso. Resposta tardia não reabre estado.
6. Cancelar edição antes dos uploads; limpar reservados pelo pai e depois
   conferir/cancelar cada filho e inspeção, inclusive fence dos não iniciados.
   Mesmo após revogação, usar os controles próprios, sem prosa nova.
   Se adoção venceu, confirmar metadata própria e preservar sucesso.
7. Integrar testes Vitest com serviços reais: inline/v1/v2, páginas, remoção,
   no-op, perda de resposta em cada classe de unidade, CAS/revogação,
   cancelamento em fases diferentes, RPC pendente/resposta tardia, bloqueio
   de duplicação e preservação da fonte/bytes/recibos.
8. Lint/tipos/build pertinentes, revisão/docs/ADR/AGENTS/evidência e commit
   local. Suite integral no fechamento de P1; sem CI, push ou deploy.

## Suposições, riscos e pendências

O port de RPC é injetado; a autenticação HTTP e os endpoints públicos ainda
precisam de integração coordenada. A operação conserva o plano em memória;
recuperação após recarga exige o futuro host e persistência protegida, sem
inferir uma política de cache de prosa desta etapa.

Não tratar metadata de progresso como autorização. Cancel versus apply é
decidido pelas transações nativas; o cliente só apresenta o resultado próprio.
Erros/controles inválidos são preservados para reconciliação, sem descartar
ponteiros por timeout. Corpo atual não é adotado por confirmação histórica.

Host/UI/recuperação/endpoints, demais escritores/consumidores, backup lógico/
indexado, ativação/rollout e certificação de P1/F2-09/V2 continuam necessários.
Fases 3–5 e aceites humanos/comerciais permanecem abertos.

## Resultado do incremento

Implementação interna por unidade, apply explícito, retries imutáveis,
metadata fechada, canal independente de cancelamento, cursores e controles
paginados de até 50. WriteId identifica uma única intenção; intentHash
não é reserva global ou recuperação durável.

47 novos e 18 regressões Vitest distintos positivos; três smokes Chromium
positivos após ajuste final. Tipos/lint/build e checks dirigidos no fechamento;
validate integral no fim de P1. Veja
[ADR 0115](../../../decisions/0115-unit-coordination-of-book-lore-edits.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-coordenacao-da-edicao-de-lore.md).

Host visual/endpoints/recuperação protegida e integrações restantes pendentes,
sem habilitar CRUD SDK legado. Só commit local, sem CI/push/deploy.
P1/F2-09/V2 permanecem abertos.
