# Writer V2 — Roteamento integral da exclusão de livros

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [93](../tasks/writer-v2/execucao/93-roteamento-integral-da-exclusao-de-livros.md).
- **Decisão**: [ADR 0108](../decisions/0108-server-only-book-deletion-finalization.md).

## Objetivo e implementação

Garantir que preparações privadas sem hasLoreResources sejam descobertas antes
de remover um livro. Todo deleteBook revoga publicação/marca deleting e chama
a mesma finalização pelo servidor. Ausência de flag não concede autoridade.

finishBookDeletion conserva a assinatura pública e pagina deleteSceneBook com
o mesmo pedido. O checkpoint canônico retoma a exclusão interrompida; falhas
propagam sem fallback SDK. Cliente não lista/remove filhos nem cria tombstone.

Rules negam todo delete SDK da raiz e todo acesso/escrita SDK de deletedBooks.
Metadata e início legítimos continuam autorizados. Backend já existente limpa
livros legados/preparações e confirma raiz/tombstone somente ao terminar.

## Critérios

- [x] Todos os livros usam finalização servidor, com flags ausentes/false/atuais.
- [x] Revogação antes da limpeza, pedido fixo nas páginas e falha sem fallback.
- [x] API finish compatível, sem inventário/prosa privada no navegador.
- [x] SDK não remove raiz nem escreve tombstone, mesmo dono/deleting.
- [x] Controles positivos de metadata/início e exclusão real pelo servidor.
- [x] Preparação privada sem flag limpa e retomada por outra operação.
- [x] Outros livros/vínculos/contadores de universo preservados.
- [x] Testes dirigidos, revisão, documentação e tipos.
- [ ] Rollout conjunto/instâncias antigas e restantes gates de P1.

## Arquivos

bookService/publicationService, seus testes e firestore.rules.
Novo bookDeletionRouting.rules.test.mjs; expectativas SDK anteriores de
publicação/adoção atualizadas para exigir finalizador servidor. Nenhum novo
endpoint, dependência ou índice; não houve alteração de interface visual.

## Validação local dirigida

- **92/92 Vitest**, dois arquivos, 24.12 s. Após trocar o matcher any por
  asserções tipadas, repetido somente o caso do pedido: um positivo, 29
  outros selecionáveis omitidos, 4.49 s. Não conta como 93 testes distintos.
- **23/23 Node** da exclusão de lore do livro, 1880.611 ms.
- **17/17 SDK**, 53401.5139 ms, uma rodada dirigida em três arquivos:
  três casos novos de roteamento, um de adoção/flag e 13 de publicação.
  Emulador 1.22.0 verificado por SHA, projeto demo e loopback.
- SDK prova preparação sem flag ausente e false, nega bypass, permite
  metadata/início, retoma checkpoint por nova operação e limpa bytes antes
  de raiz/tombstone. Livro legado vazio com tombstone prévio só sai pelo
  backend, que atualiza vínculo/contador e preserva outro livro.
- Typecheck: positivo após retirar import deleteDoc que perdeu o uso.
- Lint dirigido: positivo após asserções tipadas do pedido.
- Arquitetura: Verificação arquitetural OK.
- Docs/formato/diff: positivos após redação final.

Logs PERMISSION_DENIED são as negações verificadas nos testes. Logs locais de
QA não são parte do commit. Não houve dados reais, compra ou IA paga.

## Revisão, rollout e limitações

A revisão conferiu que não há decisão por flags nem fallback de limpeza SDK.
A Rule global de finalização foi alterada junto do cliente; o backend já usa
o protocolo retomável e mantém tombstones/recibos/leases. Sem enfraquecer
testes de privacidade/publicação ou limites de cobertura.

Rollout continua pendente: implantar cliente/backend/Rules conjuntamente e
drenar versões antigas antes de habilitar produtores. Nenhum deploy ocorreu.
O roteamento não certifica todos os namespaces históricos do livro:
chat/imagens/capa e demais auditorias ainda precisam dos seus gates de P1.

Sem UI visual ou mudança backend, não repetimos navegador/build/sintaxe de
Functions. A suíte npm run validate/cobertura completa fica para o fechamento
de P1 conforme autorizado. Sem CI, push, PR, merge, deploy ou migração.
Demais writers/consumidores/backup/cliente e P1/F2-09/Writer V2 continuam abertos.

## Como conferir

Executar os testes de bookService/publicationService e o SDK de
bookDeletionRouting em emulador demo/loopback. Preparar um livro sem flags,
iniciar exclusão e confirmar limpeza pelo checkpoint servidor, nunca apagando
a raiz manualmente. O dev server segue em http://127.0.0.1:5173/.
