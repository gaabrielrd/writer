# ADR 0081 — Bytes da capa na preparação privada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M35a, depois da ADR 0080

## Problema

A preparação chega ao item da capa, mas ainda não preserva sua contribuição.
Gravar diretamente no Storage nesta etapa permitiria I/O tardio depois do
cancelamento sem intenção durável ou protocolo de limpeza entre os sistemas.

## Decisão

advanceBookRestoreCover é interno. Consome o item remapeado e uma parte raw M21
por unidade, reconferindo as provas na transação final. Biblioteca exige ID novo,
PNG, assinatura inicial, limites existentes de 16 MiB/64 KiB e hash integral.
Não consulta URL, não baixa a imagem original e não normaliza/recomprime bytes.

Inventário v12 é confirmado antes dos novos recursos: preparedCoverChunks e
preparedCovers sob o job, com journals tipados. Antes da migração, comprovar
ambos os namespaces e seus journals vazios. Parte/journal/cursor/recibo são
atômicos. Descriptor current só existe depois do hash/tamanho completo.

Progresso v9 guarda início do item, tipo/ID, contadores e checkpoint SHA privado.
Não carrega o conjunto dos bytes. Durante a contribuição, cursor permanece no
item; ao terminar, avança uma vez e fica em cover-finalize. None e
legacy-unavailable geram descriptors explícitos sem URL ou promoção de acesso.
Nome/datas/hash originais são preservados; nomes Unicode malformados passam a
ser rejeitados pelo contrato puro para impedir conversão UTF-8 com perda.

Cleanup usa o inventário genérico limitado, máscaras e nascimento/última
alteração conferidos com journal/recibos. Certifica as duas coleções vazias.
Registros recriados, biblioteca atual e outro job são preservados. Inventários
v1–v11 e recibos antigos continuam válidos.

## Estado e continuação obrigatória

Raiz ausente, countReady false e nenhuma linha de biblioteca/objeto/uso/token.
Preparação dos bytes não valida a imagem inteira nem produz capa utilizável.
O teste de 16 MiB exercita o protocolo de bytes com preenchimento; o SDK usa PNG
real 1200×1800 e confere o resultado com sharp.

M35b deverá validar o formato e materializar um objeto privado com intenção
durável, proteção a I/O tardio, geração/precondições e limpeza. A imagem/uso
somente poderão ser disponibilizados pela ativação autorizada. Não adotar URL
ou download token do pacote.

Personas globais, campos grandes/consumidores, certificação/ativação,
host/UI/roundtrip e validate integral também permanecem obrigatórios.
P1/F2-09 e Writer V2 abertos. Sem API pública, Rule, dependência, crédito,
subagentes ou CI/push/PR/deploy novos. Leitura Storage M9 sem alteração de I/O.
