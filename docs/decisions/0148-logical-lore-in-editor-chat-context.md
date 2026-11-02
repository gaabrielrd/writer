# ADR 0148 — Lore lógico no contexto do chat do editor

- Status: implementado localmente.
- Data: 2026-10-25.
- Plano: [128](../tasks/writer-v2/execucao/128-projecao-logica-do-lore-para-contextos.md), marco B.
- Base: [ADR 0147](0147-selective-book-lore-context-projection.md).

## Decisão

Página local de livros consulta somente flags, mantendo ordem/cursor/contagem
de 50 documentos. Lê nomes, categorias e todos os aliases pela projeção lógica
C1 autorizada. Não lê resumo/detalhes v2 só para procurar termos. Matcher,
precedência local/global e limite de 12 fichas selecionadas não mudam.
Universos e aventuras conservam seus contratos.

Snapshot local usa o mesmo leitor com nome/apelido de até 200 unidades UTF16,
20 aliases, resumo 140 e detalhes 2000, sem dividir codepoint. Preserva contagens
e flags exatas. Defaults ausentes existem somente no DTO privado de contexto,
nunca retornam à fonte de escrita. Data de captura é updateTime nativo da cabeça.

Cada avanço cria budget compartilhado pela página e snapshots finais:
32 MiB de corpos consumidos, 512 partes e 900000 bytes de retenção lógica
(o envelope existente). Estado do matcher conserva seus limites anteriores.
Custo repetido de uma base na página e snapshot conta novamente. É orçamento
de uma transação de contexto, não limite da ficha/backup/autoria ou catálogo.
Esgotamento retorna context-too-complex; corrupção/domínio retorna inconsistent.
Falha não grava contexto/recibo ou cobra crédito.

Histórico identifica raiz/cabeça por nascimento, conservando os tokens anteriores.
Para livros, lê metadata de escopo/flags e confere tombstone e eventual reserva/
prova original de criação. Não exige nomes, descriptor atual certificado ou corpo
atual para permitir a resposta congelada. Revisão muda freshness, não identidade.
Origem removida, recriada, alheia ou reserva divergente revoga antes do corpo
derivado. Pergunta própria permanece e somente a mesma origem reautorizada
permite recuperar a resposta.

## Evidência e limites

99 Node e sete cenários SDK distintos positivos, incluindo criação real e base

> 8 MiB/128 partes. Dois cenários SDK precisaram de correções de fixture; foram
> repetidos isoladamente, conforme [evidência](../entregas/2026-10-25-writer-v2-lore-nativo-no-contexto-do-chat.md).
> Nenhuma alteração de Rule, endpoint, DTO público, dependência ou modelo/crédito.

Monolítico v1 ainda exige certificação integral em fluxo. Não promete desempenho
de produção. Outros contextos/consumidores, inventário de exclusão/escritores,
backup/restauração/drain/rollout/validate de P1, fases 3–5 e gates continuam abertos.
