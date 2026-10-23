# P1 / M38c3h — Materialização servidor das fichas inline

## Objetivo e aceites

Completar o suporte de origem inline do compositor do [plano 84](84-composicao-das-geracoes-de-lore.md),
sem reenviar prosa pelo cliente. Valores herdados são lidos da origem reautorizada;
campos/removals/slots novos continuam prevalecendo. Ausências, datas, ordem,
duplicatas e relações são preservadas.

1. Materializar campos presentes e páginas herdadas por uploads privados existentes:
   uma parte por unidade, selo de até 16 partes e reserva nativa na geração preparing.
2. Identidade do filho deriva do token nativo do pai e alvo. Início do filho,
   avanço, selo/reserva e recibo do pai compartilham transação. Nenhum ponteiro
   ou valor materializado vem no pedido público do compositor.
3. Registrar no pai somente alvo/ref/hashes/operação, nunca prosa. Validar nascimento
   original do filho e prova do início a cada retomada.
4. Slot materializado tem prova específica servidor, preservando o contrato
   dos slots de uploads enviados pelo criador. A mesma lease/inventário continua
   protegendo bytes até cancelamento/adoção.
5. Cancelar em qualquer estágio, inclusive filho ainda uploading/verifying/sealed,
   após revogação, deleting ou exclusão. Limpar filho em preparação antes dos
   slots; não contar filho não reservado nem recontar reserva concluída.
6. Copiar relações por páginas e achatar todos os campos em storage v2 sem base,
   auditar com o compositor existente e preservar raiz/clock/publicação.
7. Testar conteúdo literal, controles escapados acima de 16 partes, campos ausentes/
   removidos/substituídos, relações/diff, retomada/CAS/replay/rollback, revogação
   e recriação de filho/provas. SDK deve comprovar transações/nascimentos reais.

## Implementação e sequência

- Permitir execução interna do serviço de upload na transação nativa do pai,
  mantendo o contrato externo e a autorização existente.
- Novo módulo de materialização/cleanup do filho, integração dos slots nativos
  e composição inline. Estado opcional mantém preparações payload existentes.
- Trocar o teste temporário de recusa por provas de suporte inline completo.
- Testes dirigidos Node/SDK; revisão; ADR/AGENTS/docs/evidência; commit local.

## Limites e riscos

Sem dependência, endpoint, worker ou UI nova. Materialização servidor pode
recalcular JSON da origem inline para obter a parte, mas não guarda PDF/prosa
no checkpoint do pai. A origem inline real está limitada pelo documento Firestore;
JSON escapado pode ocupar mais partes sem exigir um write monolítico.

O recibo do filho não pode existir sem o avanço do pai na mesma transação.
Cancelamento precisa descobrir o filho antes de ler slots e preservar fences.
Recriações e fonte divergente impedem retomar, sem apagar conteúdo alheio.

Adoção CAS/leases/clock/privacidade/recibo, exclusão do livro/lore, consumidores,
backup e integração cliente seguem obrigatórios antes de habilitar escrita ativa.
P1/F2-09/V2 continuam abertos; validate integral no fechamento de P1,
CI ignorada e somente commits locais.

## Evidência e sequência

[Entrega](../../../entregas/2026-10-23-writer-v2-materializacao-das-fichas-inline.md)
e [ADR 0100](../../../decisions/0100-server-lore-inline-materialization.md):
134 Node e três SDK distintos positivos, em rodadas dirigidas. Materialização
servidor e cleanup antes da reserva implementados; vínculo privado também impede
apropriação/cancelamento isolados por outro fluxo.

Adoção ativa, leases adopted, exclusão e integração de consumidores/backup/
cliente ainda pendentes. Nenhum endpoint/UI/worker/deploy. P1/F2-09/V2 abertos.

## Continuidade

[Plano 86](86-adocao-atomica-das-geracoes-de-lore.md) integrou adoção interna,
incluindo filhos materializados, consentimento lógico e leases por estado nativo
da geração. Criação/exclusão e integração cliente/consumidores seguem pendentes.
