# P2 — cliente da chave privada de aventuras

Base: d92197f. Um incremento por vez; sem subagentes, CI ou operação remota.

## Descoberta e objetivo

190 fornece chave atômica e HTTPS Auth/App Check, sem keyId nos DTOs comuns.
O cliente de livros exige keyId previamente conhecido e não pode ser usado
por cast. Aventuras têm serviços de backup mas ainda não possuem cliente de
recuperação ou rota proxy/rewrite para esse HTTPS.
Implementar a autorização privada que permitirá ao journal futuro cifrar e
reabrir o pedido da mesma conta/restauração/revisão.

## Contrato e proposta

- Identidade própria e fechada: ownerId, restoreId, adventureId, jobToken e
  reviewHash; contexto acrescenta keyId. Validar IDs pelo contrato real.
- Primeira autorização pode omitir expectedKeyId; retomada fornece contexto
  com keyId e exige igualdade na resposta. Nenhuma criação/rotação no cliente.
- Capturar identidade imutável antes de await. Não carregar Firebase nem
  obter tokens em import ou entrada inválida; guard e conta em toda etapa.
- POST mesmo domínio /api/adventure-restore/recovery-key, text/plain,
  Auth/App Check em headers, credentials omit, cache no-store e redirect error.
  Sem callable/fallback/retry nem segredo em query, logs ou armazenamento.
- Ler JSON em stream limitado a 8192 bytes e UTF-8 estrito; cancelar/liberar
  reader e zerar buffers. Formato fechado, schema/algoritmo/identidade/keyId
  e Base64 canônico de 32 bytes antes de importar chave AES-GCM 256 não
  extraível (encrypt/decrypt); grant devolve somente contexto e CryptoKey.
- Erros de contrato reconhecidos preservam code/reason seguros sem ecoar
  mensagem privada; corpo inválido falha genericamente. Nunca retorna grant
  após conta/guard inválidos, inclusive durante tokens/read/importKey.
- Proxy Vite exato, rewrite descartando query, e Hosting específico antes de
  **; preservar rotas de livros/importação. Nenhum deploy ou chamada paga.

## Arquivos e sequência

1. services/adventureRestoreRecoveryContracts.ts e adventureRestoreRecoveryKey.ts;
   exports públicos tipados em index.ts, sem import de internos de outra feature.
2. Vite/firebase.json com rota exata, própria e mesmo recurso/região.
3. Vitest dirigido para primeiro grant e retomada, AES não extraível, conta/guard
   em awaits, imutabilidade, DTO/bytes/JSON/limite/erros; proxy/Hosting separados,
   com regressões pertinentes de livros.
4. typecheck/lint/format/arquitetura/docs, revisão/ADR/evidência e commit local.
   Validate integral no fechamento do bloco do cliente, conforme operador.

## Aceites

- [x] Primeiro grant e revalidação entregam apenas CryptoKey própria e contexto.
- [x] Conta/guard/identidade/corpo e stream são validados sem vazamento.
- [x] Proxy/Hosting isolados, sem alteração das rotas existentes.
- [x] Testes dirigidos/checks, documentação/revisão e commit local.

Não escopo: persistência/journal cifrado, controlador/pedidos/ativação, UI,
roundtrip, P3/D e gates humanos/comerciais. Não anunciar retomada de aventura
pronta para uso. P2/F2-09 e macro 8/35 continuam abertos.

## Resultado

52 testes em quatro arquivos; após revisão de UID Unicode, retake somente do
arquivo afetado 38/38. São 55 casos distintos nas seleções, com as rotas/
regressões inalteradas. Tipos/lint/arquitetura/bundle/smoke e checks documentais
passaram; resultados e limites na
[evidência](../../../entregas/2026-10-28-writer-v2-cliente-da-chave-privada-de-aventuras.md).
Sem teste remoto ou deploy; journal/controlador/UI seguem pendentes.
