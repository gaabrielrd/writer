# P1 / M38c3p — Roteamento integral da exclusão de livros

## Objetivo e problema

deleteBook ainda usa a presença de flags da raiz para escolher SDK ou servidor.
Preparações privadas antigas podem existir sem hasLoreResources e são invisíveis
ao cliente. Uma ausência de flag não comprova ausência de recursos.

## Sequência e aceites

1. Conservar beginBookDeletion: revogar publicação e marcar deleting antes da
   limpeza. Todos os livros seguem finishBookDeletion pelo servidor, sem ler
   flags/listas privadas para decidir ou apagar filhos via SDK.
2. Manter a API pública finishBookDeletion e encaminhá-la ao deleteSceneBook
   existente, com uma operação/limite fixos por chamada e o mesmo pedido em
   todas as páginas. O checkpoint canônico servidor retoma interrupções.
   Falha/erro incerto não executa fallback ou finalização SDK.
3. Rules negam toda exclusão SDK da raiz e toda escrita SDK de deletedBooks.
   Só o backend pode afirmar que a limpeza terminou e reservar o ID apagado.
   Escritas de metadata/mark deleting e leituras autorizadas continuam possíveis.
4. Testes cliente: livros sem flags, flags false e livros atuais, revogação antes
   da RPC, páginas/retry, falhas sem fallback e API finish compatível.
5. SDK real demo/loopback: negar root delete/tombstone mesmo ao dono/deleting
   sem flags e com tombstone presente; permitir início legítimo/metadata.
   Provar o backend limpando livro legado vazio e preparação de campo sem
   flag, incluindo retomada pelo checkpoint e vínculos/contadores de universo,
   sem tocar outros livros. Confirmar raiz/tombstone só ao final.
6. Atualizar expectativas anteriores que permitiam root delete legado.
   Não enfraquecer testes de publicação/revogação; manter controles positivos.
   Rodar Vitest/Node/SDK e checks dirigidos, tipos, revisão, docs/ADR/AGENTS/
   evidência e commit local. Validate completo no fechamento de P1.

## Arquivos e riscos

bookService/publicationService e testes, firestore.rules e casos SDK de
publicação/lore mais novo caso de roteamento. Reutilizar API pública de scenes;
sem nova dependência ou endpoint. Backend já descobre preparações sem flag.

Implantar cliente/backend/Rules conjuntamente e drenar clientes antigos antes
do rollout; não fazer deploy neste incremento. Evitar usar getDoc/local cache
como prova de inventário vazio. Não apagar tombstones/recibos por namespace.
O protocolo não certifica namespaces ainda pendentes como chat/imagens/capa:
eles continuam no inventário/auditoria completa de P1.

Demais escritores Admin, consumidores, backup/cliente/recuperação da escrita
de lore e ativação da restauração continuam pendentes. P1/F2-09/V2 abertos,
sem CI remota, push, merge ou deploy.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-roteamento-integral-da-exclusao-de-livros.md)
e [ADR 0108](../../../decisions/0108-server-only-book-deletion-finalization.md):
92 Vitest, 23 Node e 17 SDK positivos. Tipos/lint corrigidos e arquitetura passaram.
Roteamento sem flags e guarda de finalização SDK implementados localmente.

Rollout conjunto/drenagem, demais namespaces/writers/consumidores/backup/cliente
e ativação continuam pendentes. P1/F2-09/V2 abertos; validate integral no fim
de P1; somente commit local, sem CI ou deploy.
