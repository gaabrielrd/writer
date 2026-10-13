# Validação deste planejamento

**Data:** 2026-10-12. **Escopo:** documentos de planejamento, sem implementação de funcionalidades.

## Evidência inicial

- Inspeção do checkout, documentação vigente, grafo e serviços de publicação/exportação.
- 41 tarefas nas cinco fases da V1 e nove candidatos na fase 6.
- Instalação de functions concluída; Node 24.21.0/npm 10.6.0 disponíveis, com aviso de engine Node 22 de functions.
- Primeira execução de npm run validate passou por skills, arquitetura, docs, styleguide, formato e lint;
  falhou ao iniciar Vitest no sandbox com spawn EPERM e carregamento do binding Tailwind.
  Essa execução não comprovou testes ou build.

## Verificação final

| Verificação           | Resultado observado                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Inventário da pasta   | 64 documentos Markdown: 50 tarefas e 14 documentos de apoio/índices                            |
| IDs e dependências    | 50 IDs únicos, 90 dependências existentes, sem ciclos ou dependência para fase futura          |
| Distribuição          | 6, 9, 8, 12, 6 e 9 tarefas nas fases 1 a 6                                                     |
| Estrutura das tarefas | Objetivo, entradas/resultado, escopo, passos, aceite, validação, riscos e não escopo presentes |
| Índices e cobertura   | Seis índices conferidos; todas as tarefas e EV-01 a EV-08 na matriz                            |
| LF e estado           | Sem CRLF; nenhum aceite funcional futuro marcado como concluído                                |
| Links/comandos        | npm run check:docs passou                                                                      |
| Gate completo         | npm run validate terminou com código 0 fora do sandbox                                         |
| Frontend              | 109 arquivos, 768 testes passaram                                                              |
| Scripts               | 69 testes passaram                                                                             |
| Backend               | 73 testes passaram e syntax checks passaram                                                    |
| Build                 | Typecheck, build e smoke passaram                                                              |
| Preservação           | Nenhum código do produto editado; SHA-256 do arquivo paralelo capturado permaneceu igual       |

Cobertura observada: 92,63% statements; 86,05% branches; 91,14% functions; 94,71% lines.
O build conserva avisos de chunk acima de 500 kB e importação dinâmica ineficaz de exportDocx.
Depois do registro final, links e formatação dos documentos foram conferidos novamente e passaram.

## Revisão final

Escopo restrito ao planejamento, índice de tarefas e registro de evidência.
Decisões confirmadas estão separadas de hipóteses e pendências com tarefa responsável.
Os limites históricos de PRD/arquitetura/AGENTS não foram revogados por proposta documental.
O prazo de 12 meses é orçamento inicial: 960 h de fases + 80 h de reserva, sujeito à estimativa da fase 1.
Os candidatos posteriores preservam ideias do brainstorm sem criar requisito retroativo da V1.
Não foram adicionadas dependências nem testes de runtime para uma mudança documental.

## Limite da evidência

Tarefas futuras permanecem planejadas. Checks do Writer atual e links válidos não provam
que campanhas, pagamentos ou novas publicações já existem. CI, commit, produção e aceite
humano não foram executados por esta rodada de planejamento.
