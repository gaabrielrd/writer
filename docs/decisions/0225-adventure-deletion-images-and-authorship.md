# ADR 0225 — usos de imagens e autoria na exclusão de aventuras

- Data: 2026-10-28.
- Estado: processadores internos implementados; plano 199 aberto.
- Base: 916490c. Complementa a [ADR 0224](0224-adventure-deletion-source-retirement.md).

## Contexto

Após encerrar a fonte, o projeto ainda mantém usos de imagens e conteúdo de
autoria. Uma imagem pode atender várias cenas e outros projetos; retirar usos
individualmente com o mesmo contador inicial perderia atualizações no lote.
A ausência de um pai não significa ausência de seus corpos.

## Decisão

A fase media é um portão de leitura. Revalidar as identidades originais,
controles de mídia/coleta completos, fonte vazia, ausência de chave e de
imagem preparing atribuída à aventura. Não aceitar mídia nem remover arquivos
da biblioteca durante esse portão.

Consultar collectionGroup uses com adventureId e limites documentais dentro
de users/UID/imageLibrary. Nomes de imagem seguem o contrato ASCII de 16–80
caracteres existente. Conferir caminho/profundidade, tipo adventure-block,
recurso scene/block e chave tipada derivada de adventureId/recurso.
Selecionar somente metadata por folhas; nunca nome, URL, imagem ou manuscrito.

Cada página tem até 25 usos. Agrupar todas as remoções por imagem e ler seu
cabeçalho uma vez, com máscara de id/state/useCount/ownerId. Cabeçalho presente
exige imagem ativa, dono compatível e contador suficiente; retirar o total
do lote em uma atualização. Outras propriedades, arquivos e usos permanecem.
Uso órfão, com cabeçalho de imagem ausente, pode ser removido sem criar imagem
ou contador. Não reconstruir ou retirar um arquivo desconhecido.

Remoções, contadores e recibo/checkpoint ficam na mesma transação. O SDK nativo
confere o nascimento/updateTime conjunto e a convergência de pedidos iguais.
Erro antes de qualquer escrita/recibo preserva o lote. ACK perdido recupera a
operação original sem repetir decrementos. Depois da página, reconsultar desde
o início; a observação vazia separada permite avançar para children.

Children processa as 23 famílias já versionadas no inventário: quatro grupos
de filhos e 19 coleções diretas. Cada unidade remove até 25 referências por
metadata, sem depender de heads. Uma consulta vazia avança a família. Ao fim,
reler todas as famílias com janela de uma unidade. Se conteúdo próprio conhecido
reapareceu, voltar àquela família sem certificar children; o próximo avanço
coleta o conteúdo e repete o vazio final. Caminho, dono ou família inesperados
continuam sendo recusados e preservados.

Não mudar o layout v1 nem atribuir uma migração a jobs públicos inexistentes.
Índices de uses por adventureId/nome (COLLECTION_GROUP) e de imagem preparing
por origem/estado foram declarados apenas localmente.

## Evidência e limites

78 cenários Node distintos positivos em rodadas sobrepostas, incluindo 22
novos de limpeza. 14 SDK/Rules distintos passaram em rodadas: paginação,
concorrência/contador nativo, escopo por conta/projeto, corpos órfãos, raiz
ausente, reabertura de família e uso de imagem sem head.
Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-usos-e-autoria-na-exclusao-de-aventuras.md).

A última fase implementada é children; o job passa para controls ainda em
deleting, mantendo a reserva e a raiz marcada quando presente. Controles,
chat derivado, atividade, verificação terminal/raiz, transporte/cliente/UI e
validate integral do bloco permanecem abertos. A política de perguntas próprias
continua pendente e nenhuma pergunta foi apagada.
Sem endpoint, Rules novas, dependências, CI, push ou deploy.
