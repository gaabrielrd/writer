# P2 — journal cifrado da preparação de aventuras

Base: b2f7ff2. Sem subagentes, CI ou operação remota.

## Descoberta e objetivo

O cliente da chave já entrega contexto/keyId e CryptoKey não extraível.
O pipeline de preparação tem 14 mutações: integridade com limit 1–16 e
13 pedidos com restoreId/jobToken/operationId/expectedCheckpoint.
Livros possuem journal cifrado, mas aventuras exigem comandos/DTOs/AAD próprios.

Persistir o pedido exato antes do envio para poder recuperá-lo após recarga,
sob reautorização da mesma conta/restauração/revisão/chave. Não executar pedidos
neste incremento. Cancelamento remove chave e coleta a encerra: suas mutações,
ativação e demais efeitos terão registro metadata próprio, sem depender de
descriptografar um segredo que já foi removido.

## Requisitos

- Lista imutável explícita dos 14 comandos e intent fechado, normalizado e
  imutável; IDs reais, checkpoint inteiro seguro e limite exato quando aplicável.
  Nenhum texto/chunk/credencial/campo arbitrário, nem comando de outro domínio.
- Envelope AES-GCM 256 com nonce 12 bytes/stamp UUID novos, AAD próprio
  incluindo conta/restauração/incarnação/aventura/revisão/keyId/stamp.
  Grant não extraível, plaintext até 4096 bytes, Base64 canônico e envelope
  fechado; zerar buffers e não expor parser/JSON privado em erro.
- IndexedDB isolado por namespace de aventura e chave [ownerId,restoreId];
  guardar apenas contexto e ciphertext, sem CryptoKey/raw key/plaintext.
  Exigir WebCrypto, Web Locks e contexto seguro, sem fallback plaintext.
- CAS transacional do envelope inteiro; lock por conta/restauração. Read
  reautoriza, decifra e relê envelope para recusar resposta obsoleta.
  CompareAndSet compara intent completo e envelope exato, sem retry automático.
- Falhas de autorização/leitura/quota, registro estranho/alterado ou disputa
  entre abas preservam o registro existente. Guard em etapas assíncronas.
  Após commit com ACK incerto, não alegar rollback; próxima leitura revalida.
- Contexto/expected/next capturados antes do await; nunca retargetar por mutação
  de objeto fornecido. DB abort/blocked/error fecha conexão quando aplicável.
- Interface pública da feature expõe journal/tipos, sem internos de livro.

## Arquivos e sequência

1. PreparationContracts, PreparationCrypto, PreparationDb e PreparationJournal
   próprios em services; exports públicos em index.ts.
2. Vitest dirigido: todos comandos/limites, nonce/AAD/cifra/bytes/erro, CAS,
   reautorização/guard/conflitos/falhas e regressões pertinentes de livros.
3. Smoke no Chromium isolado com IndexedDB/Web Locks/WebCrypto reais:
   recarga, duas abas/CAS, ciphertext sem plaintext e falha preservando registro.
   Não usar conta real ou alterar dados do navegador do usuário.
4. Tipos/lint/arquitetura/format/docs, revisão/ADR/evidência e commit local.
   Validate integral no fechamento do bloco do cliente, conforme operador.

## Aceites

- [x] Intent próprio completo e envelope autenticado sem segredo persistido.
- [x] Journal reautoriza e protege CAS/concorrência/erros sem apagar dívida.
- [x] Persistência nativa sobrevive a recarga no teste isolado.
- [x] Testes dirigidos/checks, documentação/revisão e commit local.

Não escopo: controlador/dispatch, upload/start/bootstrap, efeitos de ativação/
cancelamento/mídia/coleta, revisão do arquivo/cópia de seu conteúdo, UI/roundtrip,
P3/D e gates. P2/F2-09 e macro 8/35 continuam abertos.

## Resultado

70 testes em quatro arquivos e retake final 35/35, tipos/lint/arquitetura e
checks documentais positivos. Smoke nativo isolado: 8/8, incluindo recarga,
duas abas, quota/abort e captura de contexto/envelopes antes de await.
A [evidência](../../../entregas/2026-10-28-writer-v2-journal-cifrado-da-preparacao-de-aventuras.md)
registra resultados reais e limites da autorização sintética.
Somente commit local; controlador/bootstrap/efeitos/UI seguem pendentes.
