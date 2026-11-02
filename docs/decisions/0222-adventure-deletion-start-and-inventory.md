# ADR 0222 — início privado e inventário físico da exclusão de aventuras

- Data: 2026-10-28.
- Estado: preparação interna implementada; plano 199 aberto.
- Base: 24411d3. Complementa a [ADR 0221](0221-adventure-deletion-reservation-and-source.md).

## Contexto

O guard permanente precisa de um produtor que confira a intenção atual e
preserve a identidade de tentativas confirmadas/incertas. A limpeza por pais
existentes não encontra subcoleções cujo head tenha desaparecido.

## Decisão

Implementar somente o serviço interno de início, resolução, consulta e catálogo.
Nenhum método é exportado por index.mjs, nem há callable ou UI para iniciar
exclusão. Avanço e fechamento da limpeza continuam pendentes.

O pedido fechado fixa UID, aventura, nascimento, sourceToken, revisão e operação.
A transação confere a fonte atual e cria reserva, job e recibo, marca a raiz
deleting e desfaz o vínculo tipado do universo. Não remove corpo de autoria
nessa etapa. O contador/vínculo do universo é validado pela primitiva existente;
falha não produz reserva ou revogação parcial. Revision overflow/data inválida
também recusam antes de escrever.

O job privado conserva título, versão de limpeza e metadados de progresso.
Nascimento de job/reserva/recibo inicial deve coincidir; recibo é imutável e
conserva hash do estado inicial. Último recibo/checkpoint, hash do job e
updateTime nativo ficam vinculados. Marcador presente exige o nascimento
original da aventura e updateTime da transação inicial. Cópia/recriação de
metadados ou raiz não autoriza uma tentativa antiga. Raiz ausente não remove
a reserva nem a intenção já confirmada; o status continua privado, sem grant
para texto. O token do job depende de seu nascimento nativo.

A confirmação nativa é lida depois do commit. Se a resposta ou leitura se
perder, repetir/resolver o pedido original encontra o recibo. Resolver início
desconhecido cria somente fence privado daquele fingerprint; início tardio
fica cancelado. Resolver início conhecido devolve confirmação/progresso,
sem cancelar a exclusão. Outra conta não recebe identidade ou título do job.

Ler recibos com máscaras das quatro folhas de receipt, sem selecionar o objeto
inteiro. Catálogo privado observa UID, data/ID, janela limitada e provas nativas.
O índice de adventureDeletions foi declarado no arquivo de configuração;
isso não comprova ativação/configuração de produção.

Inventário v1 fixa as 19 coleções diretas do domínio. Filhos conhecidos usam
collectionGroup para body/planning/references/milestones, com limites de nome
dentro da raiz (!/! e ~/~). Os nomes ASCII das coleções autorizadas ficam
dentro desse intervalo. Conferir cada caminho/profundidade/família e metadados
de dono/projeto antes de devolver referências; caminho inesperado é preservado
e impede certificação. Não depender da existência do pai ou da raiz.

A página tem no máximo 25 documentos e seleciona somente metadados. Após uma
remoção, consultar novamente desde o início; vazio é outra observação, e a
verificação final percorre todas as famílias, inclusive filhos sem head.
Não usar travessia por pais como fallback de uma porta sem collectionGroup.
O layout é independente do layout de restauração para não alterar jobs vivos
implicitamente; mudanças de família exigem revisão da versão da limpeza.

## Fontes e evidência

A [API pública Query do SDK](https://googleapis.dev/nodejs/firestore/latest/Query.html)
documenta projeção, limites e cursores. A
[StructuredQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery)
define posições de cursor que não precisam corresponder a um resultado.
O intervalo específico e a classificação dos caminhos são decisões locais,
comprovadas pelos testes; não são uma garantia adicional da documentação.

28 Node e oito SDK/Rules reais no emulador demo passaram. A prova isolada
também encontrou quatro corpos com pais/raiz ausentes e excluiu cinco caminhos
de outros projetos. A evidência completa fica na entrega parcial.

## Pendências

O serviço permanece sem exposição até integrar quiescência, retirada de mídia/
usos, limpeza de controles e fontes de importação/restauração/chat, atividade,
avanço/recibos e verificação final. UI/retomada e validate integral do bloco
também permanecem abertos. Nenhuma exclusão real ou implantação foi executada.
Índices, credenciais e comportamento no ambiente de produção não foram testados.
