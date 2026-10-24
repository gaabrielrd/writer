# ADR 0119 — Checkpoints restauráveis da edição manual de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem persistência automática ou host habilitado.
- Plano: [104 / M38c5f](../tasks/writer-v2/execucao/104-checkpoints-restauraveis-da-edicao-de-lore.md).
- Antecedentes: [ADR 0115](0115-unit-coordination-of-book-lore-edits.md) e
  [ADR 0118](0118-partitioned-local-lore-edit-journal.md).

## Problema e decisão

O snapshot de status omite cursores e corpos de pedidos e não pode reconstruir
a operação após recarga. Acrescentar checkpoint explícito e distinto, com
restore validado, sem RPC implícita e sem mudar o CAS/intenção do rascunho.

Checkpoint contém wire exato, inclusive base64 de append pendente. É privado,
não é DTO de status, metadata pública ou autorização. Deve ser cifrado pela
futura composição de persistência; este incremento não o grava em storage.

## Estado e páginas

Root versionado/fechado e imutável contém identidade/intentHash/sourceToken,
fase/cancelamento, contagem de chamadas, bloqueio, inicialização, cursores de
reserva/produção/cleanup, progresso da inspeção/edição e wires dos slots
produção/cleanup/failedCancel. Não contém todos os corpos/relações ou array de
todos os controles. Snapshot mantém formato sem bytes privados.

Controles dos uploads são obtidos por páginas até 50, com offset, tamanho,
nextOffset, intenção, IDs e hashes conferidos. Digest encadeado fixa a sequência
completa de controles/progressos ao root e recusa páginas antigas da mesma
intenção. Calcular/verificar digest percorre metadata uma vez, hash por item,
sem JSON gigante de todos os controles; cada checkpoint faz essa passagem.
Capturar root e páginas durante mudanças pode resultar em recusa de restore;
a persistência futura precisa coordenar esse estado, não presumir atomicidade.

## Reconstrução e invariantes

Reconstruir plano, IDs, codecs e manifests a partir do input original já
reautorizado pelo host. Conferir UID/writeId/livro/ficha/CAS/intentHash,
progresso de cada job com parsers existentes, cursores, fases e digest.
Não transformar snapshot legado em checkpoint, adotar revisão atual ou
tratar estado local como recibo servidor.

Pedidos passam pela mesma validação fechada/whitelist manual do journal.
Conferir IDs/startHashes/operação/CAS/tokens contra jobs determinísticos.
Append é regenerado pelo codec para comparar bytes, índice e prova; não
aceitar outro conteúdo com os mesmos controles. Iteradores locais reabrem no
índice necessário; não persistir geradores ou closures.

Reconstruir ações locais de confirmação da inicialização, avanço das reservas
e reconciliação failedCancel/get. Preservar produção pendente durante cleanup,
inclusive CAS antigo, sem repetir produção para cancelar. Cancelamento
confirmado pode ser reconstruído com signal abortado, mantendo todos os
guards de conta/contexto; produção abortada continua bloqueada.

Estados ready e apply são distintos. Restaurar ready não adota; pending apply
recupera a confirmação explícita anteriormente iniciada. Se adoção venceu o
cancelamento, get confirma sucesso próprio antes de limpar filhos. Se não
venceu, get mantém o cancelamento original para repetir exatamente.
Applied/cancelled mantêm terminais e liberam codecs de texto.

## API e sessão

Operação oferece checkpoint() e controlsPage(); restoreBookLoreEditOperation
recebe input, root/provider, port e options. Nenhum port é chamado ao restaurar.
bookLoreEditSession.restore força UID capturado e os mesmos guards regionais.
Mudança de conta/contexto/host durante await recusa o resultado.

O provider não concede autorização. Antes de passar texto ou checkpoint à API,
o host deve obter a chave da origem reautorizada. Sem chave, futura operação de
cleanup deve usar controles metadata completos, sem recuperar os corpos.

## Evidência e pendências

Serviços reais sobre double transacional verificam reconstrução entre unidades,
respostas perdidas, múltiplos uploads/partes/páginas/remoções, concorrência e
reconciliação. Chromium real recarrega com draft no journal cifrado; checkpoint
e páginas são transportados pelo harness em memória externa, não persistidos
pelo produto. Não inferir persistência automática do coordenador por esse smoke.

Próxima composição: journal de checkpoints cifrados, confirmação atômica de
root/páginas, controles metadata de todos os jobs para cleanup sem chave e
ligação com reserva/host. Fechamento nativo antes de coleta e ciclo de vida
da chave na exclusão do livro continuam pendentes. Demais writers/consumidores/
backup/ativação/rollout e P1/F2-09/V2, fases 3–5 e condições humanas/comerciais
seguem abertos. Validate no fim de P1; somente commits locais.
