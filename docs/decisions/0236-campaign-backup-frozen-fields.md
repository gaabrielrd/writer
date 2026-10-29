# ADR 0236 — itens e campos da base congelada no backup

- Data: 2026-10-29.
- Estado: leitores internos e fluxo de campo implementados localmente.
- Base: fdada8b; [plano 206](../tasks/writer-v2/execucao/206-itens-e-textos-da-base-congelada.md).

## Decisão

Reautorizar âncora/C4 e origem do plano 205 em cada transação. Inventariar
itens por ID com até 25 resultados e lookahead, sem filtrar arquivo ou
indisponibilidade. Cursor vincula conta/campanha/fonte/derivado/limite; token
da página inclui lookahead. Essa página não certifica cobertura da base.

Provar tipo, origem lógica, hierarquia e identidade nativa do item/pais antes
de ler título, manifestos ou texto. Fichas globais exigem universo e ficha
atualmente disponíveis; locais exigem metadata privada, originAdventureToken
e encarnação atual da aventura. Ficha nascida depois da base v1 é outra origem.
Nome/texto atuais não substituem a edição antiga. O pressuposto dos produtores
privados v1 e a exigência de procedência explícita na restauração da ADR 0235
continuam válidos.

Ficha indisponível retorna somente resultado tipado; nenhuma prosa, nome ou
hash de texto antigo. Relações preservam targetKey e disponibilidade; alvo
ausente/revogado não leva tipo ou descrição antigos. Alvo autorizado conserva
texto literal da relação, sem resolver nomes atuais.

Cabeçalho lógico fechado preserva campos e ausências, ordem, hierarquia, arquivo,
tipos/audiência, structured permitido e referência lógica de imagem. Omite
contadores internos e ponteiros físicos. Sete tipos compartilham a definição
pura dos campos com o validador existente, sem criar novas exigências para
manifestos v1 antigos. Cabeçalhos usam JSON em partes de 65.536 bytes e SHA total.

Texto é lido por campo/índice do manifesto e chave determinística, com metadata
do corpo antes de content e a mesma identidade nativa. Cada parte UTF-8 tem até
65.536 bytes. Vazio conserva uma parte vazia; BOM e espaços são literais.
bodySourceKey pertence ao item, exceto content do bloco principal compartilhado
com a cena pai e manifesto idêntico. Prova privada do corpo usa o dono lógico,
permitindo futura deduplicação cena/principal.

O cliente usa API injetada e stream com pressão de consumo, um slot, guard e
AbortSignal. Copia pedido/manifesto antes de await e verifica envelopes,
base64 canônico, UTF-8, tamanho e SHA integral. Partes são provisórias; a última
não é entregue se SHA/tamanho divergirem. Prova frozen-field-bytes-only só no
término natural. Retorno/abort durante RPC descarta resposta tardia.
Não monta texto completo nem projeto completo na memória.

## Limites

Ler um chunk não certifica sozinho o SHA de um campo multichunk; o fluxo
cliente confere o campo integral. O futuro inventário físico/atestado servidor
deve conferir corpos e hashes independentemente do cliente. Não assinar uma
declaração de cliente nem converter esta prova em grant.

Ainda faltam inventários físicos de bodies/links/loreReferences/images,
cobertura/órfãos, variantes/legadas, binários, manifesto/atestado, arquivo,
persistência/cleanup, restauração e interface/ciclo P3. Antes de produtores
persistentes, ampliar C4 v1–v4 e consumidores da procedência restaurada.
Sem endpoint, Rules, dependência, chave, job ou pin novos.

## Evidência

20 testes Node novos, 11 regressões do leitor antigo e 29 Vitest do fluxo
passaram localmente sobre captura real em bancos de teste. Não prova
concorrência/credenciais Firestore nem operação em produção.
Consulte a [evidência parcial](../entregas/2026-10-29-writer-v2-textos-da-base-congelada.md).
