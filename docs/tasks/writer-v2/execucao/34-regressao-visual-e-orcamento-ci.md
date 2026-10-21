# Writer V2 — Regressão visual de edição e orçamento da CI

**Estado:** plano dirigido em 2026-10-21, após P1 M2 (2f80f91).
**Escopo:** preparação determinística da jornada de alias local e distribuição
da mesma suíte visual. Não alterar runtime do editor sem prova de defeito nele.

## Evidência e objetivo

CI M1 39683718918: Node 22/24, auditoria, produção e sete shards verdes;
1/3/5/9/11 cancelados perto dos 15 min configurados, agregador falhou.
Artefatos 3/9 têm SHA-256 conferidos. O teste autor de adventure-lore digitou
antes da prosa em mobile-dark e desktop-sepia, inclusive no retry. Três
outras jornadas de sépia excederam 45 s antes de passar no retry. Os três
demais cancelados não mostraram falha antes do cancelamento. Isso não comprova,
sozinho, a causa oficial dos cancelamentos nem um defeito universal de Control+End.

A mesma jornada original passou em seis perfis no Windows: 6/6, 50,370707 s,
zero retry/skip/flaky. Artefato privado ci-caret-before.json. Uma seleção inicial
com grep ancorado não encontrou casos; não contar essa tentativa como teste.

Objetivo: o teste precisa posicionar e observar o caret no fim antes de testar
digitação que preserva alias, sem depender do gesto Control+End no host/CI.
Não substituir conteúdo por evaluate, comandar Tiptap internamente, afrouxar
expectativas, acrescentar sleeps ou aumentar timeouts/retries.

## Solução e arquivos

1. Em e2e/visual/adventure-lore.visual.ts, focar a área, selecionar seu texto
   e colapsar ao fim com teclado nativo (ControlOrMeta+A, ArrowRight).
   Aguardar a barra de seleção aparecer após selecionar e desaparecer ao colapsar,
   conferindo também foco, seleção colapsada e prosa antes do caret por Range de leitura;
   somente então digitar. Preservar todos os asserts de texto, alias qualificado,
   leitor por teclado, persistência privada e responsividade. Esse preparo não
   afirma corrigir um bug de runtime de Control+End.
2. Em .github/workflows/ci.yml, distribuir a suíte inteira em 16 shards,
   conservando dois workers, 45 s/caso, 15 min/job, um retry, fail-fast=false,
   uploads por shard e gate que exige todos os shards mais produção.
   Mais runners/setup é o custo; duração/concorrência dependem do GitHub.
3. Atualizar scripts/ci-contracts.test.mjs, docs/testing.md e ADR 0024 para a nova
   distribuição. O histórico de matrizes anteriores fica preservado.
4. Evidência própria em docs/entregas após validação dirigida e revisão.
   Nenhuma dependência, backend, schema, Rule ou writer de produto alterado.

## Aceites e validação necessária

- Jornada corrigida passa nos seis perfis reais locais sem retry/skip/flaky;
  coletores não registram erros de runtime ou requisições externas.
- Enumerar a suíte completa e todos os 16 shards com --list/JSON, comparando
  identidade (ID/projeto/caminho/título): união exata, sem omissões ou duplicação.
  Enumeração não substitui execução nem prova tempo remoto.
- Rodar os oito contratos dirigidos da CI, lint/tipos E2E já previstos pelo repo,
  formato, links e diff. Validate completo de produto já passou no M2; só testes,
  workflow e documentação mudarão aqui. Repetir a suíte completa apenas se um
  achado exigir mudança de runtime ou ampliação real do risco.
- Registrar hash/PR/checks remotos separadamente, sem esperar a matriz.
  CI anterior permanece falha/parcial, mesmo se o novo teste local passar.

## Limites e continuidade

Não lançar, fazer merge ou deploy; preservar master original. Não declarar
problema de caret de produto resolvido sem prova. Se a nova pré-condição de caret
também falhar, investigar antes de aceitar o ajuste. Após o incremento dirigido,
retomar schema/captura restante de P1, ainda aberto, sem contar esta manutenção
como tarefa ampla do Writer V2.

## Resultado dirigido

Implementado sem alterar runtime. A tentativa de conferir só o DOM falhou uma vez
(5/6): texto inteiro substituído em desktop-dark apesar do caret colapsado ao fim.
O preparo final aguarda a barra de seleção aparecer/desaparecer. Desktop-dark passou
(13,400052 s) e os demais cinco perfis passaram (42,757356 s), em duas execuções
dirigidas sem retry/skip/flaky. Coletores dos seis casos vazios de erros/rede externa.
Oito contratos CI, tipos E2E e lint verdes. Enumeração completa: 1.332 IDs,
84 nos quatro primeiros shards/83 nos demais, união exata sem duplicação.
Sem novo validate completo: produto preserva os bytes validados no M2.
Veja a [entrega dirigida](../../../entregas/2026-10-21-writer-v2-preparo-de-edicao-e-ci.md).
CI nova e medição remota pendentes; P1 continua sendo o próximo trabalho funcional.
