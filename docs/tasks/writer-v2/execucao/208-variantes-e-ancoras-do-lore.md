# P3 — variantes e âncoras de lore da campanha

- Data: 2026-10-29.
- Base: 49aa782; sequência de [201](201-portabilidade-privada-de-campanhas.md)
  e [207](207-inventario-fisico-e-auditoria-da-base.md).
- Estado: leitores internos validados localmente por testes dirigidos;
  P3/D/F2-09 e macro 8/35 abertos.

## Objetivo e escopo

Ler variantes da geração ativa ou layout legado, inclusive removidas/inativas,
com âncora congelada autorizada e bodyBinding exato. Preservar conteúdo adaptado
e estado sem recapturar fichas atuais nem transformar conteúdo revogado em próprio.

- campaignBackupBaseContext.mjs: factory privada para uma base capturada declarada,
  após gate atual; validar dono/campanha/aventura, encarnação e universo próprios
  da âncora antiga. Leitor atual conserva API.
- campaignBackupLoreContext.mjs: roteamento de geração, estado e provas de variante
  e âncoras por metadata, sem nomes/manifests antes da origem.
- campaignBackupLoreContent.mjs: binding/provas nativas, JSON canônico e relações
  projetadas após SHA integral. DTO fechado sem controles ou paths.
- campaignBackupLore.mjs: inventário paginado e leitores internos de variante,
  cabeçalho/auditoria da âncora e partes textuais da âncora.
- Testes Node dedicados com produtores C2/C3 e metadados nativos simulados.
  Documentação, ADR e evidência parcial.

## Contratos

Fonte própria/C4 e derivedToken obrigatório em cada transação. Escolher somente
geração ready declarada, sem fallback; conferir controle/revisão e encarnação
da campanha mesmo se a aventura/base atual ficar indisponível. Variante sem
controle é inconsistência. Campanha independente não aceita variantes.

Listar até 25 resultados e lookahead por sourceKey, sem filtrar removed/inactive
ou revogadas. Cursor canônico escopa UID/campanha/fonte/derivado/armazenamento/
limite/início. Entrada contém só id/variantToken/availability. Prova vincula
metadata/nascimento/updateTime e a âncora atualmente autorizada.

Anchor explícito exige base/sourceKey válidos; ausência usa a base atual nativa.
Nunca procurar outra base ou ficha por nome. Cada base antiga exige mesmo
UID/campanha/aventura e ready, origem da aventura anterior à captura e universo/
ficha autorizados por suas próprias encarnações. Ficha recriada entre bases
novas/antigas não reautoriza a âncora antiga. anchorKey é chave lógica declarada,
não procedência portátil. Origem indisponível retorna resultado sem nome,
manifesto, hash textual ou prosa; não impede leitura dos próprios do plano 204.

Após comparar variantToken, ler nome/categoria/manifest/bodyBinding e conferir
identidade nativa. Reutilizar overlayRecord/normalizedBodyBinding; preserve mode,
previousMode e participação/retainedLegacy quando presentes. Não ativar inativas
nem restaurar removidas automaticamente.

Manifesto com corpo usa binding legado ou geração ready do mesmo dono/campanha/
encarnação, inclusive geração anterior; IDs físicos não entram no DTO. Corpos
têm chave determinística por campaignToken/base/sourceKey/bodyRevision/index,
metadata antes de content, identidade nativa, UTF-8 e partes até 65.536 bytes.
Conferir SHA/tamanho integral e JSON canônico da entidade antes de qualquer
projeção. Limite existente de 900.000 bytes por entidade; é permitido parsear
essa unidade limitada, nunca o projeto completo. A leitura lógica retorna
uma entidade limitada por chamada, sem criar staging persistente ou repetir
sua leitura para cada parte de transporte. O framing do arquivo fragmentará
essa unidade depois; não há cap total do projeto.

Relações de variante só conservam tipo/descrição para alvo atualmente autorizado,
não removido/inativo. Alvo revogado/ausente conserva targetKey e available false.
Nenhum texto é truncado ou normalizado silenciosamente: JSON validado deve
reproduzir bytes canônicos armazenados, como no consumidor ordinário.
contentToken privado vincula provas do binding/corpos, projeção e fonte.
A encarnação da ficha também precisa preceder a base do bodyBinding; avançar
para âncora mais nova não reautoriza texto anterior à origem recriada.

Leitor de âncora retorna snapshot/cabeçalho lógico e auditoria integral dos
campos congelados, usando 206/207. Texto da âncora sai por campo/índice limitado,
com prova e SHA/tamanho declarados. Nenhuma substituição por prosa live.

## Critérios

- [x] Layout legado e gerações ativas/anteriores lidos por binding exato.
- [x] Removed/inactive/legacy preservados sem promoção de acesso/estado.
- [x] Origem recriada/revogada não revela nome/manifesto/prosa, inclusive âncora antiga.
- [x] SHA/bytes/JSON canônico e escopos nativos conferidos antes do DTO.
- [x] Âncora congelada e textos próprios preservados, relações indisponíveis projetadas.
- [x] Paginação, prova obsoleta, C4/adoção/conta, corrupção e pedidos desprendidos testados.
- [x] Lint/formato/docs, regressões dirigidas, revisão e evidência registrados.

## Limites e sequência obrigatória

Ainda falta inventário físico completo de corpos de variantes e dos escopos
referidos pelo grafo de bindings, com órfãos/ausências e segunda passagem conjunta.
Layouts/gerações operacionais não referidos não são conteúdo portátil.
Depois: binários/Storage, reconciliação de todas as famílias, manifesto/atestado,
arquivo, persistência/cleanup, restauração e UI/ciclo P3. Antes de novos produtores
persistentes, ampliar C4 v1–v4 e consumidores de procedência restaurada. Provas
privadas não são atestado portátil nem grant. Sem endpoint, Rules, dependência,
chave, job ou pin novo; commits locais sem CI/push/PR/merge/deploy/subagentes.
Validate integral no fechamento do grande bloco.
