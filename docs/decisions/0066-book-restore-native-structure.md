# ADR 0066 — Estrutura nativa restaurada e limpeza v4

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M22](../tasks/writer-v2/execucao/55-preparacao-nativa-da-estrutura.md).

## Decisão

advanceBookRestoreStructure é interno à fábrica. Consome um item M20/M21 por
operação, confirma verify(tx) e CAS, grava recursos/journal/progresso/recibo
atomicamente. Não entra nos exports HTTP/callable ou BOOK_RESTORE_METHODS.

A primeira unidade fixa timestamp e validationCheckpoint, inicializa workProgress
sob o destino reservado e muda cleanupVersion para 4 no mesmo commit. O snapshot
final da validação não muda: M20 confere seu checkpoint contra validationCheckpoint
somente em v4. Versões v1–v3 continuam exigindo o checkpoint corrente.

Conteúdo continua content-verified, sem afirmar restauração concluída. preparation
traz somente schema/phase/itemIndex/contadores/timestamp. Fase structure processa
metadata/atos/capítulos; resources para no primeiro item seguinte, sem consumi-lo.
Novo pedido após esse limite retorna structure-complete. Recibo anterior continua
resolvível mesmo depois de cancelamento/cleanup.

## Documentos e ledger

V4 cobre exatamente acts, chapters, workProgress, workWordGroups e workWordSources.
Atos preservam nome/ordem; capítulos preservam prosa/título/ordem/actId/complemento,
modo e rankSlot. Recriar IDs/dono/datas/revisões e contagens. Histórico/rascunho
não criam capítulos atuais. Composição por cenas começa com zero até seu writer.

Reusar createWorkProgressLedger com leitura real, controle countReady falso e
agrupador futuro. Seu commit é capturado em buffer limitado de writes nativos,
antes do journal, sem update da raiz. Reconstruir fontes/fingerprints/grupos/
controle pelo contrato existente. Raiz permanece ausente; nenhum cliente pode
acessar a preparação nem alterá-la por writers que exigem o livro ativo.

Cursor e contadores são clonados dentro de cada tentativa da transação. A função
pode ser executada novamente pelo SDK; não mutar a preparação capturada fora do
callback. Timestamp e conteúdo preparados ficam fixos entre tentativas.

## Journal e pertencimento

materializationArtifacts é privado sob o job; contém contexto, tipo/ID e operações
criadora/última. Não guarda corpo ou caminho arbitrário. Tipo/ID fechados constroem
somente os cinco caminhos permitidos do livro reservado. Até oito writes nativos
por unidade; cada um tem journal no mesmo commit.

Documento/journal/primeiro recibo têm o mesmo createTime. Última atualização do
documento e journal coincide com createTime do último recibo imutável. Contexto
UID/restoreId/jobToken, ação e checkpoint também precisam conferir. Substituição
de controle próprio revalida essa prova antes de alterar; nunca overwrite de
documento sem journal válido.

## Cancelamento e limpeza

V4 cancela primeiro, revoga chave e entra em artifacts. Cada unidade remove até
50 pares reais (documento+journal), por máscaras/identidades nativas sem ler prosa.
Recusa alteração, recriação, contexto estranho ou raiz presente. Contadores
acompanham artefatos efetivamente removidos, mantendo replay idempotente.

Uma unidade sem deletes certifica journal e as cinco coleções vazios, comparando
contadores, e segue chunks → validation-index/items/state → proofs → state.
Na conclusão, confere novamente esses namespaces para recusar reaparecimento.
Reservas/marcadores/recibos permanecem; outros livros nunca entram no inventário.
V1/v2/v3 mantêm seu inventário e semântica. Ampliar versão antes de novos tipos.

## Limite nativo ainda pendente

O formato admite itens lógicos até 8 MiB; não reduzir esse limite para caber no
modelo atual. SDK real recusou um campo content de 1.100.000 bytes. A transação
não criou capítulo/recibo nem avançou cursor; conteúdo integral continuou legível
do arquivo privado, sem content-rejected ou truncamento.

Suporte a campos grandes, com adaptação dos leitores/escritores, é obrigatório
antes da ativação/entrega P1. Esta etapa grava documentos compatíveis com o modelo
atual e conserva pedido/fonte quando o SDK não aceita o documento.

Faltam demais recursos, representação grande, perfis/mídia, reautorização/ativação,
host/UI/roundtrip e validate integral P1. Rascunho diferente segue como futura
versão separada e texto salvo permanece manuscrito. Nenhum deploy/CI/push.
