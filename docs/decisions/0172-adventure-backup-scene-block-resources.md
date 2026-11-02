# ADR 0172 — cenas e blocos no backup privado da aventura

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Acrescentar leitor interno por famílias fechadas, sem caminhos arbitrários:
part-control, scene-control, scene, scene-body, scene-planning, scene-reference,
block e block-body. Filhos recebem parentId e seu ID nativo; singletons usam
current ou unassigned. Lista N+1 limitada a 50, somente metadata, sem excluir
cenas arquivadas ou sem parte. Controle/planner ausentes são descriptors com
present false e token de ausência; corpo ausente é erro.

Cada unidade reautoriza raiz e fonte 147 no mesmo snapshot e confere identidade
nativa própria e dos heads necessários: referência/corpo/planner dependem da
cena; corpo adicional depende do bloco e da cena indicada pelo bloco. Mudança,
remoção ou recriação de qualquer dependência invalida a leitura anterior.
Pedidos capturam kind, parentId, IDs, tokens e índice antes de awaits.

DTO próprio preserva campos declarados, ranks A/B e rankSlot dos controles,
parentId/formerParentId, arquivo, estágio, tipo/audiência/ordem, datas e texto
literal. Hint de parte retirada não recria parte. Não usa contadores/revisões
derivadas para autorizar texto. Head e corpo devem declarar o mesmo SHA-256,
conferido contra o conteúdo antes da faixa; revisões numéricas podem divergir
quando só planejamento/metadata muda. Marcador externo, inclusive null, falha
sem fallback inline.

Imagem leva somente imageId/alt/caption; complemento de persona somente ID e
overrides próprios, inclusive traits antigos. Referência leva kind/scopeId/
entityId, nunca nome ou prosa global resolvidos. São vínculos neutros, sem
autorizar bytes/perfil/origem ausentes. Classificação antiga ausente ou null
continua distinta; não inventar audiência Mestre/Jogadores.

## Limites

Faixa UTF-8 de até 64 KiB e hash integral, com releitura do documento inline por
unidade; não promete uma leitura física por item. Cache de heads é limitado
à página atual. Tokens não são selo global da aventura. As outras famílias,
mídia autorizada, personas, selo, arquivo integral, restauração e interface
continuam pendentes. Sem writer, namespace persistido, Rule ou endpoint novo.

[Plano 149](../tasks/writer-v2/execucao/149-cenas-e-blocos-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-cenas-e-blocos-no-backup-de-aventuras.md).
