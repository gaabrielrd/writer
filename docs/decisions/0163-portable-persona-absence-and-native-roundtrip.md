# ADR 0163 — ausência portátil de persona e recaptura normal

Status: aceita para incremento local; fechamento de P1 pendente.
Data: 2026-10-25.

## Contexto

A cópia ativada precisa poder gerar novo backup pelos leitores normais.
Roundtrip revelou duas falhas: o controle derivado entity-scenes entrava na
serialização autoral; fontes legadas com perfil ausente não podiam ser
recapturadas, embora essa ausência seja aceita com aviso pelo plano 45.

## Decisão

Excluir da listagem portátil somente narrativeControls/entity-scenes. Ler no
máximo limit+2 documentos metadata nesse grupo para devolver limit+1 candidatos
portáteis e calcular cursor completo. Outros grupos mantêm limit+1. Desconhecidos
continuam sujeitos à validação, sem filtro genérico de inconsistências.

Adicionar personaAvailability opcional no dono portátil (book/chapter/original de
fonte), com schemaVersion 1, personaId e reason profile-not-recorded ou
legacy-overrides. Marcador é metadata fechada, não perfil/grant/fallback.
Preservar complemento/valores e remapear seu ID junto ao marcador.

Perfil ausente não gera snapshot ou vínculo disponível; não consultar/adotar
biblioteca por coincidência de ID. Perfil conhecido com overrides antigos
continua copiado literalmente, com exceção explícita para esses valores.
Sem marcador, formato novo mantém as recusas anteriores.

Validar coerência no schema e na máquina semântica. Warnings de ausência/
overrides são opcionais no estado atual, preservando checkpoints sem esses
campos; tipo/limites continuam fechados. Normalizador novo usa cursor v2.
Cursor v1 continua produzindo exatamente sua representação anterior em replay,
sem inserir marcas em checkpoints/itens históricos autenticados.

Projeções nativas e leitura normal conservam a metadata. Ao escolher outro
personaId, marca antiga não mascara o novo vínculo; o novo perfil precisa da
autorização normal. JSON legado omite somente a marca nova das fontes, sem
mutá-las; seu leitor reconstrói o aviso usando o catálogo próprio.

Formato de backup ainda local admite o campo opcional; leitores anteriores
devem recusá-lo, sem abrir dados parcialmente. Nenhum novo namespace, endpoint,
job, dependência ou direito de acesso. Flag indexada padrão permanece false.

## Comparação e consequências

IDs e datas nativas são reconstruídos conforme plano 55, usando timestamps
certificados de preparação/ativação/mídia. Histórico, perfis, capa e lore indexado
mantêm suas datas literais. Comparação não ignora prosa, bytes, relações ou estilo.

[Plano 140](../tasks/writer-v2/execucao/140-roundtrip-dos-livros-com-consumidores-normais.md)
e [evidência](../entregas/2026-10-25-writer-v2-roundtrip-normal-dos-livros.md).
Inventário global de writers/exclusão/coleta, certificação de fontes antigas,
rollout e validate integral de P1 continuam. Estados antigos v1 sem marca não
recebem reparo automático; rascunho explícito com perfil atualmente indisponível
continua usando o contrato estrito do plano 41, a conferir no inventário seguinte.
