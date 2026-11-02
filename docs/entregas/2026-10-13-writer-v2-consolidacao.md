# Writer V2 — Contratos, escopo e reestimativa

- **Data:** 2026-10-13.
- **Branch/base:** `codex/writer-v2`, `3482a63`.
- **Plano de origem:** [W2-F1-06](../tasks/writer-v2/fase-01-direcao-e-fundamentos/06-contratos-e-replanejamento.md).

## Objetivo

Consolidar a direção aprovada do estúdio e tornar escopo, esforço e condições de
execução verificáveis para autores, mestres e operador.

## Entrega documental

- PRD separa base histórica e V2 aprovado, com cinco espaços e EV-01–08;
  campanhas, distribuição e venda convidada de livros/aventuras permanecem no escopo.
- ADR 0025 formaliza domínio, variantes, projeções e edição/acesso como direção
  técnica futura. Stripe/Connect permanece condicionado à conta/capabilities reais.
- 41 tarefas recebem referência O/C/P de esforço humano; fases 2–5 somam
  1.360/2.232/3.688 h. Timeline amplia o horizonte das antigas janelas de 12 meses,
  separando rotina, reserva, espera e fase 1 já produzida.
- Matriz por incremento explicita condições de CI, histórico/formatos, comércio e
  pilotos. AGENTS registra workflow e limite de evidência dos protótipos.

## Critérios de aceite

- [x] Escopo contempla ambos os públicos, campanhas, comércio e distribuição.
- [x] PRD/arquitetura/ADR/README/testes documentados foram reconciliados sem apresentar módulos futuros como existentes.
- [x] IDs e somas conferem com 41 tarefas; capacidade explica o horizonte ampliado.
- [x] Revisão independente e validação completa locais passaram.
- [ ] CI verde em PR e aceite integral da fase 1; continuam pendentes.

## Arquivos alterados

| Grupo                                                | Alteração                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| README, PRD, architecture, testing                   | Base vigente, direção aprovada e evidências distintas                     |
| AGENTS                                               | Dois acréscimos de workflow/protótipo; caminho conferido, CLAUDE coerente |
| ADR 0025                                             | Contratos incrementais, sem aplicar migração/configuração                 |
| Timeline/JSON                                        | 41 faixas, hipóteses de capacidade e confronto com orçamento antigo       |
| Índices, arquitetura proposta, tarefa/execução F1-06 | Estado real, condições e referências coerentes                            |
| READMEs fases 1–5                                    | Horizonte revisado e aceite preservado                                    |

## Testes e validações executadas

Não houve mudança de comportamento produtivo nem adição de testes espelhando
documentos. A suíte existente foi executada como gate; UI do protótipo não mudou
e seus 30 percursos anteriores permanecem referência histórica, sem reexecução
visual neste incremento documental.

```text
Test Files  116 passed (116)
     Tests  851 passed (851)
Statements : 92.86%
Branches   : 86.43%
Functions  : 91.32%
Lines      : 94.93%
scripts: tests 69 / pass 69 / fail 0
functions: tests 87 / pass 87 / fail 0
Smoke test do bundle OK.
```

`npm ci --prefix functions` e `npm run validate` terminaram com código 0.
Arquitetura, docs, styleguide, formato, lint, tipos, backend syntax, build e smoke
passaram. Revisão independente não encontrou bloqueadores. Conferência aritmética
e inventário confirmou 41 IDs únicos e horizonte ativo 90,93/149,43/247,21 semanas.
Node 24.21.0/npm 10.6.0: instalação avisou engine Node 22 de functions e dependências
deprecated; audit retornou zero vulnerabilidades. Build mantém avisos de chunks
grandes e importação dinâmica ineficaz de exportDocx.

Evidência e atualização final de estado foram escritas depois do gate; docs,
formato scoped e diff são reconferidos antes do commit.

## Fora do escopo, limites e pendências

Sem código produtivo V2, migração, regra nova, conta alterada, pagamento, coleta
humana, push ou deploy neste incremento. Trabalho paralelo no checkout original
permanece preservado; ADR 0024 não foi integrado por esta consolidação.

Estimativas têm baixa confiança e não são horas efetivas, compromisso de data ou
intervalo estatístico. Configuração/capacidades comerciais, contratos, histórico/
formatos e participantes/observações conservam seus portões. CI/PR não foi executada.
Preparar F2-01 não equivale a liberar implementação ou concluir fase 1.

## Como verificar manualmente

1. Conferir [PRD](../prd.md) e [ADR 0025](../decisions/0025-writer-v2-contracts.md):
   base atual separada da direção futura; EV-01–08 preservados.
2. Comparar [timeline](../tasks/writer-v2/timeline.md) e JSON: 41 tarefas, totais e
   capacidade semanal; fase 1 total não contabilizada como restante.
3. Ler [matriz de condições e resultados](../tasks/writer-v2/execucao/06-contratos-e-replanejamento.md):
   CI/comércio/humano e aceite integral continuam pendentes.
