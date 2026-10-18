# Fase 2 — Criar e preparar

**Estado:** F2-01 a F2-06 concluídas tecnicamente nos heads registrados na
[execução](../execucao/README.md). F2-07 em execução: adoção C3B concluída em
`947cfc3`, com CI/regras verdes; exclusão integral C4 validada localmente, CI pendente.
F2-08 S1 com contrato revisto para iniciar implementação; F2-09 não iniciada.
Condições humanas/comerciais conservam seus aceites.
**Referência de esforço:** 368/584/936 h; hipótese de entrega 16 h/semana, 36,5 semanas ativas no cenário central.
As antigas 240 h são orçamento histórico; calendário/esperas não estão comprometidos.
Veja [timeline e hipóteses](../timeline.md).

## Objetivo

Permitir criar um conto e preparar uma aventura no mesmo universo, mantendo as campanhas particulares.

## Entrada

Contratos técnicos do incremento fechados e gates técnicos verificados. O operador
autorizou iniciar F2-01 em 2026-10-13, mantendo o aceite humano/comercial pendente;
ver [mudança explícita de sequência](../execucao/06-contratos-e-replanejamento.md).

## Entregas

- Projetos e navegação compatíveis com livros existentes.
- Cenas, arcos, cronologia básica, estados, metas e retomada.
- Versões privadas comparáveis/restauráveis.
- Aventuras, campanhas independentes e preparação de sessões.
- Lore/IA/importação integrados e portabilidade privada.

## Tarefas em ordem

| Tarefa                                            | Descrição                                     | Dependências                           |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| [W2-F2-01](01-projetos-e-navegacao.md)            | Organizar projetos e navegação do estúdio     | W2-F1-06                               |
| [W2-F2-02](02-planejamento-de-cenas.md)           | Planejar cenas e organizar a escrita          | W2-F2-01                               |
| [W2-F2-03](03-arcos-e-cronologia-basica.md)       | Relacionar arcos e cronologia básica          | W2-F2-02                               |
| [W2-F2-04](04-estados-metas-e-retomada.md)        | Acompanhar estados, metas e retomada          | W2-F2-01, W2-F2-02                     |
| [W2-F2-05](05-historico-e-restauracao.md)         | Guardar e restaurar versões do trabalho       | W2-F2-02                               |
| [W2-F2-06](06-aventuras-e-estrutura-narrativa.md) | Criar aventuras com estrutura narrativa       | W2-F2-01, W2-F2-02                     |
| [W2-F2-07](07-campanhas-e-variacoes.md)           | Instanciar campanhas e variantes particulares | W2-F2-06, W2-F1-03                     |
| [W2-F2-08](08-preparacao-de-sessoes.md)           | Preparar sessões com pistas e missões         | W2-F2-07, W2-F2-03                     |
| [W2-F2-09](09-lore-importacao-e-portabilidade.md) | Integrar lore, importação e portabilidade     | W2-F2-05, W2-F2-06, W2-F2-07, W2-F2-08 |

Seguir a ordem da tabela como roteiro solo; as dependências identificam pré-requisitos reais.
Uma tarefa só inicia execução quando suas decisões necessárias estão fechadas.
Não é necessário executar tarefas em paralelo para cumprir o plano.

## Portão de saída

- [ ] Autor cria conto com cenas e restaura uma versão sem perda de texto.
- [ ] Mestre cria aventura/campanha e prepara sessão com NPC, pista e missão.
- [ ] Duas campanhas preservam consequências separadas.
- [ ] Regressão de livros legados, atos, IA e exportações está comprovada.

Para tarefas implementadas, aplicar [validação transversal](../validacao-e-aceite.md) e a definição de concluído.
O planejamento desta fase não é evidência de entrega do produto.
Usar [decisões e riscos](../decisoes-e-riscos.md) para hipóteses e
[timeline](../timeline.md) para reestimativa.
A fase seguinte de implementação só avança após o portão; estudo preparatório não equivale a aceite.

## Demonstração e evidência

Registrar resultado das jornadas de autor e mestre, origem dos dados de teste, data/ambiente/SHA, falhas corrigidas e pendências.
Distinguir validação documental, execução automatizada, sandbox comercial, produção e aceite humano.

[Voltar ao índice](../README.md).
