# ADR 0093 — Validação incremental dos campos e proteção dos stubs

- Status: aceito como pré-requisito da escrita; produtor ainda não habilitado
- Data: 2026-10-23
- Plano: [M38c3](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md)
- Complementa: [ADR 0092](0092-complete-lore-client.md)

## Contexto

Editar um campo grande exige upload por partes. Um validador que recebe o JSON
inteiro pode superar os limites de memória/transação, ou obrigar o cliente a
reenviar dados intocados. O bloqueio de writers SDK no cliente, entregue em
M38c2, também não impede um cliente antigo de alterar ou remover um stub.

## Validação por unidade

bookLoreFieldValidation é puro, sem I/O, cache ou credenciais. Cada avanço
recebe até 64 KiB e retorna um checkpoint novo; não altera o anterior, nem em
erro. O estado pode atravessar reload por JSON. O EOF só é aceito quando a
gramática e o domínio estão completos e não sobra UTF-8/escape/container aberto.

Os campos atuais são name, category, summary, details, aliases,
structuredDetails, isPublic e uma página de relations. Strings podem ser
arbitrariamente extensas e aliases não têm teto de quantidade. Relações têm até
64 entradas por página, sem impor limite ao total de páginas ou ao tamanho
lógico da página. Não se reaplica o teto de 8 MiB/128 partes do formato de entrada.

Validar UTF-8 estrito, incluindo fronteiras, sequências excessivamente longas,
surrogates e pontos fora do intervalo Unicode. Exigir JSON canônico de
JSON.stringify: sem espaços externos, chaves duplicadas, escapes redundantes,
trailing commas ou dados extras. Não normalizar strings ou remover duplicados.
StructuredDetails e objetos de relação usam chaves fechadas e valores string;
targetEntityId reutiliza bookContentId e a mesma forma qualificada do schema
portátil. Categoria e booleano conservam seus domínios atuais.

O checkpoint guarda apenas sintaxe, contadores, máscara de chaves, UTF-8
parcial e categoria/chave/ID limitados pelo próprio domínio. Não copia texto
livre dos campos nem acumula aliases/relações. Chaves têm até 16 bytes, categoria
9 e target qualificado até 3011 (prefixo e dois IDs de até 1500 bytes).
Conferir os contadores e rejeitar texto residual fora desses papéis.

## Separação de provas

finishBookLoreFieldValidation certifica somente a sintaxe/domínio dos bytes
fornecidos. Não autoriza escrita, não calcula SHA/Merkle, não demonstra origem
nativa e não sela um upload. Checkpoints não são grants, mesmo quando done.

O produtor futuro deve vincular estado privado a intenção/origem/encarnação,
hash integral, manifesto, cursor/CAS e recibos nativos em cada unidade. Criar
inventário, cancelamento/fence e cleanup antes de gravar o primeiro byte.
O [plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md) mantém a
sequência até geração ativa, writers, coleta, reservas e cliente completos.

## Rules

A presença de payloadStorage torna a ficha gerenciada pelo servidor,
independentemente de o valor ser válido, vazio ou null. O SDK não pode criar
esse campo, alterar uma ficha que o possui, removê-lo por update/replace ou
excluir essa ficha, inclusive durante deleting. Clock correto ou revogação da
publicação não removem esse bloqueio. Evitar tratar ponteiro inválido como inline.

O CRUD inline mantém clock, privacidade e cleanup anteriores. Leituras próprias
de metadata continuam sob as regras vigentes; corpos e segmentos permanecem
privados. Essa proteção não cria um escritor Admin nem coleta os payloads.
O fluxo servidor de exclusão do livro ainda precisa incorporar os recursos
antes de qualquer ativação de restaurações.

## Evidência e limites

[Entrega M38c3a](../entregas/2026-10-23-writer-v2-validacao-dos-campos-de-lore.md):
93 testes Node positivos e sete cenários SDK distintos positivos; os três novos
incluem controles inline com o mesmo clock/revogação para isolar a proteção.

Não há callable novo, geração v2 gravada, campo editado, namespace, dependência,
UI ou produtor habilitado. Upload privado, selo/hash/recibos, CAS da geração,
criação/exclusão, GC e contratos do cliente continuam pendentes. Nenhuma Rule
foi implantada; CI ignorada e somente commits locais. M38c/P1/F2-09/V2 abertos.
