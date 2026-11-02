# Fixture fictícia de variante legada

campaign-legacy-variant.json.br foi capturada de be6a8ca antes da correção
edition-v1, em uma execução isolada de geração/restauração dos helpers.
Contém somente dados fictícios, uma assinatura de teste com chave pública,
chaves AES locais de teste, ciphertexts/recibos e metadata nativa simulada.
Não contém chave privada de assinatura nem dados ou credenciais de produção.

O job tem três corpos parciais gravados, sem authorizationCodec. A retomada
pelo código anterior foi comprovada antes da captura. São 461 registros,
1.276.773 bytes JSON antes da compressão e 576.812 bytes Brotli.
O helper limita descompressão a 2 MiB. Esta fixture valida o wire histórico;
não foi gerada pela implementação nova nem exige histórico Git no CI.
