# ADR 0239 — inventário físico dos corpos de variantes

- Data: 2026-10-29.
- Estado: serviço interno implementado localmente.
- Base: cdbe5e2; [plano 209](../tasks/writer-v2/execucao/209-inventario-fisico-das-variantes.md).

## Decisão

Enumerar raiz legada e cabeçalhos de todas as gerações por páginas de até
25 resultados e lookahead. Separar active, historical e operational por
ponteiro atual e estado nativo, sem ocultar preparing. Prova de loja inclui
nascimento/updateTime, metadata e armazenamento ativo. A fonte/C4 é revalidada
em cada chamada; nenhum leitor cria controles.

Varrer corpos de cada loja conhecida sem filtrar campaignToken. Conferir
coordenadas, chave determinística, encarnação da campanha e base da geração.
Owner é sempre o overlay da geração ativa; seguir seu bodyBinding exato para
classificar corpo como referenced, unavailable ou unreferenced. Corpo sem
owner/binding válido na loja ativa recusa. Corpo extra em revisão ainda
referida recusa mesmo na loja histórica. Resíduo não referido em loja antiga
ou operacional é observado por metadata, sem copiar content para o arquivo.

Origem revogada mantém unavailable sem manifesto/hash textual. Removida ou
inativa não é restaurada por inventário. Binding implícito v1 segue o manifesto
nativo; revisão de overlay após remove/restore não substitui bodyRevision.
Helper de routing lê somente manifest/bodyBinding após autorização, sem nome,
categoria ou prosa. Validação semântica/JSON/SHA integral permanecem no leitor
208, com o limite de 900.000 bytes por entidade.

Cobertura por variante enumera suas partes declaradas e exige presença,
coordenadas e os mesmos tokens físicos emitidos pelo inventário. Detecta
parte ausente que a listagem física já não pode observar. Origem revogada
não lê manifesto; estado base não fabrica corpo. Prova privada não é grant.

Listagem de cabeçalhos não descobre necessariamente um corpo sob pai ausente.
Acrescentar sonda collectionGroup por campaignToken da encarnação corrente,
com limites e máscaras fixas. Cada referência retornada precisa pertencer
à raiz/geração exata da campanha; pai ausente ou namespace contraditório recusa.
Cursor usa caminho completo, preservando IDs de corpo iguais em lojas diferentes.
Essa sonda cobre recursos nativos tipados da encarnação; não certifica ausência
de uma árvore arbitrária sem token ou de outra encarnação. Lojas conhecidas
continuam sem filtro e rejeitam metadata de outro token.

A consulta exige índice com escopo COLLECTION_GROUP. Preparar somente o campo
campaignToken, preservando ASC/DESC de coleção e a exclusão de content. A fonte
oficial distingue os escopos de índice e o ordenamento por referência completa:
[Firebase — índices](https://firebase.google.com/docs/firestore/query-data/index-overview).
Configuração local não comprova índice implantado ou backfill concluído.

Envelopes de página identificam família/loja/token além da fonte; cursores e
pageToken vinculam início/limite/escopo e lookahead. Metadata de paths/provas
é privada do protocolo, não DTO portátil.

## Limites e validação

Ainda faltam reconferência/reconciliação conjuntas de todas as famílias antes
do manifesto/atestado, imagens/Storage, arquivo, persistência/cleanup,
restauração e UI/ciclo. Ampliar C4 v1–v4 e consumidores antes de produtores
persistentes. Não assinar hashes arbitrários de cliente.

Testes usam produtores C2/C3 reais sobre banco com semântica de collectionGroup
e timestamps simulados. Não provam índices ativos, credenciais ou concorrência
Firestore. Sem endpoint, Rules, dependência, segredo, job ou pin novo.
Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-corpos-fisicos-das-variantes.md).
