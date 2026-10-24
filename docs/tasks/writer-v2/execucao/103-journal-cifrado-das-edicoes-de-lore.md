# P1 / M38c5e — Journal cifrado das edições de lore

## Objetivo e fronteira

Persistir o rascunho literal e pedidos exatos em partes cifradas no dispositivo,
pela política aprovada em M38c5d. Recuperar esses dados após recarga somente
com chave recém-reautorizada; nenhum envio automático por existir journal.
Snapshot de M38c5b é status, não checkpoint restaurável: reconstrução completa
do coordenador e host visual continuam necessários no próximo incremento.

## Requisitos e sequência

1. Identidade fechada por UID/writeId/livro/ficha/CAS/intentHash e reserva/
   jobToken/keyId. Sessão de conta/contexto antes/depois de cada I/O; chave
   HTTP fresca por abertura, importada não extraível e nunca persistida.
2. Reutilizar serializer JSON limitado do codec, preservando literalmente
   presença/valores/ordem/BOM/Unicode/CRLF. SHA/contagem em passagem linear,
   partes até 64 KiB e AES-GCM com nonce independente/AAD por identidade,
   seção, geração, manifesto e índice. Sem novo teto de 8 MiB/128 partes.
3. IndexedDB separado em headers e frames. Header contém só metadata;
   rascunho/pedido ficam em ciphertext. Cada parte/checkpoint confirma no
   oncomplete; Web Locks/CAS impedem sobrescrita por aba antiga. Não manter
   lock durante rede ou await criptográfico dentro de transação IDB.
4. Estados de selagem parcial são descobríveis e preservados. Só exponha
   dados com todas as partes, hash/UTF8/JSON/schema e identidade conferidos.
   Retry local aceita somente o mesmo manifesto; nunca substitua original.
5. Journal de dois canais para produção/cleanup. Validar wire fechado dos
   métodos manuais, salvar pedido congelado antes de HTTP e preservar após
   resposta perdida. Intenção cancel monotônica bloqueia produção, não cleanup.
   Confirmação local explícita não é recibo nativo nem cancelamento remoto.
6. Confirmar só por chamada explícita do consumidor depois de validar resultado;
   não apagar rascunho ou revogar chave automaticamente. Manter metadata do
   pedido incerto disponível sem decriptação; nenhum fallback sem proteção.
7. Testes de codec/crypto/key/session/IDB/CAS e Chromium real com recarga,
   Unicode/multipart >8 MiB, perda de resposta, revogação antes de decrypt,
   corrupção/AAD/conta/aba antiga e falha de commit. Checks dirigidos,
   revisão/docs/ADR/evidência e commit local. Validate no fim de P1.

## Arquivos, riscos e portões

Novos contratos/crypto/store/sessão na feature lore e testes; expor o serializer
existente internamente, sem mudar formatos do upload. Sem dependências,
endpoints servidor, Rules ou produtores nativos novos.

Operações em memória existentes não mudam de persistência automaticamente.
O host futuro deve congelar intenção, reservar chave e aguardar journal
concluído antes de enviar. Não declarar a primeira cópia salva durante
selagem parcial. Pedido/ciphertext incompletos continuam preservados.

AAD/ciphertext não são autorização ou frescor absoluto de storage; servidor
continua decidindo CAS/provas/replay. O próximo incremento deve integrar
checkpoints e controles de todos os jobs para cleanup sem chave, fechamento
nativo antes do descarte, e ciclo de vida da chave ao excluir o livro.
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais continuam abertos.

## Resultado do incremento

Contratos/crypto/IndexedDB/journal/sessão implementados, com serializer
reutilizado e metadata de diagnóstico separada de cleanup. Selagem final
abortada com partes completas pode ser recuperada após conferir todos os
bytes/schema/intenção e autorização, seguida de CAS/oncomplete local.

51 Vitest distintos e quatro cenários Chromium positivos em rodadas;
lint/tipos/build/smoke/arquitetura dirigidos. Veja
[ADR 0118](../../../decisions/0118-partitioned-local-lore-edit-journal.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-journal-cifrado-das-edicoes-de-lore.md).

Próximo: checkpoints/reconstrução do coordenador, controles de todos os jobs,
composição de reserva/journal/host e fechamento/coleta. Ciclo de vida integrado
e demais gates permanecem abertos; sem rollout ou editor recuperável anunciado.
Validate integral no fim de P1; somente commit local.
