# ADR 0178 — bytes das imagens autorizadas da aventura

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Capturar imagens de bloco principal/adicional pelos próprios vínculos de cena/
bloco, inclusive arquivo/sem parte. Lista metadata limitada não busca biblioteca
inteira nem recebe path/imageId arbitrários. Exigir raiz, head/cena dona e uso
tipado autorizados; library privada ativa, contador positivo e caminho canônico.
Heads/uso não podem anteceder nascimento da raiz; biblioteca pode ser anterior.

Compartilhar somente adventureImageUseKey puro com o produtor, preservando
endereço/hash existente. Token liga identidades nativas de vínculo/cena dona/
library/uso à fonte 147. Não depender de URL ou prévia de audiência.

Storage exige PNG aceito, assinatura, generation/metageneration positivas,
MIME/tamanho e até 16 MiB. Hash integral usa geração fixada e stream do adapter
existente; range de até 64 KiB é fixado na mesma geração. Observar/revalidar
binding e metadata antes/depois de todo I/O; revogação ou troca não devolvem
bytes como sucesso. Intenção, inclusive índice, é capturada antes de awaits.

DTO próprio conserva imageId/alt/caption/nome/datas opcionais e manifesto
MIME/bytes/chunks/hash. Não emite path/URL/downloadtokens/geração/uso/owner.
Ausência é none, sem bytes inventados. Mesmo asset em vários vínculos só poderá
ser deduplicado pelo assembler com provas/hash coerentes de todos os vínculos.

## Limites

Sem cópia, persistência, writer semântico, Rule, endpoint, runtime, UI ou
dependência novos. Reutiliza adapter Storage provado sem cast de manifesto de
livro. Formato atual é o PNG da biblioteca; selo/pacote/restore/UI e validate
integral de P2 continuam pendentes.

[Plano 155](../tasks/writer-v2/execucao/155-imagens-autorizadas-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-imagens-no-backup-de-aventuras.md).

## Correção posterior

A [ADR 0180](0180-adventure-imported-image-authority.md) substitui a comparação
de nascimento dos heads com a raiz, para cenas preparadas antes da ativação.
Comparação de idade do uso tipado e demais provas permanecem obrigatórias.
