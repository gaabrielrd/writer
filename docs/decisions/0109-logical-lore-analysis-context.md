# ADR 0109 — Contexto lógico e reautorizado da análise de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem liberar escrita preparada.
- Plano: [94 / A1](../tasks/writer-v2/execucao/94-leitura-logica-da-analise-de-lore.md).
- Antecedentes: [ADR 0091](0091-private-complete-lore-reads.md) e
  [ADR 0107](0107-native-book-lore-creation-activation.md).

## Contexto

A análise usava dados físicos da coleção lore. Stubs com payloadStorage não
contêm campos completos: poderiam produzir contexto vazio ou um update inline
que deixaria a cabeça inconsistente. É necessário resolver o objeto lógico
antes de preparar sua futura escrita multi-item com crédito atômico.

## Decisão

Leitor interno usa C1 após autorização do livro na mesma transação. Inline,
base v1, campos flat v2 e páginas de relações são reunidos com JSON canônico,
SHA integral, Merkle, escopo e nascimentos nativos. Preserva valores literais,
BOM, duplicatas, vazio, ausências/remoções, datas e privacidade. Nenhum campo
ausente do stub é interpretado como conteúdo ausente. Domínio inválido vira
conflito de origem, sem fallback parcial.

Esta análise configura orçamento agregado de 300000 bytes JSON consumidos,
512 partes externas e 512 páginas de relações. Corpo externo acima do saldo
é recusado antes do primeiro chunk. Contexto final também tem até 300000 bytes
UTF-8 e 500 entidades. Não são limites de autoria, portabilidade ou C1.
Inline/global chegam em páginas físicas de até 16 documentos antes da
contabilização; não alegamos limite de 300000 bytes para todo o tráfego de
metadata/prefetch. A contabilização do contexto é linear.

Coleções local/global são percorridas por ID em páginas limitadas. Nada parcial
chega ao provedor. Revisão incorpora nascimento nativo do livro/universo,
nascimento/atualização/representação das entidades, clocks e conteúdo lógico.
O contrato existente de verificação do capítulo e de autosave exato do draft
analisado permanece; este incremento altera a resolução do lore.

Antes de persistir resposta e após cada retorno do provedor, reabrir e conferir
o mesmo contexto autorizado. Mudança impede próximo chunk/reparo e descarta o
resultado. Replays que retornam corpo reautorizam; a confirmação de lote
aplicado continua sendo somente metadata, sem depender de origem atual.
Ticket não guarda os corpos usados como contexto.

Enquanto A2 não preparar/adotar campos/gerações com crédito/recibo multi-item,
applyLoreAnalysis recusa qualquer alvo local payload antes dos writes/débito,
inclusive em lote misto. Inline/global continuam com seus contratos vigentes.
Não misturar fields inline no stub nem declarar aplicação payload entregue.

## Consequências

A2 permanece obrigatório: preparar mudanças por campos e adotar todos os itens
com crédito/recibo no mesmo commit, mantendo até 50 itens e preservando campos/
relações intocados. Não cobrar por unidade nem reduzir o contrato para facilitar.

Tickets prontos com revisão antiga precisam de nova análise; recibos aplicados
seguem confirmáveis como metadata. Se o provedor já foi chamado, sua tentativa
continua contando na quota; não há débito de crédito por analisar ou descartar.

Sem endpoint, Rule, índice ou dependência novos; sem deploy ou ativação.
Demais writers/consumidores/backup/cliente e P1/F2-09/V2 permanecem pendentes.
