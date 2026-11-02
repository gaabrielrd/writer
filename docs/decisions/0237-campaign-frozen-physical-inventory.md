# ADR 0237 — inventário físico e auditoria da base congelada

- Data: 2026-10-29.
- Estado: serviço interno implementado localmente.
- Base: 0120755; [plano 207](../tasks/writer-v2/execucao/207-inventario-fisico-e-auditoria-da-base.md).

## Decisão

Inventariar bodies, links, loreReferences e images por páginas fixas de até
25 resultados e lookahead, sem filtrar indisponíveis. Cursor e pageToken vinculam
conta/campanha/fonte/derivado/base/família/limite/início e dependências nativas.
Reautorizar o gate de origem/C4 em cada transação. Nenhuma listagem lê nomes ou
prosa; manifests só após autorização do dono lógico.

Conferir os dois sentidos dos vínculos: corpo físico precisa de dono e campo
declarado, índice e chave determinística; auditoria do item exige todas as partes
de cada campo. Isso detecta tanto corpo órfão/extra quanto parte ausente.
Principal compartilhado continua apontando para a cena sem cópia física.

Auditar bytes no servidor por campo, em sequência, com SHA incremental e
contagem integral. O limite nativo de unidade de 2 MiB permanece, sem cap de
projeto. Não juntar texto completo ou confiar no hash calculado pelo cliente.
Dobrar identidades nativas dos corpos em ordem; regravar bytes idênticos muda
a prova nativa. Parte vazia, BOM e espaços conservam bytes literais.
Ficha revogada não tem manifests/prosa auditados e mantém resultado indisponível.

Links exigem sourceKey e tipo corretos. Alvo de cena/evento ausente conserva
chave lógica indisponível. Lore exige ledger canônico processed e coerente com
a captura; ledger tem testemunha de link válida. Origem externa não é consultada
nem promovida. DTOs indisponíveis conservam somente chaves/estados lógicos,
sem nome, relação textual ou origem em outro escopo.

Imagem exige pin ready válido, tamanho/geração exatos declarados, uso tipado no
mesmo UID/campanha/base e bloco referenciador capturado. Imagem sem bloco recusa;
imagem declarada sem registro é detectada pela auditoria do item. Uso/biblioteca
removidos conservam indisponibilidade explícita. DTO autorizado só inclui chave
lógica/tamanho; path, generation, imageId e useKey são privados. Este incremento
não lê Storage nem bytes de imagem; nenhuma substituição pela imagem atual.

A query inversa de imagem precisa de índice: o mapa items.image já está
excluído da indexação. Acrescentar apenas override ascendente COLLECTION para
image.imageKey, mantendo image e sua prosa excluídos. A documentação oficial
permite configuração específica de subcampo sob mapa excluído. Queries de
testemunha de links usam igualdades em campos primitivos com índices automáticos.
Fonte: [Firebase — índices e exceções](https://firebase.google.com/docs/firestore/query-data/index-overview).
O arquivo local de índices não comprova sua ativação no banco.

Ler snapshot antigo da base por máscara, identidade nativa e token derivado.
Título/sinopse/idioma/capturedAt e declaração de origem não autorizam origem.
DTOs são JSON em partes de 65.536 bytes e SHA total, sem campos operacionais.

Extrair validItem/validateCapturedFields para campaignBaseValidation.mjs,
preservando os reexports antigos: o leitor e auditor compartilham validação e
leitura de partes sem criar ciclo content -> reader -> bodies -> content.

## Limites

Provas por unidade/página são privadas. Ainda falta segunda passagem integral
e reconciliação conjunta de todas as famílias/declarações antes do manifesto.
Auditoria de bytes não substitui validação semântica do cabeçalho/arquivo.
Também faltam variantes/legadas/bodyBindings, binários/Storage, atestado portátil,
arquivo, persistência/cleanup, restauração e UI/ciclo P3. Ampliar C4 e consumidores
de procedência antes de produtores persistentes. Não assinar hash de cliente.

Sem endpoint, Rules, dependência, chave, job, pin ou escrita de conteúdo novos.
Somente índice local preparado, sem implantação. Bancos de teste não provam
concorrência, índices ativos ou credenciais de produção.
Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-inventario-fisico-da-base.md).
