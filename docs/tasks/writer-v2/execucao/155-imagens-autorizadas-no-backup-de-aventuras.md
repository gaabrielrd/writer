# P2 — imagens autorizadas no backup privado de aventuras

Base: a6b7398. Capturar bytes das imagens efetivamente vinculadas aos blocos
principais de cena e adicionais, inclusive arquivados. Não depende de prévia
Mestre/Jogadores nem publica. Metadados neutros de vínculo já estão na 149.

Grafo consultado sem resultados; fallback em adventureBlockImages/Blocks,
imageLibrary, adventurePreview, campaignCaptureItems/Engine e bookBackupCover/
AssetStorage. Imagem nativa vem da biblioteca privada e é PNG aceito no caminho
book-covers/UID/IMAGEID.png. Vínculo tipado em uses tem kind adventure-block,
adventureId e resource; key atual adventure-block:digest(adventureId,resource).
Não há outra coleção de ilustrações autorais descoberta nesses produtores:
bloco principal e adicional são as origens concretas. Bases de campanha
referenciam os mesmos assets, mas não são fonte integral da aventura.

## Contrato antes do código

Leitor interno específico lista vínculos por kind scene/block em metadata N+1
até 50, sem prosa e incluindo arquivo/sem parte. Nenhum imageId/path/URL
arbitrário recebido do cliente. Descriptor inclui imageId nullable/bindingToken.
Fonte 147 e head da cena/bloco no mesmo snapshot; adicional exige cena dona
autorizada e backlink sceneId. Recusar exclusão/rebalance/schema/dono inválidos.

Se imagem existe, autorizar somente a biblioteca da mesma conta, estado ativo,
useCount válido positivo e registro de uso tipado correspondente ao vínculo.
Validar caminho canônico privado em vez de confiar em path fornecido pela
biblioteca. Heads do vínculo e uso não podem anteceder nascimento da raiz;
biblioteca pode legitimamente ser anterior. Conferir identidades nativas do
head/cena dona/biblioteca/uso, sem URL/token de download. Root recriada não
adota vínculo/uso antigos. Preservar imageId/alt/caption literais, sem trim.

Extrair adventureImageUseKey puro do produtor para reuso do endereço, mantendo
key/hash e bytes dos usos existentes. Não alterar semântica do writer.

APIs getAdventureBackupImage, readAdventureBackupImageChunk e
verifyAdventureBackupImage recebem kind/id/fonte/bindingToken; as duas últimas
também imageToken observado, e read índice capturado antes de await. Sem novo
endpoint/Rule/runtime. Ausência gera estado none e não inventa bytes.

Storage é I/O separado: observar binding, metadata de geração/metageração/
size/MIME/accepted, reconferir binding; hashGeneration em geração fixada;
revalidar binding e metadata após I/O antes de retornar. Reads por range 64 KiB,
sem descompressão, hash da faixa e revalidação posterior. Nenhum byte de origem
revogada/mudada é devolvido como sucesso. Sem escrita/cópia ou signed URL.

Formato capturável atual: PNG aceito, assinatura de oito bytes, até 16 MiB por
imagem, contrato equivalente ao gerador/biblioteca e limite do adapter existente.
Validar generation/metageneration decimais positivos, accepted true, MIME PNG,
tamanho coerente e SHA-256 integral de hashGeneration. Reusar adapter Storage
de ranges/hash já comprovado sem cast de manifesto de livro. Metadata do
pacote próprio conserva nome/datas opcionais, imageId/alt/caption, MIME/bytes/
chunks/hash; exclui path/geração/downloadtokens/recibos/usoCount/owner.

Mesmo asset em vários vínculos pode ser deduplicado pelo futuro assembler
somente com identidade/hash coerentes e todas as provas de vínculo; leitor
não junta biblioteca/projeto em memória. Arquivo completo ainda não habilitado.

## Sequência e validação

1. Extrair key pura, preservar produtor e testar bindings/primitivas.
2. Serviço de metadata/generation/ranges com observação antes/depois de I/O.
3. Produtores reais de imagem de cena/adicional, arquivo/sem parte, null,
   asset compartilhado, >50; autoria/uso/path/nascimento/bytes/PNG/size/MIME/
   metadataflags e marcadores, mudança/ABA de cada dependência, intenção, erro/
   retry e nenhuma escrita/URL/token.
4. SDK real Firestore + Storage local/demo com adapter real, assinatura/hash/
   ranges, generations e Rules. JVM direta limitada e encerramento comprovado
   conforme evidência 153; nenhum processo alheio encerrado.
5. Node dirigido/regressões de writer/adapter e lint/sintaxe/docs/arquitetura/
   styleguide/format/diff. Validate no fechamento de P2.
6. Revisar, ADR/evidência parcial e commit local. Depois selo, pacote/revisão/
   restore/UI/roundtrip. Sem CI/remoto/deploy/subagentes.

## Aceites

- [x] Vínculos próprios e uso tipado autorizados por fonte e identidades.
- [x] Geração/metadata fixadas e revalidadas antes/depois de I/O, ranges íntegros.
- [x] Bytes PNG e metadata própria sem URLs/chaves/persistência nova.
- [x] Testes/SDK/checks, revisão/docs/commit; P2 integral continua aberto.

## Resultado dirigido e revisão

50 Node positivos (35 novos + 15 regressões), sem skip, em 971,1055 ms.
Três SDK Firestore/Storage reais positivos em 14.161,2348 ms. Avisos do SDK
PassThrough preservados na evidência. JVM direta limitada, artefatos verificados,
persistence privada e encerramento dos processos próprios conferidos.

Revisão acrescentou recusa de alt/caption UTF-16 malformados antes de Storage.
Biblioteca anterior à raiz é caso válido comprovado; heads/uso anteriores não.
Chave tipada mantém vetor nativo
adventure-block:98100354ecabbfb9c3ca70863150f6c9b6aec6c160aca236fffaf07d1dd02d34.
Lint dirigido positivo; demais checks finais acompanham commit.
[ADR 0178](../../../decisions/0178-adventure-backup-authorized-images.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-imagens-no-backup-de-aventuras.md).
Selo/pacote integral/restore/UI/roundtrip e validate P2 continuam abertos.
