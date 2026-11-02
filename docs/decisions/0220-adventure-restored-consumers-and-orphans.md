# ADR 0220 — Legado visível e recuperação explícita de cenas sem parte

- Data: 2026-10-28.
- Estado: implementado com validação dirigida local.
- Plano: [198](../tasks/writer-v2/execucao/198-ciclo-normal-das-aventuras-restauradas.md).

## Contexto

O ciclo normal da cópia restaurada revelou dois problemas de acesso.
getSceneGroup trata partes de aventura como composição por cenas e não
retornava o texto legado ainda preservado no documento. Cenas cujo pai estava
ausente continuavam legíveis por ID, mas o planejador não oferecia localização/
realocação utilizável. Preservação no arquivo não basta para um estúdio de escrita.

## Decisão

Retornar o conteúdo anterior da parte como legacy/content/hash, mantendo
contentMode scenes e a composição existente. O planejador mostra fonte
preservada sanitizada, separada das cenas e da contagem do manuscrito.
Não oferece conversão de livro em aventura, não cria nova cena nem duplica prosa.

Adicionar listOrphanScenes somente para aventuras: UID/projeto autorizados,
heads próprios por ID, limit+1 e pais conferidos por página. Não lê corpos.
Uma página pode estar vazia e ainda ter cursor; a UI permite continuar.
O cursor vincula conta, projeto, tipo e revisão. Partes existentes, inclusive
em exclusão, não são consideradas ausentes por esse fluxo.

A prévia usa o leitor normal e renderRichText. Somente confirmação explícita
chama recoverOrphanScene, com revisão e parent observados. Na transação,
reautoriza projeto/cena, confere CAS e ausência atual da parte; parte recriada
ou conta/origem alteradas recusam. Move para Sem parte usando rank/controle
atuais, registra formerParentId como no destaque normal de agrupador e ajusta
ledger/contadores. Corpo, blocos, histórico e estado de arquivo ficam preservados.

A operação usa o namespace de recibos de cenas e fingerprint do pedido.
Retry exato não duplica contagem; a UI reutiliza SceneOperationDialog e bloqueia
cancelamento durante resultado incerto, mantendo o mesmo pedido. A cópia/fonte
do backup não é alterada automaticamente. Não muda o formato do arquivo.

Os dois exports literais usam callable comum com Auth/App Check e limites
existentes. Headers privados/no-store/Vary Auth foram incluídos para ambos.
Serviços e UI permanecem em scenes; adventure-portability só integra no teste.

## Evidência e limites

[Matriz](../tasks/writer-v2/consumidores-aventuras-restauradas.md) e
[entrega](../entregas/2026-10-28-writer-v2-ciclo-normal-das-aventuras-restauradas.md)
registram cinco ciclos/casos integrados, testes de UI/backend/SDK e nove
verificações Chromium. Sem dependência, Rules, índice, formato ou regra global
nova; AGENTS não foi alterado. A exclusão completa da aventura continua pendente.
O validate integral será repetido no fechamento do bloco de exclusão/auditoria;
o anterior de fe49e9f não comprova este novo código.
