# ADR 0210 — Coleta da fonte após ativação da aventura

- Data: 2026-10-28.
- Estado: implementado internamente e validado localmente; sem endpoint/UI.
- Plano: [188](../tasks/writer-v2/execucao/188-coleta-da-fonte-da-aventura-restaurada.md).
- Antecedentes: [0208](0208-adventure-atomic-restore-activation.md) e
  [0209](0209-adventure-restored-media-units.md).

## Decisão

A coleta exige activated e a conclusão provada da mídia, inclusive a última
consulta vazia. Mantém o job congelado e fixa token/operação dessa conclusão
no sidecar archiveCleanup/current, com checkpoint próprio, fases, cursor e
contagens. adventureRestoreArchiveOperations conserva recibos imutáveis da conta.

getAdventureRestoreArchiveCleanup e advanceAdventureRestoreArchiveCleanup são
internos. Exclusão de uma página, progresso e recibo confirmam juntos. Replay
confirma a operação antes de consultar registros já apagados. Status e histórico
de ativação/mídia/coleta sobrevivem à remoção da fonte.

## Escopo da exclusão

Por páginas de até oito journals, comprovar instalação e apagar o journal.
Somente alvos scope job em preparedRoot são apagados; seus metadados e provas
nativas precisam continuar próprios. Não ler nem comparar os alvos atuais de
adventure/persona/image com o snapshot da preparação: edições, detach, retirada
e exclusão do projeto são legítimos. Exigir artifactCount e preparedRoot vazio.

Remover chunks e proofs em pares: IDs/índices/tamanhos/hash/chain/token coerentes,
recibos criadores e efeitos próprios, createTime/updateTime imutáveis. Remover
estados SHA, índice/itens e estado de validação com provas específicas e contagens
congeladas. Consultas selecionam metadata; não reidratam Base64, hashState,
valueJSON, pointerJSON ou stateJSON para descartar dados. O port deve oferecer
getAll com máscaras; sem isso, get/advance recusam antes de qualquer leitura.
A presença da chave usa máscara não vazia apenas de restoreId.

A prova de metadata autoriza somente exclusão do registro nativo já criado pelo
servidor. Não valida nem autoriza consumir um payload omitido. Índice tem chave
canônica; estado mutável exige nascimento do primeiro recibo, atualização do
último, checkpoint e hash do ponteiro fixados no job.

Verificar vazio nos oito namespaces privados conhecidos ao final; registros
inesperados ou reaparecidos bloqueiam a conclusão. Uma chave de recuperação
pendente também bloqueia, sem ler ou apagar seu material. Não prometer coleta
de coleções arbitrárias criadas por Admin.

## O que permanece

Projeto e todas as suas alterações/corpos/histórico/lore/índices/progresso,
biblioteca/usos, personas/lote, job/reserva/recibos originais e controles/outcomes/
recibos de mídia permanecem. Não usar cleanup pré-ativação, recursiveDelete
ou chamadas Storage. Não conceder acesso à raiz atual a partir do histórico.

## Validação e limites

Testes de propriedade/provas, rollback/CAS/replay/resposta perdida, mídia
incompleta, edições/exclusão/recriação do projeto, fonte histórica grande e
corpuses nativos. Resultados executados e fechamento integral na
[evidência](../entregas/2026-10-28-writer-v2-coleta-da-fonte-da-aventura-restaurada.md).

Sem dependências, índices, endpoints ou Rules novos. Recuperação/transportes/UI/
roundtrip, P2/P3/D/F2-09, fases 3–5 e gates humanos/comerciais permanecem abertos.
Macro 8/35 inalterada; este incremento fecha o grande bloco local 186–188.
