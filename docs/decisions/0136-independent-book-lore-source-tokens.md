# ADR 0136 — Origem independente por ficha de lore

- Data: 2026-10-25.
- Estado: aceita, opção implementada; consumidores/compêndio pendentes.
- Plano: [121 / M38c5w](../tasks/writer-v2/execucao/121-origem-independente-por-ficha-de-lore.md).
- Complementa [ADR 0091](0091-private-complete-lore-reads.md) e
  [ADR 0135](0135-atomic-lore-removal-batches.md).

## Problema

Tokens v1 incluem listToken/localLoreVersion. Isso conserva um snapshot do
compêndio, mas também faz cada mutação própria invalidar outras fichas
selecionadas e intactas. Reabrir suas fontes após aprovar a seleção pode
adotar conteúdo posterior. Uma transação conjunta não é limite de autoria.

## Decisão

Oferecer tokenVersion: 2 por opção explícita em listBookLoreRead e
getBookLoreRead. O padrão continua 1, com os mesmos hashes, cursores e wire.
Token v2 tem domínio book-lore-read-entity e schemaVersion 2, vinculado a UID,
livro/nascimento nativo do livro, ID e identidade nativa completa da ficha
(createTime/updateTime). Não inclui o clock do compêndio.

Cada operação continua autorizando dono, existência, deleting e clock válido
do livro, além das validações de escopo/estado e provas de corpo. Troca da
própria ficha, inclusive datas lógicas preservadas, invalida sua identidade
nativa quando muda updateTime. Recriação de livro/ficha nunca herda o token.

Get com readToken esperado aceita somente correspondência exata v1 ou v2
e devolve esse mesmo token. Recusa tokenVersion junto com origem fixada.
Partes, inspeções, uploads, inventário e reserva de recuperação conferem ambas
as fórmulas, sem converter a intenção nem alterar hashes/journals. Token v1
antigo continua falhando após mudar o clock; retry não o promove para v2.

A chave já reservada conserva suas regras anteriores de origem autorizada
e nascimento, para recuperar o próprio rascunho após edição; token v2 não
altera esse lifecycle. Emissão de outros produtores, inclusive análise, segue
v1 por padrão. Criação conserva seus tokens próprios de reserva.

## Coleção, cliente e seleção

listToken continua vinculado ao clock global. Lista completa/paginação ainda
devem ser verificadas contra a mesma coleção. Cursor v2 fixa schemaVersion
e tokenVersion 2; cursor v1 conserva o formato anterior. Misturar versões
entre páginas é recusado. Os envelopes de resposta não ganham novo formato;
a versão do token é independente da versão do armazenamento inline/v1/v2.

createBookLoreReadClient aceita terceira opção { tokenVersion: 2 }. A opção
só é enviada ao emitir uma origem nova ou listar. Cabeçalhos/partes/final usam
sempre o token original esperado; cliente com qualquer opção pode retomar um
token fixado da outra versão. Montagem conserva SHA/UTF-8/schema e confirmação
final; list conserva as duas passagens globais e recusa coleção alterada.

Nenhum consumidor atual é migrado neste incremento. O futuro coordenador
de seleção deve capturar v2 explicitamente, fixar cada origem e preservar
progresso/conflitos individuais. É possível operar membros sucessivos sem
reabrir a origem após cada mutação própria. Isso não transforma operações
singulares em sucesso atômico conjunto; tal alegação exige ADR 0110/0135.

## Consequências e fronteira

Compatibilidade aditiva, sem migração cifrada, recaptura silenciosa ou novo
grant. Não há limite de 50 fichas na seleção; páginas e unidades transacionais
continuam limitadas e precisam respeitar seus budgets reais. Os testes de
53 origens não certificam volume/latência de produção.

Ainda integrar seleção durável, transporte/recuperação/UI e compêndio; lifecycle
na exclusão do livro, demais consumidores/backup/rollout/validate de P1 e
fases/gates da V2 permanecem abertos. Sem Rules, deps, índices, env ou callable
novo, CI, envio remoto ou deploy.
