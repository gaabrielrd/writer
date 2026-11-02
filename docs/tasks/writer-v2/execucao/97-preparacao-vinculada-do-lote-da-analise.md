# P1 / M38c4d A2b2 — Preparação vinculada e limpeza dos filhos da análise

## Objetivo

Preparar e auditar todos os itens locais do manifesto A2b1, com retomada por
unidades, sem alterar fontes, cobrar ou aplicar parcialmente. Globais conservam
a revisão fixada e aguardam A2c. Até 50 itens; adoção/crédito/recibo reais continuam
para A2c, usando A2a. Nenhum callable/UI novo neste incremento.

## Contratos e implementação

1. Estado evolui compativelmente a workflow v2: cursor de membro/etapa/campo,
   preparados, ready, intenção cancelling e cleanup bounded. Preservar eventos
   v1, fences, metadata replay e tokens originais.
2. Cada unidade recebe pedido/CAS/operationId e o conteúdo original para conferir
   requestHash, sem persistir prosa. Reabrir análise original, provedor,
   nascimentos de livro/capítulo/universo e contexto completo por unidade.
3. Registrar proprietário/prova do filho junto de seu nascimento, evento do pai
   e checkpoint. Namespace de IDs analysis-<hash>, analysis-source/edit/field-<hash>
   é reservado ao protocolo. Mapeamento imutável em loreAnalysisChildOwners e
   loreAnalysisChildOwnerProofs permite aos produtores singulares conferir o pai,
   impedindo bypass após cancelamento, ready ou revogação.
4. Capacidade interna ligada à transação autoriza a primeira unidade de um filho
   planejado; índice/prova/raiz nascem juntos. Origem de criação/inspeção vinculada
   só permite filhos previstos. Materialização inline continua sob as provas
   internas da edição, sem abrir produtor arbitrário.
5. Reutilizar serviços existentes com transação injetada: criação ou inspeção,
   upload por campo/parte, seal, reserva/geração, compilação e auditoria. Nenhum
   nested transaction, reads após writes ou corpo livre em checkpoint.
6. Ao concluir um membro, guardar certificado/prova metadata com referência CAS
   da edição pronta, atômico com cursor do pai. Ready só após todos os membros,
   incluindo globais fixados. Certificado não é autorização de origem.
7. Cancelamento fecha o pai antes de limpar: ordem edição, campos e origem;
   uma unidade por transação. Conferir bindings e provas nativas; preservar
   estrangeiros/recriados e sucesso já adotado. Cancel-before-start permanece.
   Cleanup após revogação não concede leitura/produção.
8. Exclusão do livro coordena intenção/limpeza da aplicação e checkpoint juntos,
   conservando cutoff, jobs/fences, índices/provas e compatibilidade legada.
9. Testes dirigidos Node/SDK: inline/v1/v2/criação/global/mistos e 50 itens,
   literal/relações intocadas, retry/concorrência, CAS, nascimentos/provas,
   rollback em bytes/filho/pai/certificado, revogação e bypass singular,
   cancelamento em todas as etapas, cleanup e exclusão sem ressurreição.
10. Revisão, documentação/ADR/AGENTS/evidência e commit local. Validar limites
    reais sem reduzir contratos; suíte completa no fechamento de P1.

## Arquivos e riscos

Workflow/estado/provas/bindings/produção/cleanup da aplicação, serviços e pontos
de origem dos filhos, descoberta de exclusão e Rules dos índices privados,
fixtures/testes e docs. Preservar APIs singulares, hashes e inventários existentes.

Preparação nunca pode invocar a adoção singular de um membro reservado:
A2c deve liberar a adoção integral dentro da transação do pai, débito e recibo.
A reserva não reautoriza fontes. Qualquer perda/recriação de índice/prova/filho
exige reconciliação; não inventar sucesso ou ampliar cutoff.

Produtores/endpoints de editor, demais consumidores, backup/cliente/rollout,
certificação de P1/F2-09/V2 e condições humanas/comerciais continuam pendentes.
Sem dependências, CI, push, PR, merge ou deploy. QA demo/loopback com recursos
limitados conforme o OOM nativo observado no incremento anterior.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-preparacao-vinculada-do-lote-da-analise.md)
e [ADR 0112](../../../decisions/0112-bound-lore-analysis-application-preparation.md):
454 Node distintos e 3/3 SDK positivos em rodadas dirigidas. Node preparou/
limpou 50 locais; SDK levou 50 mistos até ready e conferiu bindings, Rules,
rollback nativo de partes/checkpoint, revogação, exclusão e recriados.

A2b2 implementado internamente, sem aplicar cabeça ou cobrar. A2c deve liberar
adoção conjunta com aplicação global/nova, crédito e recibo reais. Demais
integrações e validate integral de P1 continuam pendentes. Sem CI/push/deploy.
