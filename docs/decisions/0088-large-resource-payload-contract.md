# ADR 0088 — Payloads lógicos de recursos grandes

- Status: contrato interno aceito; produtor ainda não habilitado
- Data: 2026-10-23
- Plano: [M38](../tasks/writer-v2/execucao/77-campos-grandes-de-recursos-e-metadados.md)

## Contexto

Restam valores de lore, planejamento, narrativa e metadados que cabem no item
portátil de entrada e não cabem em um documento Firestore. IDs remapeados podem
aumentar esse item depois da validação. Reutilizar o teto de 8 MiB/128 partes
dos corpos de capítulos perderia entradas válidas; representar lore como um
capítulo também confundiria os consumidores e a coleta.

## Contrato físico M38a

bookResourcePayload/Contracts/Read definem uma geração interna, separada em
books/BOOK/bookResourceBodies/BODY/chunks/INDEX. O índice tem a forma decimal
usada pelo protocolo de restauração. Nenhum produtor do produto grava esse
namespace neste incremento; somente harnesses locais o exercitam.

O manifest fechado contém schemaVersion 1, bodyId, byteLength, chunkCount,
contentHash e merkleRoot. chunkCount deriva de byteLength/65536, sem teto de 128. O cabeçalho acrescenta ownerId, bookId, resource e createdAt. Resource é
fechado em kind, parentId e id; filhos exigem pai, singletons exigem seu ID e
book exige o ID do próprio livro. Não se aceitam caminhos fornecidos pelo cliente.

A geração deriva de domínio, proprietário, livro, coordenadas do recurso,
operação, SHA integral e raiz. O codec é puro, conserva JSON literal e devolve
partes independentes. Recusa valores não JSON, sparse arrays, propriedades
ocultas, símbolos, getters e toJSON de entrada. Não executa essas funções.
As estruturas retornadas não permitem que a mutação de uma parte mude outra.

## Prova binária por página

SHA-256 dos bytes JSON é contentHash. Cada folha é SHA-256 de:

- byte de domínio 0;
- índice uint64 big-endian;
- comprimento uint64 big-endian;
- bytes da parte.

Cada nó é SHA-256 do byte de domínio 1, hash esquerdo e hash direito, ambos em
32 bytes. Duplicar a última folha/nó quando a largura for ímpar. A prova contém
um irmão por nível, da folha à raiz. A posição e a largura derivam do manifest;
irmão duplicado deve ser o próprio hash. Recusar provas curtas, longas ou de
outra posição/conteúdo/tamanho. Cabeçalho fica constante, em vez de uma lista
crescente de hashes de todas as partes.

A prova atesta bytes contra uma raiz já confiável, não autentica uma raiz
arbitrária. O chamador deve autorizar o livro/recurso e obter o manifest de um
ponteiro nativo certificado. Aberturas ficam vinculadas à identidade da transação;
reuso em outra transação ou reconstrução de DTO falha antes de ler partes.
Nenhuma abertura/snapshot é DTO ou input público.

## Identidade nativa e fechamento

Criar partes antes do cabeçalho. Cada snapshot deve ter caminho e escopo exatos,
createTime igual a updateTime e nascimento anterior ou igual ao cabeçalho.
Cabeçalho também é imutável. O ponteiro fixa expectedBirth do cabeçalho com
segundos/nanos, adquirido por leitura nativa após sua criação. A abertura exige
esse nascimento, inclusive para detectar recriação idêntica do cabeçalho.
O futuro produtor deve certificar journals/recibos antes de instalar o ponteiro.

Uma leitura parcial usa somente cabeçalho e parte escolhida, sem recompor o
objeto. A leitura completa também confere SHA integral, UTF-8 estrito e JSON
canônico gerado pelo codec, preservando BOM dentro das strings. Falha não vira
texto vazio. Alteração seguida de retorno ao mesmo valor continua detectável
pela identidade nativa. No-op que preserva updateTime conserva a identidade.

## Sequência de integração e limites

M38b deve ampliar inventário/cleanup antes da primeira gravação do produto,
materializar lore por unidades com CAS, prova de fonte e journals, e fechar o
ponteiro somente depois do cabeçalho certificado. Não existe coleta/limpeza
desse namespace habilitada nesta etapa: por isso o produtor continua desligado.

M38c deve atualizar todos os leitores, backup, edição e exclusão de lore;
M38d cobre os demais tipos. Definir overlays de estado e geração por edição.
Depois resolver a saída portátil cujo JSON cresceu após remapeamento e
certificar namespaces/compatibilidade/ativação. Nada disso está concluído por
um teste do codec. A autorização do domínio e o esquema dos objetos continuam
responsabilidade do chamador.

Sem nova dependência, endpoint, Rule, ambiente, crédito, publicação ou migração
de produção. P1/F2-09 e Writer V2 continuam abertos; commits locais e CI ignorada.
