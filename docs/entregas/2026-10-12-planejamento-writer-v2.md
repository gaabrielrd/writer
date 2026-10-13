# Planejamento do ecossistema Writer V2

- **Data:** 2026-10-12.
- **Branch:** codex/editor-paridade.
- **Checkout de referência:** E:\Mega\dev\writer, HEAD 6334a76 na conferência.
- **Plano de origem:** solicitação na conversa para detalhar todo o novo escopo em docs/tasks/writer-v2, fase por fase.
- **Natureza:** entrega documental; nenhuma funcionalidade futura implementada.

## Objetivo

Organizar a evolução do Writer em tarefas executáveis para um estúdio de livros e
campanhas, com autores e mestres igualmente prioritários, distribuição e venda na
primeira versão pública, criadores convidados e desenvolvimento solo de 20 h/semana.

## Entregas documentais

- Cinco fases da primeira versão pública com 41 tarefas detalhadas.
- Uma fase posterior com nove candidatos de descoberta, sem compromisso de lançamento.
- Cada tarefa contém objetivo, entradas/resultado, comportamento, passos, dependências,
  critérios de aceite, validação, riscos e não escopo.
- Escopo/jornadas, decisões pendentes com responsáveis, arquitetura proposta,
  timeline, matriz de cobertura, cenários integrados e portões por fase.
- Referência no índice geral de tarefas, preservando PRD e regras vigentes até aprovação das decisões.

## Critérios de aceite documentais

- [x] O novo escopo foi detalhado em docs/tasks/writer-v2, organizado por fase.
- [x] Autores, mestres, leitores/compradores e operador têm jornadas e tarefas.
- [x] Publicação, arquivos externos, venda, entrega, reversão e repasses estão cobertos.
- [x] Todas as 50 tarefas têm ID, dependências válidas, descrição e critérios verificáveis.
- [x] Hipóteses e candidatos futuros não foram apresentados como decisões aprovadas ou features entregues.
- [x] Timeline usa capacidade informada e prevê reestimativa, sem corte silencioso de escopo.
- [x] Gate completo do projeto passou e resultado real foi registrado.

## Arquivos alterados

| Área                                      | Conteúdo                                                   |
| ----------------------------------------- | ---------------------------------------------------------- |
| [Writer V2](../tasks/writer-v2/README.md) | 64 documentos: 50 tarefas e 14 índices/documentos de apoio |
| [Índice de tarefas](../tasks/README.md)   | Link para o novo planejamento                              |
| Este registro                             | Evidência da entrega documental                            |

Nenhum arquivo de código, configuração, regra ou dependência foi alterado.
Alterações paralelas do checkout ficaram fora do escopo; o arquivo paralelo capturado
por SHA-256 manteve seu conteúdo. O Git do checkout pode evoluir por outras tarefas.

## Testes e validações executados

Nenhum teste de runtime foi adicionado/alterado: o comportamento do produto não mudou.
Uma auditoria ad hoc leu os documentos e verificou IDs, dependências/ausência de ciclos,
seções, LF, estado dos checkboxes, índices e cobertura de requisitos.

| Verificação               | Resultado                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Auditoria documental      | 64 Markdown, 50 tarefas, 90 dependências, zero erros                                             |
| npm ci --prefix functions | Concluído fora do sandbox; aviso de engine Node 22 sob Node 24                                   |
| npm run check:docs        | Passou                                                                                           |
| Formatação scoped         | Prettier aplicado somente aos documentos desta entrega                                           |
| npm run validate          | Código 0: skills, arquitetura, docs, styleguide, formato, lint, testes, typecheck, build e smoke |
| Frontend                  | 109 arquivos, 768 testes passaram                                                                |
| Scripts                   | 69 testes passaram                                                                               |
| Backend                   | 73 testes passaram e syntax checks passaram                                                      |
| git diff --check          | Passou na revisão                                                                                |

Trechos reais da execução final:

```text
 Test Files  109 passed (109)
      Tests  768 passed (768)
All files          |   92.63 |    86.05 |   91.14 |   94.71 |
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ tests 73
ℹ pass 73
ℹ fail 0
Smoke test do bundle OK.
```

A primeira tentativa de validate no sandbox falhou ao iniciar Vitest com spawn EPERM
e erro de carregamento de binding Tailwind; foi repetida fora dele e passou integralmente.
O build conserva avisos de chunk acima de 500 kB e importação dinâmica ineficaz de exportDocx.
Os checks documentais finais de links/comandos e formatação scoped foram repetidos
após preencher esta evidência e passaram.

## Fora do escopo

Implementação de campanhas/comércio, alteração normativa do PRD/AGENTS,
commit/push/PR, CI novo, implantação, cobrança, publicação de obra e mensagens externas.
Testes de regras reais e E2E ampliado são previstos para incrementos funcionais futuros;
não foram executados nesta mudança documental.

## Limitações e pendências conhecidas

Preços, moeda/país, provedor, licenças, regras de atualizações/retirada/reembolso/repasse,
retenção e metas de piloto exigem fechamento nas tarefas da fase 1.
O horizonte de 12 meses é orçamento de capacidade (960 h + 80 h de reserva), não estimativa
de engenharia validada. As tarefas funcionais continuam planejadas e seus aceites desmarcados.
Os resultados do Writer atual não provam implementação do ecossistema futuro.

## Como verificar manualmente

1. Abrir o índice Writer V2 e percorrer as fases 1 a 5 em ordem.
2. Abrir uma tarefa e conferir dependências, descrição, passos e critérios de aceite.
3. Conferir EV-01 a EV-08 na matriz de cobertura e decisões pendentes na fase 1.
4. Conferir que a fase 6 é candidata posterior, sem prazo ou compromisso de implementação.
5. Ler timeline e validação documental para limites de prazo e evidência.
