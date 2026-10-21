# Writer V2 — Preparo de edição e orçamento dos testes visuais

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2
- **Plano:** [execução 34](../tasks/writer-v2/execucao/34-regressao-visual-e-orcamento-ci.md).
- **Estado:** manutenção de testes/CI validada de forma dirigida; aprovação remota
  do novo head pendente. Sem mudança de runtime do produto.

## Objetivo e alterações

A jornada de alias local deve editar depois da prosa e preservar a referência
qualificada. O preparo agora usa foco, seleção e colapso com teclado, observando a
barra de seleção aparecer/desaparecer e a posição colapsada do DOM antes de digitar.
Todas as expectativas anteriores de texto, alias, leitor, dados próprios e layout
continuam presentes. Não há comando que reescreva o conteúdo para fazer o teste passar.

A CI distribui os mesmos casos visuais em 16 shards, com 83 ou 84 casos por parte.
Preserva dois workers, 45 s/caso, 15 min/job, um retry, fail-fast=false,
capturas/traces/blobs por shard e gate E2E que exige produção e todos os shards.
Mais preparações de runner são o custo; duração e filas precisam ser medidas remotamente.

## Evidência que motivou a manutenção

A CI M1 39683718918 teve sete shards verdes e cinco cancelados, agregador falhou;
Node 22/24, auditoria, produção e Rules passaram. Artefatos 3/9 mostraram a jornada
de lore digitando no início em mobile-dark e desktop-sepia, inclusive no retry.
Três outros casos passaram no retry após exceder 45 s. A proximidade do limite
configurado é compatível com orçamento total insuficiente, sem confirmação oficial
da causa de cancelamento somente pelo status.

A jornada original passou localmente em seis perfis Windows (50,370707 s);
isso não invalida a falha remota. A primeira tentativa de preparar apenas o caret
do DOM teve 5/6 positivos: desktop-dark substituiu a prosa toda apesar de indicar
cursor colapsado ao final. Foi acrescentada a observação da seleção reconhecida
pela interface. Não se afirma corrigir um defeito de runtime de Control+End.

## Critérios de aceite

- [x] Seis perfis nativos finais passam, sem retry/skip/flaky.
- [x] Preservadas expectativas anteriores e acrescentadas pré-condições observáveis.
- [x] Coletores finais sem exceções ou requisições externas.
- [x] As 1.332 identidades constam exatamente uma vez na união dos 16 shards.
- [x] Oito contratos CI, tipos E2E, lint, formato, links e diff verdes.
- [x] Nenhum arquivo de runtime/dependência/Rule/armazenamento alterado.
- [ ] CI remota do novo head verde e duração efetiva medida.

## Arquivos alterados

| Arquivo                                       | Mudança                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| e2e/visual/adventure-lore.visual.ts           | Prepara e observa o destino da digitação.                              |
| .github/workflows/ci.yml                      | Matriz e comando com 16 shards, mesmos gates/limites.                  |
| scripts/ci-contracts.test.mjs                 | Exige a nova distribuição sem relaxar gates.                           |
| docs/testing.md e ADR 0024                    | Comandos atuais, motivação, provas e limites.                          |
| Plano 34, registro de execução e esta entrega | Sequência e resultados reais.                                          |
| Entrega M2                                    | Commit/remote e consulta da CI anterior, sem declarar aprovação geral. |

## Validações executadas

```text
Contratos CI: tests 8; pass 8; fail 0; duration_ms 384.6558
Tipos E2E: npx tsc -p tsconfig.e2e.json --noEmit --pretty false — exit 0
Lint dirigido: exit 0
Chromium desktop-dark: expected 1; unexpected 0; flaky 0; duration 13400.052 ms
Chromium demais cinco perfis: expected 5; unexpected 0; flaky 0; duration 42757.356 ms
Coletores: cases 6; retries 0; skips 0; errors 0; externalRequests 0
Enumeração: all 1332; duplicates 0; omitted 0; extra 0; elapsed 21640 ms
```

Enumeração --list/JSON somente, sem executar 1.332 testes: 84 casos em cada um dos
quatro primeiros shards e 83 em cada um dos outros doze. Comparação inclui
ID/projeto/caminho/título contra a suíte sem sharding. Seis projetos mantidos:
desktop/mobile em claro/escuro/sépia. Nenhum grep/project no workflow.

Conforme a preferência do operador por testes necessários, não repetimos
npm run validate para este ajuste somente de teste/configuração/documentação.
A validação completa de produto anterior é a do M2 em 2f80f91: 2.548 testes,
85 scripts, 655 Functions, cobertura 90.98/85.64/90.68/93.62, tipos/build verdes.
Os arquivos de runtime, dependências e Rules permanecem byte a byte iguais.
Não atribuir um novo validate completo ao head desta manutenção.

Evidências privadas em writer-v2-portability-qa: ci-caret-before.json,
ci-caret-after.json (tentativa com falha), ci-caret-sync-dark.json,
ci-caret-sync-others.json, ci-caret-verification.json, ci-16-shard-manifest.json,
enumerate-ci-shards.mjs e ci-maintenance-freeze.json. Capturas são de dados fictícios,
sem prova de autorização de backend ou piloto humano. A seleção inicial com grep
ancorado não descobriu casos e não foi contada como execução positiva.

## Revisão, limites e continuidade

Diff dirigido: sem alteração de src/functions/Rules, dependência, timeout, retry,
cobertura ou critério de sucesso. Regra de AGENTS vigente continua suficiente;
nenhuma regra de produto foi criada/revogada. Sem segredos, mídia ou artefato grande.

A prova final local é Windows. A confirmação do preparo no Linux e a duração da
matriz dependem da próxima CI; resultados anteriores permanecem falhos/parciais.
Não esperar a CI para avançar a P1, conforme autorização do operador.
Sem merge, deploy, provedor pago ou modificação da master original.
Não contar manutenção como tarefa ampla do Writer V2; P1/F2-09 e gates humanos/
comerciais continuam abertos.

## Como verificar

Rodar a jornada autor de adventure-lore nos seis projetos. Seleção deve aparecer,
ser colapsada e reconhecida antes de digitar; prosa anterior, alias e leitor
continuam íntegros. Para conferir distribuição, listar a suíte e cada shard 1/16
a 16/16 e comparar identidades. --list não prova execução nem performance.
