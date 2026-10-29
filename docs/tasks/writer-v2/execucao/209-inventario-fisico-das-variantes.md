# P3 — inventário físico dos corpos de variantes

- Data: 2026-10-29.
- Base: cdbe5e2; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md)
  e [208](208-variantes-e-ancoras-do-lore.md).
- Estado: leitores internos validados localmente por testes dirigidos;
  P3/D/F2-09 e macro 8/35 abertos.

## Objetivo e arquivos

Conferir corpos físicos das variantes nos dois sentidos, sem ler prosa:
gerações declaradas, raiz legada, bindings ainda referidos e resíduos operacionais.

- campaignBackupLoreBinding.mjs: manifesto/routing privados autorizados.
- campaignBackupLoreInventory.mjs: lojas, páginas físicas, sonda de órfãos por
  campaignToken e cobertura por variante.
- Fixture com collectionGroup limitado, sem alterar studioDb compartilhado;
  permitir injetar esse banco no helper de backup de lore.
- Índice COLLECTION_GROUP somente para loreVariantBodies.campaignToken,
  preservando os índices COLLECTION e a exclusão de content.
- Testes Node dirigidos; ADR/documentação/evidência parcial.

## Contratos

Fonte própria/C4 e derivedToken antes de cada transação, pela porta 208.
Entradas fechadas, desprendidas antes de await; UID/IDs/hash/limites validados.
Nenhum path arbitrário. Listas por ID têm até 25 resultados e lookahead,
cursor canônico escopado por fonte, armazenamento, família/loja, limite e início.
PageToken inclui provas e lookahead.

Lojas incluem raiz legada fixa e todos os cabeçalhos de loreGenerations,
sem filtro que esconda preparing. Cabeçalhos pertencem ao UID/campanha/
encarnação, base hash e schema nativo. Ready ativa/histórica é distinta de
preparing operacional; nenhum conteúdo operacional é promovido ao backup.

Listar corpos de cada loja conhecida sem filtro de token: conferir metadados,
chave determinística e escopo. Corpo referenciado por overlay ativo usa binding
exato, mesmo em loja histórica. Acessível exige manifesto autorizado e índice
dentro dele. Corpo sem owner/binding na loja ativa é órfão e recusa. Resíduo em
loja histórica/operacional, de binding/revisão não usado, é unreferenced, sem
ler content ou exportá-lo. Referenciado revogado é unavailable, sem manifesto/
hash textual. Removed/inactive não são reativados por esta classificação.

Cobertura de variante enumera todas as partes declaradas (máximo nativo da
entidade de 900.000 bytes), confere ausência/coordenadas e devolve os mesmos
tokens físicos do inventário. Nenhuma prosa; SHA integral/JSON continuam no
leitor 208. Sem corpo retorna none; origem revogada retorna unavailable.

Query collectionGroup por campaignToken da encarnação descobre corpos nativos
sob pai ausente e não depende só de cabeçalhos enumerados. Caminho da resposta
deve ser raiz/geração exata da campanha; outro caminho ou geração sem pai recusa.
Cursor guarda referência completa, para não pular IDs iguais em lojas distintas.
Essa sonda cobre o cohort tipado da encarnação; não certifica árvore arbitrária
sem token ou de outra encarnação. Lojas conhecidas são varridas sem filtro e
rejeitam token contraditório. É inventário de backup, não limpeza C4 genérica.

## Critérios

- [x] Raiz/gerações ativas, históricas e operacionais enumeradas sem duplicação de leitura por variante.
- [x] Bindings antigos e implícitos têm classificação/cobertura coerentes.
- [x] Ausência/extra/órfão na loja ativa e pai ausente na sonda recusam.
- [x] Resíduo operacional e revogado permanecem explícitos, sem prosa/manifests indevidos.
- [x] Tokens de cobertura coincidem com inventário e mudam por identidade nativa.
- [x] Cursores/cópias/escopos/C4/adoção/conta/corrupção e índices cobertos por testes.
- [x] Lint/formato/docs, regressões afetadas, revisão e evidência registrados.

## Limites

Provas privadas não concedem acesso ou procedência. Ainda faltam reconferência
conjunta de todas as famílias e reconciliação antes do manifesto/atestado.
Seguem imagens/Storage, arquivo, persistência/cleanup, restauração e UI/ciclo.
Ampliar C4 v1–v4 e consumidores de procedência antes de novos produtores
persistentes. Sem endpoint, Rules, dependência, segredo, job ou pin novo.
Somente commits locais, sem CI/push/PR/merge/deploy/subagentes.
Validate integral no fechamento do grande bloco P3.
