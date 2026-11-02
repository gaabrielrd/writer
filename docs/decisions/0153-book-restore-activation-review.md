# ADR 0153 — Revisão final da ativação de livros

- Status: revisão interna implementada; ativação/host e fechamento de P1 pendentes.
- Data: 2026-10-25.
- Plano: [133](../tasks/writer-v2/execucao/133-revisao-e-ativacao-do-livro.md).

## Decisão

getBookRestoreActivationReview é serviço interno somente leitura. Requer job
original content-verified/cleanup14/schema13/activation-ready, inventário done
com layout final e nenhum cancelamento. Revalida conta, reserva/marcador e raiz
ausente pelo loader existente.

Lê metadata, origem de universo e capa pelo leitor autenticado do arquivo.
Confere selo/recibo de auditoria e preparação exata, imutabilidade/ordem temporal
nativa, âncora, controles, definições de capa/rascunho e lote preparando.
O selo deve existir, ter checkpoint atual e conservar sua preparação no recibo;
recibo sem preparação não confirma auditoria nem replay.

A observação de universo vem da autorização atual e nascimento original.
Descritor unavailable nunca é promovido. Não ler nomes/prosa global ou criar
vínculo/contador. Retornar resumo fechado e pequeno: título em prévia de até
300 unidades UTF-16 sem partir surrogate, contagens, privacidade, universo,
tipo de capa e destino do rascunho. A prévia não altera nem trunca o título salvo.

reviewToken liga conta/job/checkpoint, identidade nativa do job/selo/lote e
artefatos, fonte/validação/preparação, metadata completa e decisões atuais.
É identidade para comparação, não autorização. Não retornar chaves, jobToken,
caminhos físicos ou prosa de arquivos/rascunho/corpos no resumo.

Para capa de biblioteca, verificar generation/metageneration pelo adaptador
Storage original fora da transação; depois repetir a leitura/autorização das
dependências e exigir o mesmo token. Cancelamento, raiz concorrente ou mudança
do universo durante a espera impedem resposta confirmada.

## Consequências e próximos passos

A revisão não escreve documentos, aceita imagem, ativa lote ou cria raiz.
Checar Storage antes de uma transação não fornece atomicidade distribuída nem
garantia de disponibilidade futura: ativação deve revalidar novamente.
O token não substitui CAS/recibo/reautorização na transação final.

Passos 2–5 do plano 133 continuam obrigatórios: raiz e efeitos atômicos,
estado terminal/replay seguro, mídia/limpeza recuperáveis, host/roundtrip
integral e fechamento de P1. Nenhum endpoint, Rule, namespace ou dependência
novo; novas gerações indexadas permanecem desligadas por padrão.

[Evidência](../entregas/2026-10-25-writer-v2-revisao-da-ativacao-de-livros.md).
