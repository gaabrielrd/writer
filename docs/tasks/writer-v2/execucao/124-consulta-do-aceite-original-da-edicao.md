# P1 / M38c5z — Consulta do aceite original da edição

## Objetivo

Permitir confirmar o aceite de uma edição manual por metadata nativa, após
resposta perdida ou recarga, sem abrir prosa cifrada nem reenviar apply.
É uma dependência da visibilidade em lote; não conclui essa funcionalidade.

## Requisitos e aceite

- Callable privada bookLoreEditOutcome, com Auth/App Check e no-store.
- Pedido fechado com writeId, bookId, loreId, sourceToken, editId e startHash;
  jobToken/outcomeToken opcionais, fixados após observação. Conferir editId
  derivado da mesma conta/operação/livro/ficha do cliente.
- Reabrir controles nativos e conferir escopo e recibo/evento do aceite
  original, inclusive nascimentos. Recusar criação e namespace de análise.
- Responder somente metadata: fase, campos alterados, relações, privacidade
  antes/depois e prova original. Sem nomes, texto, partes, caminhos ou chave.
- Prova permanece estável após edição posterior/coleta dos corpos, retirada
  da cabeça e ausência do livro, enquanto os controles históricos sobreviverem.
  Não representa autorização atual de leitura nem certificado de cancelamento.
- Ausência só retorna null sem tokens fixados e sem filhos órfãos imediatos;
  jamais autoriza reenvio. Tokens fixados e provas ausentes/recriadas falham.
- Sessão Auth confere actor exato antes/depois e DTO/escopo fechado; erro
  propaga sem fallback, mutação, leitura cifrada ou repetição automática.
- Testes nativos, HTTP/Auth, cliente/Auth e SDK Firestore local dirigidos.
  Revisar diff e registrar evidência e commit local.

## Sequência e arquivos

1. Serviço functions/src/bookLoreEditOutcome.mjs e registro em index.mjs.
2. Contratos/cliente services/bookLoreEditOutcome.ts e método outcome da
   bookLoreEditService.ts, sem alterar factories ou contratos cifrados.
3. Testes backend/HTTP/cliente/sessão e regressões afetadas; SDK local.
4. ADR 0139, AGENTS, arquitetura/testes/execução/81 e evidência.

## Limites e riscos

Não altera os 18 métodos de journal, 22 manuais ou sete de retirada.
Nenhuma migração, dependência, Rules, chave, recurso ou job novo.
Sem UI/ativação de compêndio nesta unidade. Não infere aplicação por valores
atuais, checkpoint local ou estado visual, nem afirma atomicidade de grupo.
Consulta histórica não entrega conteúdo e não concede acesso atual à origem.

Validate completo fica no fechamento do bloco P1, conforme decisão do operador.
Visibilidade em lote, composição, lifecycle/consumidores/backup/rollout de P1
e demais fases/gates humanos/comerciais continuam abertos. Sem CI/push/deploy.

## Resultado local

Callable e sessão Auth implementadas. 147 testes dirigidos positivos, 66 novos,
incluindo três SDK Firestore reais. Lint dirigido, 255 módulos de sintaxe backend,
tipos/build/smoke positivos. Full validate reservado ao fechamento de P1.

[ADR 0139](../../../decisions/0139-book-lore-edit-original-outcome.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-consulta-do-aceite-original.md).
Visibilidade em lote/compêndio e demais lifecycle/consumidores/backup/rollout/validate
de P1 e fases/gates seguem abertos. Somente commit local, sem CI/remoto/deploy.
