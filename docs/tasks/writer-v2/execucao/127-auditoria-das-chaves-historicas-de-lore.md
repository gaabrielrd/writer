# P1 / M38c8 — Auditoria das chaves históricas de lore

## Objetivo

Resolver chaves remanescentes de livros já apagados antes do plano 126,
sem inventar uma raiz, reabrir texto ou varrer namespaces. A auditoria deve
ser utilizável antes do rollout, com relatório revisável e aplicação explícita.
Nenhuma execução contra produção está autorizada neste incremento.

## Requisitos e decisões

- Serviço interno administrativo por UID, com páginas de até 50 controles.
  Somente metadata/IDs/provas/contagens; nunca nomes, prosa ou material AES.
  Erro de infraestrutura interrompe a página, sem tratá-lo como dado inválido.
- Controle próprio exige raiz/prova/terminal nativos e intenção fechada, pelo
  store existente. Chave presente exige schema e nascimento imutável original,
  conferidos por fieldMask; índice declarado exige identidade original.
- Elegível somente se a raiz do livro estiver ausente e deletedBooks tiver
  exclusivamente deletedAt válido (número ou Timestamp legado), com atualização
  nativa posterior à reserva. Marcador de restauração não prova exclusão.
  Não inferir exclusão integral de todos os recursos a partir desse marcador.
- Livro existente, inclusive recriado, nunca é candidato automático.
  Controle inconsistente, chave/índice recriados ou resíduo de controle já
  fechado ficam para revisão. Sem marcador válido, preservar e sinalizar.
- Resultado elegível fixa requestHash/jobToken/deletionToken da observação.
  Aplicação usa somente essa revisão e reconfere tudo na mesma transação.
  Mudança de marcador ou reaparecimento do livro impede a revogação.
- Terminal/prova e remoção da chave/índice originais são atômicos.
  Recibos/controle/cópia local ficam preservados; reaplicação confirma o
  fechamento histórico sem excluir resíduo posterior.
- CLI exige projeto e UID explícitos, gera relatório por padrão e aplica só um
  arquivo revisado do mesmo projeto/UID. Flags fechadas, limite do arquivo de
  metadata, retomada idempotente de resultado parcial e erros sanitizados.
  Sem endpoint novo, job automático, scheduler ou implantação.

## Sequência e arquivos

1. Serviço bookLoreRecoveryAudit: captura privada, classificação e aplicação
   de uma revisão; origens/tokens nativos e transações limitadas.
2. CLI functions/scripts/audit-book-lore-recovery.mjs com leitura/aplicação
   explícitas e sem inicializar SDK antes de validar os argumentos.
3. Testes Node de elegibilidade, paginação, erros/identidades/rollback,
   fechamento repetido, resíduo e CLI. SDK real para concorrência, Timestamp
   legado, transação e preservação de recriados.
4. Revisão, lint/sintaxe/arquitetura/docs/formato, ADR/AGENTS/evidência e commit
   local. Validate integral no fechamento de P1; sem CI/push/deploy.

Arquivos previstos: novo serviço/CLI, testes Node/SDK e documentação.
Reutilizar store/índice/provas existentes; nenhum writer normal ou RPC muda.

## Aceites e limites

Testar controles antigos/atuais/criação, mais de uma página e UID isolado;
ausência/alteração/recriação de prova, livro, chave, índice e marcador; datas
legadas e reserva de restauração; chave ausente; erro de infraestrutura;
rollback nativo, revisão velha e reaplicação com resíduo tardio.

Marcador e ausência atuais permitem revogar uma capacidade própria já
indisponível; não provam limpeza completa nem inventam bookBirth. Órfãos sem
controle/prova ou sem marcador exigem reconciliação individual, sem delete
automático. O relatório não garante inventário global vazio: páginas podem
mudar e novos controles exigem nova auditoria. Escopo explícito por UID;
operação em produção e conferência de todas as contas continuam gates de rollout.

Demais namespaces/escritores/consumidores, backup/restauração, drain/rollout/
validate de P1 e fases 3–5/gates humanos/comerciais seguem no objetivo.

## Evidência e continuidade

[ADR 0146](../../../decisions/0146-historical-lore-recovery-key-audit.md),
[operação](../../../lore-recovery-audit.md) e
[entrega](../../../entregas/2026-10-25-writer-v2-auditoria-das-chaves-historicas.md):
45 Node distintos e quatro SDK positivos, incluindo CLI real no emulador.
Serviço/relatório/revogação e CLI implementados localmente; sintaxe259 e
checks dirigidos positivos. Nenhuma conta real auditada.

Execução no escopo autorizado e revisão de casos pendentes continuam condições
operacionais de rollout. Demais namespaces/escritores/consumidores, backup/
restauração, inventário completo, drain/rollout/validate de P1 e fases/gates
seguem necessários. Somente commit local, sem CI/push/PR/merge/deploy.
