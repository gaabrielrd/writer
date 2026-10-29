# ADR 0240 — imagens congeladas no backup de campanhas

- Data: 2026-10-29.
- Estado: serviço e fluxo internos implementados localmente.
- Base: e2d16fe; [plano 210](../tasks/writer-v2/execucao/210-imagens-congeladas-do-backup.md).

## Decisão

Resolver cada imagem a partir do pin nativo da base ativa e do resourceToken
do inventário 207. A autorização atual inclui fonte própria, C4, adoção,
derivedToken, bloco referenciador, biblioteca e uso tipado da campanha/base.
Repetir a autorização imediatamente antes/depois de cada I/O Storage,
inclusive falhas. Uma autorização pós-I/O pode preceder imediatamente a
próxima operação, sem outra espera intermediária. Revogação suprime dados.

Ler metadata e bytes pela geração decimal exata capturada. O SDK instalado
@google-cloud/storage 8.4.0 converte generation para Number no construtor;
extrair o interceptor já existente da restauração para pinnedStorageFile,
preservando a string na requisição e a precondição de metadata. Reutilizar
no adapter de backup e na restauração. Não alterar propriedades privadas
do SDK. A requisição de mídia seleciona generation exata; a de metadata
também inclui ifGenerationMatch.

Geração identifica uma versão imutável dos bytes; metageneration acompanha
a metadata dessa versão. Fontes primárias:
[objetos](https://docs.cloud.google.com/storage/docs/objects) e
[metadata](https://docs.cloud.google.com/storage/docs/metadata).
Uma versão atual mais nova não substitui o pin; ausência da antiga recusa,
sem fallback. Não pressupor retenção nem mudar o versionamento do bucket.

PNG usa o limite nativo de 16 MiB. O manifesto confere metadata, tamanho
exato do pin, prefixo PNG, SHA-256 e contagem integral por stream CRC32C.
Cada parte tem range inclusivo, no máximo 65.536 bytes, sem descompressão
e com tamanho exato. Metadata antes/depois precisa manter imageToken.
Destruir streams no encerramento. Erros Storage são genéricos, sem path/URL.

O imageToken privado vincula metadata Storage à observação nativa; não
é assinatura nem atestado de emissão. DTOs e pedidos cliente não expõem
paths, gerações, library imageId ou useKey, nem aceitam hash/tamanho
declarados pelo consumidor como prova do servidor. Uma imagem indisponível
retorna resultado explícito sem leitura Storage.

No cliente, API e contexto são capturados antes de await. Guard de conta,
AbortSignal, envelopes fechados, base64 canônico, SHA por parte, prefixo PNG,
SHA/tamanho integrais e verify final são obrigatórios. Um slot espera o
consumo, sem array da imagem ou prefetch. Bytes são provisórios: somente
término natural retorna frozen-image-bytes-only; indisponível tem prova
distinta. Return/abort interrompem a espera e descartam respostas tardias.

## Limites

PNG é o formato normalizado já aceito pela biblioteca; este leitor confere
assinatura e bytes, sem alegar decodificação integral de imagem ou novo upload.
Manifesto/atestado final deverá reconferir nativamente todas as famílias e
mídias; imageToken não autoriza assinar hashes arbitrários do cliente.

Sem endpoint, Rules, dependência, segredo, job/pin ou escrita novos. C4 não
ganha recursos persistentes neste incremento. Antes de criá-los, ampliar
inventários C4 v1–v4 e consumidores de procedência. Reconferência conjunta,
arquivo, restauração e UI/ciclo continuam pendentes. P3/D/F2-09 e macro 8/35
abertos. Validate integral no fechamento do grande bloco.

Teste wire usa o SDK real contra HTTP em loopback, sem credenciais ou nuvem,
e confere geração de vinte dígitos, CRC32C, ranges e streams destruídos.
O SDK emitiu quatro MaxListenersExceededWarning nesse teste; avisos não foram
suprimidos e não constituem prova de vazamento persistente. Não há validação
de permissões, retenção ou concorrência do bucket real.
Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-imagens-congeladas-no-backup.md).
