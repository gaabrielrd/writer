# P1 / M35a — Bytes da capa na preparação privada

## Objetivo e contrato

Preservar a capa do pacote sem consultar URLs ou tocar biblioteca/Storage atuais.
Preparar bytes e descriptor privados antes da etapa de materialização da imagem.

- Consumir book-cover e partes raw pelo leitor M21, com prova do item/bytes no
  commit. Biblioteca implica ID remapeado próprio, image/png, assinatura PNG,
  tamanho até 16 MiB e frames de até 64 KiB; preservar hash/nome/datas originais.
- None e legacy-unavailable conservam marcadores explícitos, sem URL, fetch ou
  promoção de ID legado. Não criar biblioteca, uso, download token ou objeto.
- Uma parte por unidade com SHA incremental. Corpos privados incluem índice,
  imageId, tamanho, hash da parte e bytes, sem lista de toda a imagem no cursor.
  Descriptor só é confirmado ao fechar bytes/hash; não normalizar/recomprimir.
- Inventário v12 antes de qualquer recurso novo. preparedCovers e
  preparedCoverChunks sob o job, journals tipados e namespaces vazios comprovados.
  Cursor/parte/descriptor/recibo atômicos; cleanup limitado/mascarado verifica
  nascimento/última alteração e certifica ambas as coleções vazias.
- Progresso v9 guarda início da capa, tipo/ID, partes/bytes e checkpoint SHA.
  Cursor permanece no item durante partes e avança uma vez ao terminar.
  Encerrar em cover-finalize; raiz ausente/countReady false.
- Compatibilidade dos inventários v1–v11 e recibos anteriores; preservar
  biblioteca, outro job e encarnações recriadas.

## Tarefas e aceites

1. [x] Contrato de progresso/inventário v12 antes dos novos recursos.
2. [x] Escritor interno por partes, descriptors e SHA completo.
3. [x] Testes Node/SDK de limites, hash, ausência, falhas/replay e cleanup.
4. [x] Revisão, ADR/documentação/evidência e commit local.

## Continuação obrigatória M35b/P1

Esta é preparação dos bytes, não restauração da imagem na biblioteca/Storage.
M35b deverá validar o formato de imagem e materializar objeto privado, com
intenção durável, proteção a I/O tardio, geração/precondições e limpeza.
A disponibilização da imagem/uso deve integrar a ativação autorizada sem expor
cópia parcial ou sobrescrever arquivo atual. Não usar URL/token do arquivo.

Faltam materialização da capa, integração de personas, campos grandes/
consumidores, certificação/ativação e host/UI/roundtrip/validate integral.
Sem alteração do protocolo M9 de leitura Storage, Rule, dependência, crédito,
API pública, subagentes, CI/push/PR/deploy novos. P1/F2-09 e Writer V2 abertos.
