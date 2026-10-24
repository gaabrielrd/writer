# P1 / M38c5l — Coordenação dos escritores legados de lore

## Objetivo

Impedir que versões antigas gravem fichas inline de um livro que já possui
recursos nativos de lore. Reutilizar hasLoreResources, controlado pelo servidor,
sem criar outro flag de rollout. A reserva nativa de criação já fixa esse
marcador antes dos corpos; cancelamento não o remove. Portanto a barreira é
permanente para o livro e exige cliente nativo completo antes de rollout.

## Requisitos, suposições e não escopo

Livro com marcador ausente ou false conserva CRUD inline/clock/privacidade.
Marcador true ou presente inválido exige escrita nativa. Rules devem recusar
create/update/delete inline, inclusive durante deleting e com clock/revogação
corretos; cliente atual deve explicar a incompatibilidade antes de qualquer
write. Leituras e confirmação sem mutação de criação já existente/exclusão
já ausente permanecem possíveis no serviço, sujeitas à autorização existente.

Admin ignora Rules: aplicar a mesma barreira ao lote legado de análise com
qualquer destino local. Preservar recibos aplicados e rota de aplicação nativa
preparada; lote misto legado não pode escrever global/debitar parcialmente.
Lote só global conserva seu contrato. Orçamentos de propostas/contexto de IA
não são limites de autoria e não serão removidos neste incremento.

Sem habilitar entrada do editor no compêndio, novas APIs, dependências, deploy,
CI ou escrita remota. Esta barreira preparada não comprova drenagem real de
clientes nem entrega CRUD completo no produto. Criação/exclusão nativas no
cliente, coleta do livro/chaves e demais consumidores continuam obrigatórios.

## Arquivos e sequência

1. firestore.rules e testes SDK book-local-lore: barreira por livro e controles
   positivos de legado, leitura, imutabilidade do marcador e rollback.
2. lore/services/loreService.ts e teste: recusa de mutações antigas, sem alterar
   recibos/no-ops, escopo global ou livros ainda inline.
3. functions/src/loreAnalysis.mjs e testes de análise/aplicação/criação assistida:
   barreira Admin e matriz positiva da escrita nativa e dos recibos antigos.
4. Validar Node, Vitest e SDK dirigidos; sintaxe, lint/typecheck e docs/diff.
5. Revisar e registrar ADR/evidência/matriz dos writers; commit local. Validate
   integral permanece no fechamento de P1.

## Critérios de aceite e riscos

Nenhuma mutação SDK ou lote Admin legado altera lore/clock/publicação/crédito
após a barreira. O autor continua lendo. Marcador não pode ser removido/forjado
pelo SDK. Legado false/ausente continua funcional. Preparação/aplicação nativa
funciona com marcador true e preserva campos intocados; replay não reaplica.
Criação assistida só cria livro novo e nunca sobrescreve raiz/fichas existentes.

Risco principal: bloquear cliente antigo antes de entregar as entradas nativas
no produto. Não fazer deploy/ativação isolada destas Rules. Auditoria e testes
não substituem rollout coordenado, SDK/Admin reais nem validação integral.

## Resultado

Barreira de Rules/cliente/Admin implementada, preservando recibos antigos e
escrita nativa preparada. 155 testes distintos positivos: 97 Node, 43 Vitest,
15 SDK (24 novos). Lint/typecheck/sintaxe dirigidos passaram. Veja a
[entrega](../../../entregas/2026-10-24-writer-v2-barreira-dos-escritores-legados-de-lore.md)
e a [ADR 0125](../../../decisions/0125-legacy-lore-writer-barrier.md).
Proteção intermediária não fecha passo 6 nem ativa editor/P1/F2-09/V2.
Sem drenagem real, deploy, CI ou envio remoto; próximos caminhos nativos
e ciclo de chaves/consumidores continuam obrigatórios.
