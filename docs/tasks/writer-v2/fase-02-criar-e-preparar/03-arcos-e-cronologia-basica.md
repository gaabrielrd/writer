# W2-F2-03 — Relacionar arcos e cronologia básica

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas propostas:** books, universes, lore; proposta adventures. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir acompanhar a evolução de personagens e eventos usando referências às cenas, sem reconstruir automaticamente o cânone.

## Entradas e resultado

Entradas: entidade de lore, arco, evento e cena vinculada. Resultado: lista cronológica e percurso do arco com acesso ao trecho de trabalho.

## Escopo e comportamento

- Registrar arco com estado inicial, objetivo, marcos e desfecho planejado.
- Associar eventos ordenados a cenas e entidades; calendário fictício segue escolha de D-02.
- Apresentar cenas onde a entidade foi vinculada, distinguindo referência explícita de detecção textual.
- Preservar referência removida como indisponível e impedir que vínculos revelem projeto privado a outro participante.

## Passos de execução

- [ ] Definir contratos e ordem temporal escolhida.
- [ ] Implementar vínculos e consultas paginadas.
- [ ] Montar listas de arcos/eventos com abertura de cenas.
- [ ] Testar remoção de entidade, cena e troca de universo.

## Critérios de aceite

- [ ] Autor percorre um arco e mestre encontra acontecimentos da aventura.
- [ ] Reordenar evento não altera ordem de capítulos nem prosa.
- [ ] Cena excluída não deixa navegação quebrada ou conteúdo de outro projeto.
- [ ] Todas as consultas respeitam o acesso à origem.

## Validação

- Modelo: eventos sem data, ordem e vínculos inválidos.
- Componentes/regras: consulta de origem privada, entidade removida e navegação.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Calendário complexo pode consumir o orçamento; básico deve ser especificado e visual avançado fica na fase 6.
- Não prometer análise automática de todas as ocorrências.

## Não escopo

Cronologia gráfica avançada, cálculo astronômico e detecção por IA de eventos.
