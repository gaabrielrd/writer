# ADR 0268 — Ambientes de teste e execuções locais

- **Status:** Aceito
- **Data:** 2026-11-02

## Contexto

Mesmo os arquivos que declaravam ambiente Node carregavam o setup global de React.
A CLI de setup copiava todo src/docs em cada fixture e o pre-push repetia o frontend.
A execução original de 5.134 testes em 377 arquivos levou 925,08 s no Vitest
(929,627 s incluindo processo e amostragem), com 57 falhas anteriores à alteração,
incluindo expectativas de interface desatualizadas e timeouts. Essa execução não
comprova uma base verde.

## Decisão

Usar ambientes Node e DOM em um único projeto Vitest, preservando isolamento, casos e limites V8 em
85% statements/lines, 75% branches e 90% functions. Somente DOM importa o setup
React. A diretiva existente seleciona Node, sem listas de arquivos ou projetos adicionais. Manter quatro workers no caminho completo e disponibilizar execuções
sem cobertura com dois workers, por mudanças ou de todo o frontend.

Reduzir a fixture de setup aos arquivos realmente operados pela CLI e conservar
todos os cenários de execução, idempotência e rollback. Limitar os scripts a
dois arquivos simultâneos; Functions já usa esse limite e não é alterado.

No pre-push, usar o SHA do destino fornecido pelo Git quando é ancestral do
checkout enviado. Sem essa prova, executar todo o frontend. Exclusões isoladas
de refs não enviam código e não iniciam testes. Typecheck permanece completo.

## Consequências

A execução cotidiana pode selecionar menos testes, mas não comprova cobertura
completa. Grafo de imports não substitui contratos externos ou dependências
dinâmicas; validate e portões remotos continuam completos. Não alteramos matriz
visual, workflows, snapshots ou código de produto.

Medições comparam a mesma suíte e distinguem falhas anteriores de regressões.
O script Windows registra tempo, memória residente/privada e CPU amostrados;
limites da amostragem e influência de caches devem acompanhar os resultados.
