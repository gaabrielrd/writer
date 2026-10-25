# ADR 0149 — Lore nativo nas referências de cenas e planejamento

- Status: implementado localmente.
- Data: 2026-10-25.
- Plano: [129](../tasks/writer-v2/execucao/129-lore-logico-nas-referencias-de-cenas-e-planejamento.md).

## Contexto e decisão

Cabeças segmentadas não têm nome/categoria. Scenes aceitava uma cabeça local
existente sem conferir flags; planejamento projetava campos ausentes e observava
loreVersion de aventura em livros. Milissegundos não distinguem toda recriação.

BookLoreReferenceRead autoriza livro e abre origem C1 na mesma transação.
Disponibilidade confere escopo/flags/tombstone/descriptor/header de base e prova
original de criação quando existir. Não baixa chunks de prosa, não certifica
corpos não consumidos e não depende do tamanho do nome/detalhes. Inline valida
o documento existente limitado pelo Firestore.

Inserção de vínculo e consulta de índices inversos usam essa origem.
Ausência/revogação conhecida produz indisponibilidade; corrupção/prova inválida
ou falha de infraestrutura interrompe a operação. Remoção explícita não depende
da origem continuar disponível. Índices/contadores/recibos preservam atomicidade.

Listas de referências e opções pedem somente nome/categoria lógicos ao leitor
seletivo da ADR 0147. Não truncam labels ou baixam outros campos/relações v2.
Base v1 é certificada integralmente em fluxo. Budget compartilhado por página
é 32 MiB/512 partes/900000 bytes lógicos retidos. Não é limite da ficha/autoria,
nem do total do catálogo. Falha rejeita a resposta; não publica lista parcial.
Envelope de cenas usa a guarda existente de 900000 bytes; planejamento conserva
paginação por resposta de até 1000000 bytes, sem cortar um nome.

Cursores locais observam localLoreVersion correto e listToken C1 que inclui
nascimento do livro. Consultas inversas incluem token C1/v2 da cabeça, com
nascimento/updateTime exatos, além dos observados existentes. Cursores antigos
sem a prova podem exigir reinício. Não migrar cursor para a origem nova.

Vínculos continuam por IDs e seguem a origem atual autorizada; não são snapshots
de texto ou da identidade histórica de conversas. Nenhum nome é gravado no link.
Universos e aventuras mantêm seus contratos.

## Evidência e limites

[Entrega](../entregas/2026-10-25-writer-v2-lore-nativo-nas-referencias.md):
60 Node e oito SDK positivos, incluindo origem criada pelo produtor real,

> 8 MiB/128 partes, labels seletivos e rollback de último índice.
> Sem RPC/Rule/DTO de entrada/dependência ou UI nova.

Publicação/captura de campanhas e demais consumidores, inventário dos namespaces/
escritores/exclusão, backup/restauração/drain/rollout/validate de P1, fases 3–5 e
gates humanos/comerciais continuam necessários. Sem envio remoto ou deploy.
