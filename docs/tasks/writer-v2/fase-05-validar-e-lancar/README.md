# Fase 5 — Validar e lançar

**Estado:** Planejada; tarefas não executadas.
**Janela:** Meses 10–12. **Capacidade:** 240 h brutas como orçamento inicial, não estimativa validada.

## Objetivo

Validar operação, resultados e qualidade para lançar a V1 pública do ecossistema.

## Entrada

Fase 4 aceita em sandbox, com produto integrado e procedimentos comerciais implementados.

## Entregas

- Onboarding e piloto de usabilidade.
- Métricas, linha de base, custo e capacidade operacional.
- Validação integrada de regras, dados, interface e artefatos.
- Suporte e runbooks; rollout/migração/recuperação ensaiados.
- Piloto comercial real autorizado e auditoria final de lançamento.

## Tarefas em ordem

| Tarefa                                  | Descrição                                            | Dependências                 |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| [W2-F5-01](01-onboarding-e-piloto.md)   | Preparar onboarding e piloto das duas jornadas       | W2-F4-11, W2-F4-12, W2-F1-05 |
| [W2-F5-02](02-metricas-e-economia.md)   | Medir uso, custo e capacidade operacional            | W2-F5-01                     |
| [W2-F5-03](03-qualidade-integrada.md)   | Validar qualidade, segurança e regressões integradas | W2-F5-01, W2-F5-02           |
| [W2-F5-04](04-operacao-e-suporte.md)    | Preparar operação, suporte e atendimento             | W2-F5-03, W2-F4-11           |
| [W2-F5-05](05-rollout-e-recuperacao.md) | Preparar rollout, migrações e recuperação            | W2-F5-04, W2-F5-03           |
| [W2-F5-06](06-aceite-e-lancamento.md)   | Auditar aceite e lançar a primeira versão pública    | W2-F5-05, W2-F5-02           |

Seguir a ordem da tabela como roteiro solo; as dependências identificam pré-requisitos reais.
Uma tarefa só inicia execução quando suas decisões necessárias estão fechadas.
Não é necessário executar tarefas em paralelo para cumprir o plano.

## Portão de saída

- [ ] As duas jornadas e EV-01 a EV-08 têm evidência por requisito.
- [ ] Critérios humanos e gates técnicos do SHA candidato foram atendidos.
- [ ] Piloto real foi autorizado e conciliado; sandbox é identificado separadamente.
- [ ] Operação, licenças, suporte e capacidade têm responsáveis/políticas.
- [ ] V1 pública não omite venda, distribuição ou campanhas.

Para tarefas implementadas, aplicar [validação transversal](../validacao-e-aceite.md) e a definição de concluído.
O planejamento desta fase não é evidência de entrega do produto.
Usar [decisões e riscos](../decisoes-e-riscos.md) para hipóteses e
[timeline](../timeline.md) para reestimativa.
A fase seguinte de implementação só avança após o portão; estudo preparatório não equivale a aceite.

## Demonstração e evidência

Registrar resultado das jornadas de autor e mestre, origem dos dados de teste, data/ambiente/SHA, falhas corrigidas e pendências.
Distinguir validação documental, execução automatizada, sandbox comercial, produção e aceite humano.

[Voltar ao índice](../README.md).
