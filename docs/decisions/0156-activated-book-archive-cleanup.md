# ADR 0156 — limpeza privada após ativação de livros

## Estado

Aceita em 2026-10-25. Implementação interna do
[plano 135](../tasks/writer-v2/execucao/135-limpeza-pos-ativacao.md).

## Contexto

Ativação e finalização da mídia não devem apagar o livro que já pode ter sido
editado. O cancelamento anterior à ativação não é um mecanismo de limpeza desse
arquivo. Recibos originais ainda provam ativação e disponibilidade de personas.

## Decisão

Criar getBookRestoreArchiveCleanup e advanceBookRestoreArchiveCleanup internos.
Controle privado em archiveCleanup/current sob o job; recibos separados em
bookRestoreArchiveOperations. Não alterar job/recibo/reserva de ativação,
conclusão/recibo de mídia, lote de personas ou recursos ativos.

Cada transação reautoriza ativação e mídia originais e autentica o controle pelo
nascimento do primeiro recibo e updateTime do último. Entrada fechada com
operationId/expectedRevision; contexto liga layout, job, ativação e mídia.
Replay de recibo antigo devolve sua confirmação e progresso atual. Operação nova
depois de done não cria recibo ou efeitos.

Apagar journals em páginas de oito. Se o alvo pertence às seis famílias privadas
do job, autenticar também seu nascimento/recibos e removê-lo. Para livro ou perfis
ativos, autenticar e apagar somente o journal: não ler, revalidar ou apagar o alvo
que o usuário já pode ter alterado ou excluído.

Percorrer os recibos originais por restoreId e ID, um por unidade. Apagar chunks
imutáveis nascidos com seu append e provas de integridade nascidas com seu avanço,
limitadas à janela original de 16. Preservar todos esses recibos. Confirmar
totais exatos de chunks, bytes, provas e operações antes de avançar.

Apagar validationIndex e validationItems em páginas de oito, por identidade,
origem e recibo nativo; não ler os valores de prosa/índice ou bytes do upload.
Apagar o estado final somente por hash/checkpoint/nascimento e última atualização
originais. Terminar conferindo os 13 namespaces conhecidos vazios e a ausência da
chave de recuperação. Controles/recibos guardam somente metadata, sem catálogo
crescente. No máximo 18 writes por unidade, incluindo controle e recibo.

## Capa retirada pelo proprietário

Antes da limpeza, mídia pode concluir unavailable quando a imagem original,
ainda com URL null, foi retirada e está deleted, com origem/prova/nascimento
originais, contador zero e nenhum uso. Não fazer I/O Storage, criar imagem ou
alterar raiz. Se a retirada ocorre durante o I/O de outra tentativa, aquela
tentativa falha; uma nova observa a retirada confirmada. Registro ausente,
recriado ou em exclusão não substitui essa prova.

## Consequências e limites

Preservar raiz, fontes, corpos, histórico, lore, universo e biblioteca, mesmo após
edição ou exclusão normal. Recibos e reservas permanentes não concedem conteúdo;
leitores normais continuam usando sua autorização atual. SDK não acessa os novos
controles/recibos.

Dados incertos, órfãos e origens recriadas interrompem a limpeza sem apagá-los.
O layout é fechado e deve evoluir com namespaces novos. A verificação não é
snapshot global contra mutações Admin arbitrárias nem inventário recursivo de
filhos desconhecidos sob pais inexistentes. Limpeza do arquivo não é exclusão
integral de toda metadata histórica do projeto.

Sem novo endpoint, host ou UI. Roundtrip integral e inventários/legados/rollout/
validate de P1, fases 3–5 e condições humanas/comerciais continuam pendentes.
[Evidência](../entregas/2026-10-25-writer-v2-limpeza-pos-ativacao.md).
