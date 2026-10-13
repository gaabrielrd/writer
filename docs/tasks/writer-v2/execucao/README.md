# Execução do Writer V2

Base inicial: `master a2df540`; branch `codex/writer-v2`, checkout isolado.
Em 2026-10-13, `master d98c1ed` foi integrada sem conflitos por `5e2215e`;
[evidência da atualização](../../../entregas/2026-10-13-writer-v2-sincronizacao-master.md).
Os arquivos do checkout original e seus trabalhos paralelos permanecem preservados.

| Tarefa              | Estado                                                        | Evidência                                                      | Próxima condição                                           |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| W2-F1-01            | Jornadas revisadas; validate local verde; corpus inventariado | [Jornadas e inventário](01-jornadas-e-escopo.md)               | CI pendente; importação/piloto nas tarefas próprias        |
| W2-F1-02            | Contrato revisado; validate local verde                       | [Domínio e medições](02-modelo-de-dominio.md)                  | Critérios funcionais nas fases seguintes; CI pendente      |
| W2-F1-03            | Contrato revisado; validate local verde                       | [Permissões e casos negativos](03-permissoes-e-privacidade.md) | Implementação/regras reais nas fases próprias; CI pendente |
| W2-F1-04 a W2-F1-06 | Planejadas                                                    | [Fase 1](../fase-01-direcao-e-fundamentos/README.md)           | Dependências e decisões de cada tarefa                     |
| Fases 2 a 5         | Não iniciadas                                                 | [Plano](../README.md)                                          | Portão de saída da fase 1                                  |
| Fase 6              | Descoberta futura, fora da primeira versão pública            | [Candidatos](../fase-06-evolucao-pos-v1/README.md)             | Aprovação posterior de escopo                              |

Um documento não comprova uma funcionalidade. Testes locais não comprovam CI,
capacidade comercial live, participação humana ou operação em produção.
Aceite final segue a [definição de concluído](../../../development-process.md).

## Decisões recebidas em 2026-10-13

- Brasil e BRL; Stripe preparado para pagamentos, segundo o operador.
- Criador vende; Writer cobra comissão configurável por contrato e centraliza atendimento.
- Compra avulsa, download e uso da aventura em campanhas próprias.
- Sem revenda do conteúdo autoral exclusivo; licenças de terceiros preservam seus direitos.
- Compra conserva a edição adquirida; atualização opcional; retirada interrompe novas vendas.
- Roteiros de piloto preparados; participantes serão indicados pelo operador.

Criador absorve taxas/reversões e eventual reserva segue contrato. Reembolso integral
ou disputa perdida revoga novos downloads/acesso à edição; notas próprias são preservadas.
Percentuais concretos, calendário, retenção e capacidade real Connect continuam em
[decisões e riscos](../decisoes-e-riscos.md).

## Continuidade

Executar um incremento por vez: plano mínimo, arquivos afetados, resultados reais
de testes, revisão e evidência. Estudos independentes podem usar subagentes;
mutações e aceites dependentes respeitam a sequência.
Pendências externas ficam visíveis enquanto trabalho independente continua.
