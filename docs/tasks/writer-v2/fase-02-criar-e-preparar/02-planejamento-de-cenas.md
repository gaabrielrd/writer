# W2-F2-02 — Planejar cenas e organizar a escrita

**Estado:** Concluído tecnicamente em `f4449a5`; validações locais, CI completo e regras verdes. Confirmação remota registrada na entrega.
**Evidência:** [Entrega de cenas](../../../entregas/2026-10-13-writer-v2-cenas.md).
**Dependências:** [W2-F2-01](../fase-02-criar-e-preparar/01-projetos-e-navegacao.md)
**Áreas:** scenes, books, editor e adventures. [Contrato executável](../execucao/08-planejamento-de-cenas.md).

## Contexto e objetivo

Dar a autor e criador de aventura uma unidade de planejamento com objetivo e conflito ligada ao texto.

## Entradas e resultado

Entradas: capítulo/parte, título, objetivo, conflito, ponto de vista e referências de lore. Resultado: cenas ordenáveis com plano e conteúdo associados.

## Escopo e comportamento

- Criar, editar, ordenar, mover e arquivar cenas pelo limite aprovado.
- Oferecer quadro/lista de planejamento por estado com alternativa por teclado às ações de arrastar.
- Manter relação explícita entre cena e capítulo sem duplicar silenciosamente texto.
- Separar metadados privados de prosa exportável; aventura permite cena e caminhos possíveis em texto estruturado.

## Passos de execução

- [x] Definir contrato da cena e compatibilidade com capítulo sem cenas.
- [x] Implementar persistência e operações de ordem/movimentação.
- [x] Integrar planejamento e abertura contextual do editor.
- [x] Cobrir remoção/movimentação concorrente e referências indisponíveis.

## Critérios de aceite

- [x] Mover uma cena preserva seu texto e referências.
- [x] Livro legado sem cenas mantém leitura e exportação atuais.
- [x] Quadro é operável por teclado e revela falha sem perder preenchimento.
- [x] Notas de planejamento não aparecem na publicação por padrão.

## Validação

- Modelo: ordenação e compatibilidade com capítulos legados.
- Componentes/E2E: criar, editar e mover por teclado; regras: mutação por proprietário.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Operador definiu cena como documento com texto próprio; capítulo/parte reúne cenas ordenadas.
- Arquivo retira a cena da composição e preserva texto/restauração, conforme escolha explícita.
- Concatenação pode introduzir perda de formatação; testar conteúdo rico existente.

## Não escopo

Editor de roteiro audiovisual, diagramação de impressão e árvore automatizada de decisões.
