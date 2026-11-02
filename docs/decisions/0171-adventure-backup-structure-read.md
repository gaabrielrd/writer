# ADR 0171 — estrutura privada da aventura por unidades

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Reutilizar a âncora 147 dentro da mesma transação de listagem/leitura, mantendo
seu hash v1 (vetor congelado no teste). Helpers internos não viram endpoint.

Lista parts usa N+1 metadata, limite 1–50, ID/cursor canônico e origem nativa.
Unidade de adventure/part confere fonte/UID/ID/tipo/token nativo antes de ler
DTO próprio em até 64 KiB. Toda intenção, inclusive índice, é capturada antes
de awaits; entrada mutável não troca faixa ou identidade validada.

Codec é projeção própria de estrutura, não dump nem schema de arquivo completo.
Preserva valores/presença de metadata e conteúdo legado da parte. Procedência
importada preserva tipo e hashes declarados, excluindo importId/URLs/campos de
operação; não confere autorização, licença ou confiança. PersonaId é vínculo
neutro, com prova de perfil separada no próximo contrato.

Dono/schema ausentes na parte legada seguem raiz autorizada e caminho nativo.
Dono diferente, schema futuro, exclusão/rebalance e marcador de corpo externo,
inclusive null, falham. Nunca interpretar stub como conteúdo inline.

## Custos e limites

Unidade relê a origem e somente um documento inline para conferir identidade;
não mantém cache autoritativo nem junta projeto inteiro. Isso pode reler o
mesmo documento entre faixas, com memória limitada ao item nativo/JSON atual.
Demais recursos/corpos externos terão seus leitores e provas próprios.
O [contrato Document da API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents)
fundamenta o orçamento do documento inline, sem limitar o arquivo global.

Esse token não certifica cenas, bindings/perfis ou projeto inteiro. Não há UI,
callable, Rule, namespace persistido, writer novo ou alteração de .writer livro.

[Plano 148](../tasks/writer-v2/execucao/148-leitura-da-estrutura-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-leitura-da-estrutura-de-aventuras.md).
