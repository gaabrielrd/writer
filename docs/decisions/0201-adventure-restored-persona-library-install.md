# ADR 0201 — instalar personas de aventura com lote privado

Data: 2026-10-27. Estado: implementado internamente; ativação pendente.

## Contexto

A preparação de aventuras conserva snapshots e bindings privados deduplicados.
O contrato v2 da ADR 0200 distingue sua procedência e disponibilidade, mas ainda
era necessário copiar os perfis para a biblioteca sem expor um lote incompleto,
adotar documentos atuais por coincidência ou remover biblioteca preexistente.

## Decisão

Após universe-ready, percorrer definições comprovadas por kind e cursor privado
de nome de documento, com limit 1. Reabrir o journal/target originais e conferir
perfil portátil exato, ID, hash, proprietário e identidade. Instalar por strict
create em users/UID/aiPersonas, com endereço persona/aiPersonas/ID no journal
existente. Preservar snapshot, arquivo, datas, revisão e traits; bindings/
overrides permanecem como preparados e não duplicam perfil compartilhado.

Perfil/journal, lote preparing, checkpoint e recibo confirmam juntos. Primeira
unidade cria lote nativo mesmo sem perfis; a passagem final exige quantidade
igual a personaProfiles e nenhum candidato seguinte. Fases persona-library e
persona-library-ready conservam os metadados anteriores. View expõe somente
quantidade/revogação; o cursor fica privado. Namespace preexistente não é adotado.

Lote usa origem v2 e prova nativa de primeiro/último recibo. O leitor interno
reconfere batch completo, hash no último efeito, primeiro efeito, contador do job
e operações originais. Cada atualização muda lastOperationId, evitando escrita
idêntica com updateTime preservado. Não ativa lote, projeto ou countReady.

O primeiro avanço de cleanup confirma state cancelled e seu recibo antes de
deletar bytes/targets, sem avançar cursor/fase de limpeza nessa unidade.
Perfis só são removidos com lote cancelado e journal/prova da mesma encarnação.
Lote/recibos cancelados ficam permanentes; a quantidade histórica não é reduzida.
No fim, consultar de forma limitada o namespace desse projeto e recusar perfis/
journals órfãos. Jobs anteriores sem instalação exigem ausência do lote/namespace.

## Consequências e limites

A instalação não tem limite agregado de 500 writes porque cada unidade cria no
máximo um perfil; não há transação final que copie todos. O teste atual cobre
dedupe e perfis distintos, não benchmark operacional de um catálogo de 501 perfis.

Disponibilidade continua bloqueada até ativar lote e raiz juntos após auditoria.
Perfis preparing são legíveis pelo próprio dono pelas permissões atuais da
biblioteca, mas ficam fora de seletores/edição/vínculo e dos consumidores de IA/
backup. O instalador continua interno, sem endpoint ou UI próprios.

Documento recriado/adulterado bloqueia limpeza e é preservado. Root mínimo
aposentado e reserva não são liberados. Mídia, agregados/audit/ativação,
recuperação cifrada/UI/roundtrip e etapas seguintes permanecem obrigatórios.
