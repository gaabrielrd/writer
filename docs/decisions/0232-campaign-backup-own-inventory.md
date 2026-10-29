# ADR 0232 — inventário próprio e provas por sessão da campanha

- Data: 2026-10-29.
- Estado: leitor interno implementado; P3 aberto.
- Base: a30a8fa. Complementa a [ADR 0231](0231-campaign-backup-private-source-anchor.md).
- Plano: [202](../tasks/writer-v2/execucao/202-inventario-proprio-da-portabilidade-de-campanhas.md).

## Decisão

Inventariar nove coleções diretas da campanha por ID, em páginas de 1–25 e uma
unidade adicional de lookahead. Usar select e máscaras fixas de metadados, sem
texto/target derivado. C4, dono e a âncora global são conferidos antes da query.

Não filtrar deleted. Sessões e itens excluídos preservam tombstones válidos;
vínculos e controles por sessão podem continuar existindo. Um corpo exige
cabeçalho ativo correspondente, com mesma revisão/kind; sua ausência ou escopo
incompatível recusa explicitamente, sem truncar ou escrever dados.

itemToken cobre domínio/UID/campanha/âncora/ID, nascimento/updateTime do documento
e dependências nativas. Sessão observa seus controles opcionais S2 e S3.
Referências/vínculos observam a sessão e seu controle; vínculos ativos S3
também observam o item de destino, incluindo tombstone. Todos os controles
exigem a encarnação da campanha e revisões compatíveis. Cache pertence somente
à transação/página; não é snapshot persistido nem autorização reutilizável.

A página retorna apenas schemaVersion, campaignId, sourceToken, family,
id/itemToken por item, pageToken e nextCursor. pageToken cobre também o início,
limite e lookahead. expectedPageToken reconfere a mesma página. Cursor canônico
versionado vincula UID/ID/âncora/família/limite/último ID, sem reduzir o contrato
de ID documental nativo. Não é grant nem certificado de cobertura completa.

Reutilizar os helpers de escopo/token/identidade da âncora. Seu DTO e escopo
root-fixed-controls permanecem iguais; não ampliar silenciosamente sua garantia.

## Consequências e limites

A captura completa precisa registrar todas as páginas/itens em índice limitado,
repetir todas as famílias desde o começo, conferir término e âncora final antes
do selo. Inserção atrás de um cursor antigo pode não aparecer na página seguinte.
Rever apenas essa página não prova completude. A futura ativação também deverá
conferir cobertura no servidor, sem aceitar um relatório cliente como prova.

Ainda faltam DTOs de conteúdo e leitura em chunks, composição/segunda passagem
do arquivo, procedência autorizada da base, restauração, interface e ciclo P3.
Não há endpoint, job, pin ou persistência novo; C4 permanece v1–v4 até a evolução
explícita de seu inventário antes de habilitar os produtores.

A [evidência parcial](../entregas/2026-10-29-writer-v2-inventario-proprio-de-campanhas.md)
usa escritores/captura reais e banco de teste com relógios nativos simulados.
Não comprova isolamento/retry em Firestore real, Rules, credenciais ou produção.
