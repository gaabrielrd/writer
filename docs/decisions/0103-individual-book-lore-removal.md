# ADR 0103 — Exclusão individual do lore completo

- Estado: aceita; transporte dedicado local pela ADR 0132; UI/rollout pendentes.
- Data: 2026-10-24.
- Contexto: [plano 88](../tasks/writer-v2/execucao/88-exclusao-individual-do-lore-completo.md).

## Retirada atômica e identidade permanente

startBookLoreRemoval exige inspeção ready e sourceToken da mesma ficha/livro
próprios. Reabre a inspeção autorizada; presença, privacidade e datas são resolvidas
no servidor. O commit retira a cabeça, avança localLoreVersion/updatedAt,
marca hasLoreResources e cria contexto, estado inicial, evento, âncora e
bookLoreTombstones/loreId juntos. createdAt válido do livro permanece.

A privacidade anterior true explícita também revoga publicBooks, incrementa
publicationPrivacyVersion e retorna o livro a draft. Ausência/false não revogam
uma publicação por default visual. Clocks/epochs/datas inválidos ou esgotados
impedem qualquer write. Não há cobrança nem publicação automática.

O contexto imutável users/uid/bookLoreRemovals/removalId fixa intenção/startHash,
nascimentos de livro/ficha/inspeção e metadata histórica. O tombstone permanente
guarda somente identidade/hash e compartilha nascimento com o contexto.
Estado e eventos/âncoras/recibos são vinculados por hashes e timestamps nativos.
Contexto/tombstone/estado recriados não retomam a encarnação anterior.

A retirada é irreversível. Novo conteúdo recebe outro ID; não existe restore
silencioso do ID retirado. Rules recusam criar/editar o ID marcado e negam
leitura/escrita dos controles. Aberturas completas recusam cabeça recriada
com tombstone. A aplicação Admin da análise de lore também confere essa reserva
antes de cobrar ou escrever. Escritores que criam livro novo mantêm sua reserva
de raiz e IDs novos; demais consumidores continuam sujeitos à integração de M38c.

## Limpeza limitada por escopo

As unidades de limpeza são compartilhadas com o inventário de exclusão do livro.
Só aceitam abertura nativa registrada pelo respectivo controlador na mesma
transação; copiar o DTO ou trocar a transação não concede capacidade.

A ficha já retirada exige livro original ainda próprio, ativo e sem cabeça
recriada. O nascimento do contexto fixa o cutoff. Jobs privados são varridos por
livro em páginas unitárias; jobs de outras fichas, inclusive posteriores ao
cutoff, são preservados. Gerações/descritores/corpos usam consultas por ficha.

Cancelamentos de preparações, filhos inline, uploads e inspeções compartilham
transação/recibo/checkpoint com a unidade individual. Sucessos adopted e fences
permanecem. Depois de aposentar gerações, remover descritores e partes de payload
por metadata, até 16 por unidade; header sai por último. Inventário conhecido
é auditado ao terminar, conferindo collected e ausência de header/chunks.

Corpos legados sem inventário usam header imutável e cutoff, sem gerar origem
fictícia. Leases desconhecidas, escopos divergentes, partes extras e recursos
recriados bloqueiam concluir e ficam preservados.

Chunks sem header/inventário/prova não podem ser atribuídos a uma ficha somente
pelo seu ID alegado. São preservados; o inventário do livro inteiro continua
impedindo remover a raiz quando houver órfãos desconhecidos. Não há namespace purge.

O coletor genérico adia corpos marcados por tombstone com reason lore-removal.
A capacidade de cancelamento de staged próprio continua válida. Isso impede
dois cursores independentes coletarem o mesmo corpo durante a remoção individual.

## Entrega da limpeza ao livro

Quando o livro entra em deleting, unidades individuais deixam de coletar.
O inventário v3 do livro acrescenta removals depois de resolver inspeções:
confere contexto/tombstone nativos e registra handoff no mesmo commit do
checkpoint do livro. Somente depois prossegue com cabeças/gerações/payloads.

O handoff fixa operação/token/cutoff do controlador original do livro. A consulta
histórica individual confirma complete somente depois de a raiz original sair
e o checkpoint nativo daquele livro concluir. Não reabre prosa, não aceita
controlador/checkpoint recriado e não volta a executar o cursor individual.

Replay de start/recibo confirma o evento próprio, inclusive após cancelar a
inspeção ou remover a raiz; nunca reaplica clock, publicação ou cabeça.
processed registra remoções diretas; coordinatedUnits registra unidades de
protocolos filhos, sem inventar um total de conteúdo removido.

## Custo e rollout

O leitor completo acrescenta uma leitura nativa do tombstone por abertura.
O custo por parte permanece constante e só um chunk é solicitado: v1 base 5/
relações 7, v2 campo com base 6/relações 7, campo sem base 5 leituras.
O índice de bookResourceBodies por resource.kind/resource.id/nome está declarado;
o emulador não comprova ativação desse índice em produção.

O serviço nasceu interno. O transporte dedicado e a porta Auth foram
implementados localmente na [ADR 0132](0132-authenticated-lore-removal-transport.md),
com namespaces próprios; executor recuperável, confirmação visual e composição
no compêndio continuam pendentes. Demais writers/consumidores, backup lógico/
indexado e lifecycle permanecem antes do rollout. Guardas, Rules, índice e drain
de versões antigas devem ser coordenados. Sem deploy; P1/F2-09/V2 abertos.

## Unidade conjunta acrescentada — 2026-10-25

[ADR 0135](0135-atomic-lore-removal-batches.md) extrai a preparação singular
e acrescenta unidade interna de retirada conjunta. Contextos dos filhos
mantêm formato/cleanup/handoff; timestamp e versões finais são compartilhados,
com privacidade/revoked particular. Prova conjunta exige o mesmo nascimento
nativo de todos os contextos e token original observado, sem agregar recibos
singulares como se comprovassem uma transação. Coordenador/cliente/rollout abertos.
