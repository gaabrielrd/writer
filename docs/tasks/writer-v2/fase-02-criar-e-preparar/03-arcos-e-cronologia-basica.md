# W2-F2-03 — Relacionar arcos e cronologia básica

**Estado:** Implementado; validate integral final, QA completo, 74 regras e produção verdes localmente. Git e CI do incremento pendentes.
**Execução:** [contrato, escolha temporal e gates](../execucao/09-arcos-e-cronologia.md).
**Dependências:** [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas:** narrative-planning, books, adventures, scenes e origens de lore/universo.

## Contexto e objetivo

Permitir acompanhar a evolução de personagens e eventos usando referências às cenas, sem reconstruir automaticamente o cânone.

## Entradas e resultado

Entradas: entidade de lore, arco, evento e cena vinculada. Resultado: lista cronológica e percurso do arco com acesso ao trecho de trabalho.

## Escopo e comportamento

- Registrar arco com estado inicial, objetivo, marcos e desfecho planejado.
- Associar eventos a cenas e entidades; ordem manual e data textual livre confirmadas pelo operador. D-02 trata de cânone/variantes, não de calendário.
- Apresentar cenas onde a entidade foi vinculada, distinguindo referência explícita de detecção textual.
- Preservar referência removida como indisponível e impedir que vínculos revelem projeto privado a outro participante.

## Passos de execução

- [x] Definir contratos e ordem temporal escolhida.
- [x] Implementar vínculos e consultas paginadas.
- [x] Montar listas de arcos/eventos com abertura de cenas.
- [x] Testar remoção de entidade, cena e troca de universo (unidades, SDK e 96 percursos narrativos completos).

## Critérios de aceite

- [x] Autor percorre um arco e mestre encontra acontecimentos da aventura.
- [x] Reordenar evento não altera ordem de capítulos nem prosa.
- [x] Cena excluída não deixa navegação quebrada ou conteúdo de outro projeto.
- [x] Todas as consultas respeitam o acesso à origem.

## Validação

- Modelo: eventos sem data, ordem e vínculos inválidos.
- Componentes/regras: consulta de origem privada, entidade removida e navegação.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

[Evidência local](../../../entregas/2026-10-13-writer-v2-arcos.md). A conclusão técnica
aguarda os gates finais e o CI do incremento, conforme definição de concluído.

## Riscos e decisões necessárias

- Calendário complexo pode consumir o orçamento; básico deve ser especificado e visual avançado fica na fase 6.
- Não prometer análise automática de todas as ocorrências.

## Não escopo

Cronologia gráfica avançada, cálculo astronômico e detecção por IA de eventos.
