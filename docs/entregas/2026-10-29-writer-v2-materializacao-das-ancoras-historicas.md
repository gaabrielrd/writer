# Writer V2 — Materialização das âncoras históricas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base f10605c.
- Plano: [236](../tasks/writer-v2/execucao/236-materializacao-das-ancoras-historicas.md).
- Decisão: [ADR 0266](../decisions/0266-campaign-historical-anchor-materialization.md).
- Estado: núcleo interno validado com checks dirigidos/SDK; sem ativação.

## Objetivo e funcionalidades

Preparar fichas legadas da campanha restaurada com a edição congelada de sua
origem. Bases históricas têm novas identidades e contêm ficha/corpos próprios,
snapshot, universo, capturedAt e testemunhas da âncora arquivada. Não recapturam
a aventura atual. Reutilizam a base ativa quando já contém a mesma âncora;
variantes omitidas não voltam por intermédio do arquivo.

Campos UTF-8 e legado preservam bytes/hash/texto, com chunkCount nativo correto.
Estados da mesa permanecem na geração de variantes preparada anteriormente.
Fonte histórica e slot são verificados antes dos bytes e na escrita. Decisão
persistida congela arquivo/edição/identidade/mapeamento, sem timestamps de
acesso; prova corrente estrita continua comparada antes/depois de I/O.

## Critérios e arquivos

- [x] Inventário anchorSlots antes dos filhos, com recibo e nascimento nativos.
- [x] Journal anchorWrites fechado ao slot, sem caminho recebido do cliente.
- [x] Ficha após campos, pai preparing após ficha; checkpoint cifrado até 8 KiB.
- [x] CAS/replay/rollback e retomada revalidada da mesma origem.
- [x] Prova corrente recusa revogar/devolver acesso durante a mesma leitura.
- [x] Coleta sem chave/grant/prosa, filhos antes dos pais e slots após vazio;
      filho estrangeiro preserva pai e impede coletar a base ativa.
- [x] Duas fichas em bases distintas, omissões e origem recriada exercitadas.
- [x] Leitor ordinário de lore legado exercitado após liberação só de fixture.
- [x] Jornada SDK/Rules final após correção de retomada.

Novos módulos campaignRestoreAnchorFormat/Origin/Writes/Materialization,
helper/teste Node e SDK. Contratos/store/cleanup/transfer integram estado/
inventário e ordem de coleta. Journal nativo recebe binding ao resolver root
e expõe conferência de vazio; wire de own/base/variant permanece.
AGENTS/arquitetura/ADR/plano/inventário/progresso registram limites.

## Testes e validações observados

319 casos Node distintos positivos em rodadas, sem somar reexecuções:
296 regressões e 23 novos. m159-directed.log: 317/317, zero falhas/skips/
cancelamentos, 235.271,1115 ms, antes da correção descoberta pelo SDK.
Após o ajuste, somente a família afetada foi repetida: m159-anchors-final.log,
22/22, zero falhas/skips/cancelamentos, 71.187,019 ms. O caso adicional de
revogar/devolver acesso durante os mesmos bytes passou isoladamente:
m159-strict-proof.log, 1/1, 2.878,9521 ms (runner 3.398,8964 ms).

Cobertura nova: edição histórica real por adoção, leitor legado/revogação,
reutilização ativa sem bytes, campos longos/vazios/legado, serviço recriado,
inventário antes de filhos, replay/CAS, cinco pontos de rollback, órfão no
destino, perda de acesso antes/durante I/O, duas bases, slot alterado, origem
recriada, cancel com I/O pendente e coleta sem grant com pai protegido.

SDK/Rules final: 1/1 positivo, zero falhas/skips/cancelamentos, em
287.620,5 ms; runner 288.970,6572 ms (m159-sdk.log). Aventura/cena/lore,
captura original, variante, comparação e adoção keep-local foram criadas
pelos serviços nativos. O arquivo assinado foi enviado/revisado e próprios/
base/variantes/âncora foram materializados. Slot nasceu antes dos filhos,
junto do recibo. Mudança de ownership durante bytes impediu escrita/checkpoint;
devolver acesso à mesma origem permitiu retry e conclusão. Base/journal têm
mesmo birth; texto original e testemunhas históricas foram conferidos.

Rules negam pai/corpos pendentes e slot. Cancel após revogação retirou chave,
preservou pai/slot com filho estrangeiro; remover somente o dado injetado
permitiu coletar corpos/item/pai/slot, mantendo campanha original e recibo
histórico. Emulador demo local, JAR verificado, porta efêmera e encerramento
dos próprios processos pelo runner.

Arquitetura, sintaxe final de 488 módulos Functions, ESLint dirigido aos
treze arquivos de código e aos três ajustados positivos. Formato/docs/diff
e scan dirigido de segredos/artefatos positivos.
Sem dependências novas e sem mudança de frontend. Typecheck/build/visual e
validate integral não foram repetidos; este último segue no fechamento do
bloco. O baseline 3c1cefa de 9.871 testes cobre 227–232, não este código.

## Correções e revisão

As primeiras fixtures respeitaram o retorno neutro do leitor após revogação,
passaram a usar IDs distintos para registro/leitura e prefixos que cabem nos
80 caracteres. A execução da fixture que aguardava leitura com operação
repetida foi interrompida pelo próprio handle; corrigida antes da rodada verde.
O caso de corrupção de corpo passou a alterar o próximo journal da auditoria,
sem atribuir rechecagem retroativa a uma auditoria incremental.

O SDK encontrou uma falha real: timestamp corrente da origem estava congelado
no slot, impedindo retry depois de revogar e devolver ownership à mesma origem.
A decisão persistida passou a vincular edição/identidade/mapeamento; acesso
corrente segue obrigatório e a prova nativa estrita ainda impede escrever
quando muda durante I/O. Uma nova regressão usa atualizações nativas, e outra
comprova revogação/devolução durante a leitura seguida de retry revalidado.
Não foram reduzidas quotas, checks de nascimento, permissões ou máscaras.

## Limitações e próximos passos

Bases/geração continuam preparing e campanha pending. Faltam mídia/binários/
pins, vínculo organizacional autorizado, C4 adequado para temporários,
auditoria física, ativação/aposentadoria dos journals e integração/ciclos no
Estúdio. Prova de âncoras é parcial, sem grant nem certificado de ativação.
Layouts C4 1–4 intactos; somente commit local, sem CI/push/PR/merge/deploy.

A distinção entre identidade estável e prova corrente deve ser conferida também
nos corpos parciais das variantes antes de fechar o bloco de materialização.

Macro 8/35 (22,9%), P3/D/F2-09 e condições humanas/comerciais seguem abertos.

## Verificação manual

Sem entrada nova no Estúdio. Exercitar o teste campaignRestoreAnchorMaterialization
de Functions e a família SDK/Rules homônima em demo local. Liberação de raízes/
controle no teste é exclusiva de fixture, sem caminho correspondente em produção.
