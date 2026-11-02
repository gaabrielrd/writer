# P3 — imagens congeladas por geração e bytes verificados

- Data: 2026-10-29.
- Base: e2d16fe; sequência de [201](201-portabilidade-privada-de-campanhas.md)
  e [209](209-inventario-fisico-das-variantes.md).
- Estado: implementação interna e checks dirigidos locais; P3/D/F2-09 e macro 8/35 abertos.

## Objetivo e arquivos

Ler bytes da imagem exata da base congelada, sem substituir pela versão atual,
com autorização antes/depois de I/O e integridade no servidor e no consumidor.

- campaignBackupImageDefinitions.mjs e declaração TS: PNG, limite nativo
  16 MiB e partes de 65.536 bytes.
- pinnedStorageFile.mjs: extrair o protocolo de precisão decimal já usado na
  restauração; reaproveitá-lo em restoredImageStorage e no adapter de leitura,
  sem conversão para Number na requisição. Teste wire com SDK real em loopback.
- bookBackupAssetStorage.mjs: metadata com geração opcional, preservando chamadas
  antigas sem geração e reutilizando hash/range limitados já existentes.
- campaignBackupImage.mjs: manifesto, partes e verificação privados.
- campaign-portability/services e index.ts: fluxo público de bytes provisórios,
  SHA integral, pressão de consumo, guard e AbortSignal.
- Fixture de PNG real e adapter Storage real sobre bucket em memória; teste Node/
  Vitest e regressões diretas do adapter. Helper de base recebe assets opcional.
- Documentação, ADR e evidência parcial.

## Contratos

UID/IDs/hash/índices e entrada fechada antes de I/O, valores desprendidos antes
de await. Fonte própria/C4, derivedToken e resourceToken do inventário 207
obrigatórios em cada transação de autorização. Usar a prova existente de imagem,
bloco referenciador, biblioteca e uso tipado da mesma campanha/base.

Nenhuma URL/path/generation/useKey/imageId entra no DTO portátil ou pedido do
cliente. O servidor resolve o pin físico por metadata após autorização.
Indisponível tem resultado explícito sem Storage/hash/bytes. Pin alterado,
pedido obsoleto, uso retirado, origem revogada ou adoção ativa recusam.

Storage é lido pela geração capturada, também no getMetadata. Geração é string
decimal exata, sem conversão numérica. Se versão antiga existe, uma versão
mais nova no mesmo nome não a substitui. Se a antiga sumiu, recusar sem fallback.
Não presumir retenção/versioning do bucket nem alterar configuração remota.

Conferir tamanho declarado do pin (1..16 MiB), metadata da geração, metageneration
e PNG normalizado. SHA do arquivo inteiro usa stream CRC32C existente, prefixo
PNG e contagem exata, sem carregar toda a imagem. Partes usam range inclusivo,
geração exata, sem descompressão, no máximo 65.536 bytes e tamanho exato.

Autorizar imediatamente antes/depois de cada I/O, inclusive erro. Metadata
antes/depois de hash/range deve manter o mesmo token. Revogação após leitura
suprime bytes/prova. Falhas Storage viram erro genérico, sem path/provider URL.

imageToken privado vincula resourceToken e metadata da geração. Não é atestado
de emissão nem assinatura. Hash de manifesto vem do stream servidor, nunca de
declaração do cliente; manifesto/atestado final deverão reconferir a imagem
nativamente. Leitor de partes não aceita hash/tamanho/path do cliente.

Fluxo cliente valida envelopes fechados, base64 canônico, tamanho por parte,
SHA por parte e SHA integral antes da última entrega. Guard/abort antes/depois
de awaits e consumo; retorno encerra RPC pendente e descarta resposta tardia.
Só término natural após verify retorna frozen-image-bytes-only. Indisponível
retorna prova distinta sem bytes; não aparenta captura verificada.
Sem array de imagem/projeto: um slot, SHA e contadores. Framing/arquivo completo
e autorização de restauração ficam separados.

## Critérios

- [x] Geração congelada exata, inclusive decimal acima de precisão numérica, sem fallback.
- [x] Manifesto/hash/PNG e ranges limitados preservam bytes reais.
- [x] Revogação/alteração antes/depois de cada I/O (também falha) suprime dados.
- [x] DTO/pedidos não expõem pins/URLs/segredos ou aceitam caminhos arbitrários.
- [x] Fluxo confirma SHA/bytes/estado final, conta, abort/return e respostas tardias.
- [x] Adapter antigo e leitores afetados passam nas regressões dirigidas.
- [x] Tipos/arquitetura/lint/docs/formato, revisão e evidência registrados.

## Limites e sequência

Sem endpoint, Rules, dependência, chave, job, pin ou escrita Storage novos.
Nenhuma implantação/alteração de bucket. Seguem reconferência/reconciliação
conjuntas de todas as famílias, manifesto/atestado nativo independente do baseId
antigo, arquivo, persistência/cleanup, restauração e UI/ciclo. Ampliar C4 v1–v4
e consumidores de procedência antes de produtores persistentes.
Somente commits locais, sem CI/push/PR/merge/deploy/subagentes.
Validate integral no fechamento do grande bloco P3.
