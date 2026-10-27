# ADR 0198 — Versão recuperada do rascunho de aventura

Data: 2026-10-27. Status: aceita para incremento interno.
Base: [ADR 0197](0197-adventure-streamed-history-draft-staging.md) e
[plano 176](../tasks/writer-v2/execucao/176-finalizacao-do-rascunho-de-aventuras.md).

## Decisão

finalizeAdventureRestoreDraft transforma o texto preparado de 175 em versão
nativa de workHistory, sem alterar o manuscrito. Ausência é resultado none;
rascunho vazio, igual ou diferente do salvo recebe versão separada. A nova fase
draft-ready guarda resultado/wordCount nullable e conserva os contadores fonte
e itemIndex, compatíveis com recibos anteriores.

A versão usa motivo manual, rótulo Rascunho recuperado do backup, data savedAt,
recurso/ID remapeados e texto/hash/partes preservados. Não recebe o campo draft
de livros, incompatível com aventuras. O descriptor privado mantém procedência/
baseRevision e passa a finalized com wordCount; historyRevision aumenta em um.

## Prova e contagem

Reabrir root, descriptor, estado raw completo e unidade fonte autenticados.
Conferir ID determinístico, metadados exatos e raw token completo; confirmar
também cabeça/corpo nativos salvos contra a origem capturada. Para none, exigir
ausência de descriptor/journal inesperados.

Cada parte é lida com valor/hash, journal e identidade nativa. SHA e byteLength
são recalculados sobre todas as partes. countVisibleWords é aplicado uma vez ao
texto integral, preservando sua semântica atual de HTML/Markdown: uma palavra,
tag ou conteúdo removido pode atravessar partes. Não somar contagens isoladas.

Na transação final, reconferir fonte e todas as versões de journal/target lidas,
usando metadata nativa para as partes em vez de reabrir sua prosa. Só então criar
manifesto, finalizar descriptor, atualizar historyRevision e confirmar checkpoint/
recibo juntos. Mutação entre contagem e commit, falta/recriação, conflito ou
cancelamento não cria manifesto parcial. Replays conservam a mesma versão.

## Capacidade e continuação

A contagem usa memória proporcional ao draft, como o contador nativo existente;
não é um contador streaming novo. Não foi imposto limite arbitrário menor.
Limite real de strings ou RangeError de capacidade devolve resource-exhausted,
preservando fonte/estado para revisão, retomada ou cancelamento. Benchmark de
arquivos grandes continua gate operacional antes do lançamento.

A rechecagem cobre a transação de confirmação; não promete impedir mutações
administrativas externas depois dela. Cleanup reconhece a operação nova e mantém
as provas de criação/atualização; dado estrangeiro não é adotado ou removido.

Sem novo endpoint, grant, biblioteca ou ativação. Universo autorizado, personas
na biblioteca, imagens, agregados/audit, recuperação cifrada/UI e roundtrip seguem
obrigatórios. draft-ready encerra a finalização textual interna, não P2/P3/D/F2-09
nem os gates humanos/comerciais ou as fases seguintes.
