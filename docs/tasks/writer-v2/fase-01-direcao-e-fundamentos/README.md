# Fase 1 — Direção e fundamentos

**Estado:** Em execução; W2-F1-01/02/03 têm entregas documentais revisadas e gate local verde.
Regras e funcionalidades futuras ainda precisam de implementação nas fases pertinentes.
W2-F1-04 tem contrato/pesquisa com capacidade comercial pendente; W2-F1-05 tem
protótipo técnico validado e navegação aprovada, sem piloto humano realizado.
O [registro de execução](../execucao/README.md) contém estados e limites de evidência.
**Janela:** Mês 1. **Capacidade:** 80 h brutas como orçamento inicial, não estimativa validada.

## Objetivo

Resolver decisões que afetam dados, permissões e operação comercial antes de implementação.

## Entrada

Visão e prioridades confirmadas na conversa; inventário atual disponível.

## Entregas

- Jornadas completas de autor, mestre, comprador e operador.
- Contratos de livro, aventura, campanha, universo, edição e variantes.
- Matriz de papéis/audiências e regras de convite/revogação.
- Políticas comerciais/licenças, provedor viável e protótipos.
- Estimativas por tarefa e atualização normativa após aprovação.

## Tarefas em ordem

| Tarefa                                         | Descrição                                          | Dependências                           |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| [W2-F1-01](01-jornadas-e-escopo.md)            | Fechar jornadas e limites da primeira versão       | Abertura                               |
| [W2-F1-02](02-modelo-de-dominio.md)            | Definir domínio, cânone e compatibilidade de dados | W2-F1-01                               |
| [W2-F1-03](03-permissoes-e-privacidade.md)     | Definir permissões, audiências e privacidade       | W2-F1-02                               |
| [W2-F1-04](04-regras-comerciais-e-direitos.md) | Fechar regras comerciais, licenças e provedor      | W2-F1-01, W2-F1-02                     |
| [W2-F1-05](05-prototipos-e-pilotos.md)         | Prototipar jornadas e preparar pilotos             | W2-F1-01, W2-F1-03                     |
| [W2-F1-06](06-contratos-e-replanejamento.md)   | Consolidar contratos, documentação e estimativas   | W2-F1-02, W2-F1-03, W2-F1-04, W2-F1-05 |

Seguir a ordem da tabela como roteiro solo; as dependências identificam pré-requisitos reais.
Uma tarefa só inicia execução quando suas decisões necessárias estão fechadas.
Não é necessário executar tarefas em paralelo para cumprir o plano.

## Portão de saída

- [ ] D-01 a D-12 têm escolhas ou fechamento parcial suficiente para o próximo incremento; nenhuma pendência obrigatória da fase 2.
- [ ] Os estudos comerciais necessários para arquitetura já foram feitos, sem esperar o mês 7.
- [x] Protótipos mostram ambas as jornadas e aprovação foi registrada.
- [ ] PRD/arquitetura/AGENTS afetados foram alinhados conforme W2-F1-06.

Para tarefas implementadas, aplicar [validação transversal](../validacao-e-aceite.md) e a definição de concluído.
O planejamento desta fase não é evidência de entrega do produto.
Usar [decisões e riscos](../decisoes-e-riscos.md) para hipóteses e
[timeline](../timeline.md) para reestimativa.
A fase seguinte de implementação só avança após o portão; estudo preparatório não equivale a aceite.

## Demonstração e evidência

Registrar resultado das jornadas de autor e mestre, origem dos dados de teste, data/ambiente/SHA, falhas corrigidas e pendências.
Distinguir validação documental, execução automatizada, sandbox comercial, produção e aceite humano.

[Voltar ao índice](../README.md).
