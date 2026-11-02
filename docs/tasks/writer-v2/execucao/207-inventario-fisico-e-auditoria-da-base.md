# P3 — inventário físico e auditoria da base congelada

- Data: 2026-10-29.
- Base: 0120755; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md)
  e [206](206-itens-e-textos-da-base-congelada.md).
- Estado: implementação interna local validada por testes dirigidos;
  P3/D/F2-09 e macro 8/35 abertos.

## Objetivo

Inventariar todas as famílias físicas restantes da base nativa v1: bodies,
links, loreReferences e images. Provar vínculos nos dois sentidos e auditar os
bytes de todos os campos declarados de cada item no servidor, sem remontar o
projeto nem usar texto atual da aventura. Ler também o snapshot da base exata.

## Arquivos e arquitetura

- campaignBackupBaseBodies.mjs: leitura única de parte com prova nativa,
  compartilhada pelo leitor 206 e auditor; manifests após autorização.
- campaignBackupBaseResources.mjs: definições fixas, provas/DTOs de recursos
  físicos, vínculos, referências, imagens e snapshot.
- campaignBackupBaseInventory.mjs: serviço privado com paginação, leitura
  limitada de DTO e auditoria por item.
- campaignBackupBaseContent.mjs/context/read: exportar o validador de campos
  existente e a identidade interna da base; reutilizar leitura de corpo.
- firestore.indexes.json: exceção somente para items.image.imageKey; mapa image
  e prosa continuam sem indexação. Queries de testemunha usam igualdade sobre
  campos primitivos de links, sem varrer o projeto.
- Testes Node dedicados com captura/produtores reais e bancos com metadata
  nativa simulada. Validadores puros ficam em campaignBaseValidation.mjs,
  preservando os reexports do leitor antigo e evitando ciclo de imports.
  Documentação, ADR e evidência parcial.

## Contratos

Revalidar fonte própria/C4, derivedToken e origem em cada transação.
Todas as entradas são fechadas; capturar valores antes de await.
Famílias são fixas, sem path ou collection arbitrários. Páginas por ID usam
até 25 resultados e lookahead; cursor canônico vincula UID/campanha/fonte/
derivado/base/família/limite/último ID. pageToken inclui lookahead e provas
nativas das dependências. Não filtrar arquivo ou recursos indisponíveis.

Inventário lê somente metadata, coordenadas/manifests autorizados e pins;
não lê título/prosa/content de corpos. Antes dos manifests, provar owner
lógico e origem da ficha como em 206. Corpo revogado permanece entrada
indisponível sem manifestos/hashes textuais. Corpo acessível exige dono
capturado, campo declarado, bodySourceKey próprio, índice dentro do manifesto
e chave determinística. Corpo sem pai/campo ou extra fora do manifesto recusa.
Shared principal aponta para o corpo da cena e não gera cópia física nova.

Links exigem sourceKey capturado de tipo compatível e referência tipada.
Alvos capturados/autorizados conservam vínculo lógico; ausentes/revogados ou
de escopo externo ficam explicitamente indisponíveis, somente por chave.
LoreReferences exigem chave canônica, processed true, disponibilidade original
coerente com item capturado e ao menos um link de origem válido. Link lore em
escopo da base exige seu registro de captura. Nenhum lookup em escopo externo.

Imagens exigem chave/pin/geração/tamanho declarados válidos, uso tipado no mesmo
UID/campanha/base e bloco referenciador capturado. Sem referenciador é órfão e
recusa. Biblioteca/uso retirado fica indisponível; não buscar bytes ou substituir
a imagem atual. DTO só contém referência lógica/tamanho, nunca path, geração,
useKey, imageId ou URL. Conferência Storage e binários entram depois.

Leitor de recurso revalida resourceToken antes do DTO. Retorna resultado
indisponível sem conteúdo ou JSON em partes de até 65.536 bytes com SHA total.
Snapshot da base usa âncora derivada e identidade nativa, preserva título,
sinopse, idioma, capturedAt e declaração de origem. Não é procedência portátil.

Auditoria por item confere o token antes de manifests/prosa. Soma declarada
permanece no limite nativo de unidade de 2 MiB; não há cap total de projeto.
Para cada campo, ler partes sequencialmente, provar metadata antes de content,
conferir UTF-8/limite, acumular SHA e bytes sem juntar strings. Conferir SHA/
tamanho integral no servidor e dobrar provas nativas dos corpos em ordem.
Conferir também a imagem declarada, detectando pin ausente. Retornar provas
privadas limitadas por campos, nunca prosa. Revogado não tem corpo auditado.

## Critérios

- [x] Quatro famílias físicas paginadas sem omissões silenciosas e cursor escopado.
- [x] Corpos extras/sem dono/campo inválido e campos com partes ausentes recusam.
- [x] Auditoria servidor detecta adulteração multichunk e preserva vazio/BOM/Unicode.
- [x] Vínculos/referências/ledger e imagem/bloco/uso têm provas coerentes.
- [x] Revogação impede prosa/manifests e mantém indisponibilidade explícita.
- [x] Snapshot congelado e DTOs lógicos fechados não vazam pins/controles.
- [x] Fonte/conta/C4/adoção/prova obsoleta/corrupção e pedidos desprendidos testados.
- [x] Testes dirigidos, lint/formato/docs, revisão e evidência registrados.

## Limites e sequência

Provas por item/página ainda exigem segunda passagem completa e reconciliação
de todas as famílias antes do futuro manifesto/atestado. Não assinar manifesto
de cliente. Faltam variantes/legadas/bodyBindings, binários/imagens Storage,
atestação/procedência portátil, arquivo, persistência/cleanup, restauração e
UI/ciclo. Ampliar C4 v1–v4 e consumidores antes de produtores persistentes.
Sem endpoint, Rules, dependência, job, chave ou pin novos. Somente commit local,
sem CI/push/PR/merge/deploy/subagentes. Validate integral no fechamento de P3.
