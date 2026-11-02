# ADR 0257 — Upload privado retomável de campanhas

- Data: 2026-10-29.
- Estado: aceita para núcleo interno; sem callable/UI ou ativação.
- Relacionadas: [0256](0256-campaign-versioned-deletion-inventory.md),
  [0255](0255-campaign-portable-variant-body-lifecycle.md).

## Reserva e identidade

Upload cria atomicamente job privado, reserva global, marcador pending sem
ownerId, chave de servidor, recibo inicial e testemunha mínima do recibo.
RID e source são fechados; CID é derivado no servidor, sem aceitar alvo/path.
O marcador não aparece no Estúdio nem autoriza leitores/escritores de campanha.

Nascimentos de job/reserva/marcador/recibo inicial/chave devem coincidir.
Reserva, recibos, testemunhas e chunks são imutáveis; atualização do job
coincide com nascimento do último recibo. Hashes de mapas usam digest canônico.
O token é da encarnação nativa, sem inferência por campos de cliente.
Studio e captura conferem a reserva de restauração antes de criar, mesmo se
o marcador desaparecer. A barreira C4 é consultada nas mutações ativas.

## Bytes e retomada

Blocos exatos de até 64 KiB, índice sequencial e base64/hash canônicos.
Append confere CAS antes de interpretar o próximo índice e grava dados,
checkpoint e recibo atomicamente. SHA-256 incremental usa o codec fixado
sha256/hash-wasm@4.12.0; estado e bytes são cifrados por AES-GCM com AAD de
conta/job/encarnação/unidade. Chaves/ciphertext não entram no progresso/recibo.

Último bloco compara SHA completo com source e produz bytes-verified ou
rejected. Isso comprova somente bytes, sem assinatura, semântica ou grant.
Get/replay retomam a mesma identidade e conservam recibo original/progresso
atual; reiniciar o serviço não perde o checkpoint.

Fonte interna revalida job/chave/chunk/recibo em cada leitura. Aceita unidade
até metadata+payload máximos do framing (278.528 bytes), composta de poucos
chunks; não reúne o arquivo inteiro. Nenhum endpoint expõe essa fonte agora.
Arquivo assinado real já foi revisado integralmente usando essa composição.

## Cancelamento e coleta antes do produtor

Cancel retira a chave atomicamente com estado/recibo, sem buscar payload.
Coleta versão 1 retira até 25 chunks com metadata, nascimento e testemunha;
contadores/certificação exigem sequência e ausência final coerentes. Órfãos,
recriação ou identidade estrangeira interrompem sem apagar nem avançar.
Terminal mantém somente metadata do job, recibos/testemunhas sem payload e
marcador retired/reserva permanentes. Fence de start desconhecido vence atraso;
se start já ocorreu, resolução confirma história sem cancelar silenciosamente.

Todas as famílias novas são server-only nas Rules, inclusive para o dono.
Não há nova versão C4 para uma campanha ativa neste passo: só há marcador
privado sem ownerId, sobre o qual C4 não inicia. O temporário tem coleta/
cancelamento/reserva próprios antes de qualquer append; C4 v1–v4 não muda.
Antes de habilitar ativação, integrar esses recursos à nova versão C4 pertinente
e provar a coleta após excluir a mesa ativa. Não presumir cobertura pelo v4.

## Limites e continuação

Sem ativação, índice de revisão persistido, remapeamento, materialização,
mídia, vínculo a universo ou interface. Upload não recaptura aventura atual,
não concede propriedade/compra/autorização e não torna derivado em nota própria.
Próximo bloco fecha revisão persistida e composição com materialização/ativação,
C4 apropriado e Estúdio, com validação integral no fechamento.
