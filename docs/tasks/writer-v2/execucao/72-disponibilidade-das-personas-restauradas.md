# P1 / M36a — Disponibilidade das personas restauradas

## Objetivo

Preparar biblioteca, referências e consumidores antes de instalar novas cópias
globais. Preservar perfis atuais e impedir edição/seleção/reutilização dos perfis
de uma restauração ainda pendente ou cancelada.

## Contrato e suposições

- Perfis restaurados usarão restoreOrigin fechado: schemaVersion 1, bookId novo,
  restoreId e jobToken. O snapshot portátil continua sem essa metadata operacional.
- Lote users/UID/aiPersonaRestoreBatches/bookId guarda identidade, estado
  preparing/active/cancelled, profileCount e IDs dos recibos primeiro/último.
  Só servidor escreve lote ou instala restoreOrigin. Nenhum produtor é habilitado
  neste incremento: M36b deverá criar lote/perfis sob inventário ampliado.
- Lote só poderá ficar active junto da futura ativação autorizada do livro.
  Depois da ativação, permanece para as personas continuarem na biblioteca quando
  o livro for excluído. Cancelamento nunca libera perfis pendentes.
- Servidor confere lote ativo, identidade integral e nascimento/última alteração
  vinculados a recibos imutáveis do instalador/ativador. Recriação/alteração do
  lote ou recibos falha fechada. Perfil legado sem restoreOrigin mantém contrato.
- Biblioteca própria pode ler os registros já pertencentes ao usuário; essa
  leitura não autoriza IA nem vínculo. Serviços de lista/assinatura só entregam
  perfis disponíveis, com assinatura de lote sob demanda e invalidação em erro.
  Sem perfis restaurados, não consultar a coleção nova: manter clientes legados.
- Rules bloqueiam criação/falsificação/remoção de restoreOrigin pelo SDK, edição
  de perfil pendente/cancelado e vínculo a ele em livro/complemento. Preservar
  create/update/revisão/data de perfis legados; SDK não escreve lotes.
- savePersona verifica lote dentro da transação e conserva a metadata operacional
  nativa ao salvar, sem aceitá-la do input do editor.
- IA de cenas/histórico, backup de personas/rascunho e escritor legado de
  complementos usam o mesmo gate. Perfil indisponível não autoriza derivados;
  perguntas próprias/prosa aplicada preservam os contratos existentes.

## Arquivos e sequência

1. [x] Contratos puros compartilhados (.mjs/.d.mts) e gate nativo do servidor.
2. [x] Leitores de IA/histórico/backup e validador de complemento.
3. [x] Serviço cliente de lista/assinatura/edição e Rules.
4. [x] Testes dirigidos Node/Vitest/SDK, inclusive transições e ABA.
5. [x] Revisão, ADR/documentação/evidência e commit local.

Não muda componente visual, dependency, crédito, API pública ou semântica de
personas comuns. Não materializa perfil global nem ativa livro/lote. Antes de
habilitar M36b, publicar juntos guardas/Rules/cliente compatíveis e drenar
clientes antigos. Nenhum deploy está autorizado neste trabalho.

M36b/instalação, disponibilização da capa, campos grandes/consumidores,
certificação/ativação e host/UI/roundtrip/validate integral continuam obrigatórios.
P1/F2-09 e Writer V2 abertos; apenas commits locais, sem CI/push/PR/subagentes.
