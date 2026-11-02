# ADR 0058 — Integridade retomável da entrada de restauração

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M14](../tasks/writer-v2/execucao/47-integridade-retomavel-da-restauracao.md).

## Decisão

Conferir SHA-256 completo e chain da transferência em transações de até 16
partes de 64 KiB (1 MiB), sem arquivo inteiro em RAM nem contexto dependente
da instância de Functions. uploaded avança para checking e então bytes-verified
ou rejected. Nenhum desses estados valida formato/DTO ou autoriza ativação.

Cada passo usa UID, identidade nativa da reserva, jobToken, fingerprint,
checkpoint e recibo existentes. O fingerprint inicial também é recalculado
contra source/reviewHash gravados: alteração do descriptor não adota outra fonte.
Reenvio confirma o recibo histórico e traz progresso atual separado.

## SHA persistido e dependência

Fixar hash-wasm 4.12.0 somente nas Functions. Sua API pública save/load permite
continuar o mesmo SHA entre invocações; Node crypto não oferece persistência
pública equivalente. A dependência não acrescenta transitivas. Fontes primárias:
[resumable hashing](https://github.com/Daninet/hash-wasm#resumable-hashing) e
[contrato de estado](https://github.com/Daninet/hash-wasm/blob/master/lib/WASMInterface.ts).

Snapshot pode conter bytes da entrada. Guardá-lo somente no filho privado
integrityState/current, com algoritmo/versão, UID/jobToken, checkpoint,
contadores/chain e hash de controle no job. Não retorná-lo em listas, recibos,
logs ou API cliente. Chave de recuperação do host continua sendo protocolo
independente; SHA state não é credencial nem relatório do cliente.

Ausência, troca de contexto, corrupção ou incompatibilidade falha sem reiniciar
o hash silenciosamente. Atualização da dependência exige teste de compatibilidade
ou recusa explícita da versão antiga. No fim, remover snapshot na mesma transação
que registra resultado e recibo. Digest/chain incompatíveis geram rejected com
razão segura; corrupção de uma parte bloqueia o passo sem avançar checkpoint.

## Provas e porta interna

Cada parte validada ganha integrityProofs/index com contexto, hash/tamanho e
token de createTime/updateTime nativos do chunk. Prova, estado SHA, progresso
e recibo são gravados atomicamente. Certificar ausência de partes após o último
índice declarado antes de encerrar a integridade.

openVerifiedBookRestoreSource é capacidade interna do servidor, sem export HTTP
ou callable de download. Cada read reautoriza job/reserva/marcador/raiz ausente,
exige bytes-verified e compara a prova com o snapshot atual da parte.
Mudança/ABA invalida leitura, mesmo com corpo idêntico.

O parser M2 pede metadata+payload juntos. Aceitar até 272 KiB por range, seu
teto existente, lendo no máximo seis partes e retornando somente o intervalo.
Não impor 64 KiB ao range composto: rejeitaria quadros válidos de payload cheio.
Transferência e avanço de integridade continuam com partes de 64 KiB.
Isso não é prova de snapshot semântico integral; o próximo protocolo deve
revalidar a origem da entrada ao preparar/ativar e ampliar seu próprio inventário.

## Cleanup e compatibilidade

Promover cleanupVersion 1 para 2 no primeiro passo de integridade, atomicamente
com os primeiros filhos. v1 continua limitado a chunks/chave; v2 acrescenta
integrityProofs e integrityState. Rejeitar mistura de campos v2 num job v1,
versões desconhecidas e contexto estranho.

Cancelamento aceita checking, bytes-verified e rejected, revoga a chave e inicia
fases chunks → proofs → state → done. Cada passo remove até 50 chunks/provas.
A fase final certifica EOF de ambas as coleções, valida contexto do snapshot e
ausência de chave antes de cancelled. Snapshot próprio corrompido continua
removível; documento de contexto alheio é preservado. Raiz inesperada bloqueia
toda mutação. Job/recibos/reserva/marcador permanecem; books não recebe writes.

Rules recursivas M13 já negam os novos filhos; SDK real comprova essa fronteira.
Não é necessário alterar escritores de livros neste marco: sua barreira permanece.
Antes de qualquer índice/DTO/mídia de preparação, ampliar o cleanup novamente.
Validação semântica, revisão protegida no host, remapeamento/mídia, vínculo atual
de universo, ativação, UI/roundtrip e validate integral continuam em P1.

[Evidência M14](../entregas/2026-10-22-writer-v2-integridade-dos-backups.md).
Somente commits locais; sem CI, envio remoto ou produção.
