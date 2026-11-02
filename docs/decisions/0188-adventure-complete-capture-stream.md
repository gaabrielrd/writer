# ADR 0188 — composição das oito seções da aventura

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 166](../tasks/writer-v2/execucao/166-composicao-integral-da-captura-de-aventuras.md).

## Decisão

streamAdventureArchiveRecords reúne structure/resources/lore/personas/universe,
history/drafts/images com um source pin. Recolhe somente duas provas para o
rascunho escolhido, confere contagens centrais e histórico/imagens contra o
inventário inicial, sem mapa do projeto nem conteúdo integral em memória.

Antes de package-end, verifica novamente todas as imagens/gerações, head/body
do draft e inventário completo. Este inclui identidades/presenças/perfis/origem
de universo e chunks históricos, não só contagens ou última página. São leituras
sequenciais de fontes independentes, sem prometer transação única Firestore/GCS.
Tokens ficam na prova local; somente conteúdo e manifestos entram no arquivo.

streamAdventureArchive encapsula os registros no framer próprio, com guard em
cada bloco binário, inclusive entre package-end e o end do container. Ponte de
um slot, cancelamento imediato, fechamento das fontes e observação de resultados
tardios impedem sucesso após falha ou troca de conta. Assinatura de livro não muda.

Congelamento puro de input do draft é compartilhado internamente com o compositor;
não confere acesso, que continua verificado pelos readers autorizados.
Prova captured-data-only certifica captura e envelope, sem validar semanticamente
um arquivo externo. Nenhum consumidor/restore deve ativar projeto somente por ela.

## Validação e continuidade

11 testes integrados positivos na primeira seleção (738 ms; 2,65 s total):
oito seções reais, Unicode/histórico e PNGs, draft separado, importação nativa,
revisão independente do envelope, contagem, I/O/retry, intenção, perfil privado
alterado sem rootclock, geração, origem antiga, conta e cancelamento.
Typecheck inicial identificou opção source indevida na chamada de verifyInventory;
removida, pois o verificador fixa a origem da própria prova.

Validate integral do bloco será registrado na evidência após execução.
Leitor/validador autoral, índice/revisão, transporte/UI, restauração e roundtrip
seguem pendentes; P2/P3/D e gates não são concluídos por esta composição.

## Execução dos checks

O lint monolítico falhou por memória; limite local de heap também falhou.
Executor sequencial mantém configuração/ignores/escopo integral, inclui novas
features e usa passagem final da raiz. Três testes reais comprovam cobertura
do restante/ignorados e propagação de falha. Não há dependência/regra nova.

Lint completo passou. Rodada de cobertura com quatro workers sofreu OOM;
a repetição com VITEST_MAX_WORKERS=1 só no subprocesso executou 320 arquivos e
4.227 casos: 4.226 positivos/um timeout. Cobertura global acima dos limites.

Timeout do corpus PNG 16 MiB foi ampliado somente nesse caso, de cinco para
30 segundos; corpo/asserções e produção permanecem iguais. Seleção corrigida
passou. A chamada original de validate continua registrada com exit 1 e o
fechamento formal será repetido no próximo grande bloco, conforme política de
checks necessários após ajuste. P2/F2-09 não são declaradas concluídas.
