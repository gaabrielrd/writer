# ADR 0186 — imagens da aventura em fluxo

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 164](../tasks/writer-v2/execucao/164-imagens-no-arquivo-de-aventuras.md).

## Decisão

streamAdventureImageData percorre todos os vínculos scene/block em páginas
limitadas e ordem UTF-8. Fonte/port/guard/signal são fixados antes do consumo.
Cada ausência tem binding explícito; cada vínculo ativo conserva alt/caption
e metadata própria de biblioteca, além do PNG autorizado por uso tipado.

ID portátil é SHA da tupla de domínio/kind/ID do recurso. Mesmo imageId em dois
vínculos gera dois assets: preserva cada grant e dispensa conjunto ilimitado de
deduplicação em RAM, ao custo de repetir bytes. Não deduplicar por ID de biblioteca.
Futura restauração pode compartilhar conteúdo somente depois de validar os
vínculos/metadata correspondentes. Nunca transportar caminho, URL ou geração.

Bytes são partes fixas de 64 KiB, com tamanho/SHA de parte, assinatura e SHA
integral antes da última emissão. Reader nativo fixa geração/metageração e
revalida vínculo após I/O; verify é chamado depois das partes, mesmo em ausência.
Nenhum writer, endpoint, Rule ou Storage adapter é alterado.

Manifesto de seção contém bindings/assets/bytes/digest. Prova images-data-only
mantém sourceDigest operacional separado, sem tokens no arquivo.
verifyAdventureImageData repete todas as páginas/get/hash/verify, sem repetir
ranges no cliente, e compara contagens/digests. Mudança de geração com bytes
iguais também invalida a captura. Esta passagem é obrigatória antes do futuro
selo global, junto ao inventário geral.

## Validação e limites

20 Vitest distintos em seleções e 37 Node dirigidos passaram, incluindo produtor/
reader nativos, grants principal/adicional, ausência, 53 cenas, PNG 8 bytes/
16 MiB, hashes, geração, metadata, ABA, falha/retry, conta e cancelamento.
Captura e composição central compartilham fonte/inventário no teste integrado.

Primeira seleção teve 15 passes e uma expectativa errada de cancelamento:
return resolve imediatamente, enquanto next pendente rejeita AbortError.
Corrigido teste para o contrato existente; cancelamento e quatro casos novos
passaram, depois reconferida troca de membro com contagem igual.
Tipos/lint/bundle navegador dirigidos verdes; não houve nova execução SDK ou UI
porque readers/Rules e superfícies permanecem iguais.

Registros ainda são provisórios. Faltam drafts, pacote/selo/validador semântico,
transporte/UI/restauração e roundtrip. P2/P3/D e gates continuam abertos.
