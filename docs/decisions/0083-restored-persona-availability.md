# ADR 0083 — Disponibilidade das personas restauradas

- Status: aceito para implementação dos consumidores
- Data: 2026-10-23
- Contexto: P1 M36a, depois da ADR 0082

## Problema

As personas preparadas ainda não foram instaladas na biblioteca global.
Cópias globais precisam permanecer indisponíveis para seleção/edição/IA/backup
até a ativação integral, sem exigir uma transação com quantidade ilimitada de
perfis. Os clientes legados e suas personas existentes precisam continuar válidos.

## Decisão e contrato

Perfil restaurado recebe restoreOrigin fechado: schemaVersion 1, bookId
restore-hex64, restoreId e jobToken. Seu ID é custom-hex64. Metadata operacional
não entra no snapshot portátil nem é aceita do input do editor.

Lote users/UID/aiPersonaRestoreBatches/bookId: schemaVersion, ownerId, bookId,
restoreId, jobToken, state, profileCount, createdByOperationId e lastOperationId.
Estado preparing/active/cancelled; contagem inteira segura. Lote será liberado
junto da futura ativação do livro e permanecerá ativo após exclusão desse livro,
mantendo a biblioteca independente do projeto.

Servidor exige identidade integral, estado active e provas nativas:

- Nascimento do lote igual ao nascimento do primeiro recibo imutável:
  advanceBookRestorePersonaLibrary, estado content-verified.
- Última alteração do lote igual ao nascimento do recibo imutável final:
  activateBookRestore, estado activated.
- Recibos próprios, mesma restauração/jobToken, IDs/ação/estado/checkpoint e
  fingerprint válidos. Alteração/recriação do lote ou recibos não reautoriza.

readAvailablePersonaMetadata centraliza esse gate sem ler instruções antes da
disponibilidade. IDs seguros legados mantêm o tratamento anterior de ausência;
restoreOrigin inválido falha fechado. Backup de perfil/rascunho, IA de cenas,
revalidação de histórico e escritor de complementos compartilham o gate.
Respostas derivadas indisponíveis são ocultadas antes de ler o corpo; perguntas
próprias e prosa já aplicada conservam os contratos anteriores.

## Biblioteca e Rules

Lista e assinatura só entregam perfis restaurados de lote próprio ativo.
Consultar/assinar lotes somente quando um perfil os referencia; biblioteca legada
não acessa a coleção nova. Mudanças sem alteração da lista visível não geram
nova notificação, preservando edições durante eventos de lote pendente.
Erro, retirada e fechamento invalidam os observadores correspondentes.

savePersona lê o lote na mesma transação do CAS e preserva a origem nativa.
Rules proíbem SDK de criar/falsificar/retirar restoreOrigin, editar perfil
pendente/cancelado ou vinculá-lo em livro/complemento. Revisão/data/edição
legadas permanecem. SDK não escreve lotes.

Rules conservam a leitura própria dos registros da biblioteca e do lote.
O filtro cliente é apresentação, não prova de procedência nativa; IA/backup
exigem o gate servidor. Nenhuma leitura de outro dono ou novo grant é concedido.

## Sequência e limites

Este incremento não cria lote/perfil global em produção, não muda inventário
de restauração nem ativa livro. As provas de ativação nos testes são fixtures,
não execução do futuro restaurador. M36b deverá instalar cópias sob inventário
ampliado e obedecer aos nomes/estados/recibos deste contrato.

Publicar guardas, Rules e cliente compatíveis antes dos produtores; drenar
clientes antigos. Não recolher lote/recibos ativos na exclusão do livro.
Nenhum deploy está autorizado neste incremento.

Instalação, disponibilização da capa, campos grandes/consumidores,
certificação/ativação e host/UI/roundtrip/validate integral permanecem obrigatórios.
P1/F2-09 e Writer V2 abertos. Sem dependência, crédito, API pública, subagentes
ou CI/push/PR/deploy novos.
