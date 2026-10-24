# ADR 0117 — Reserva e chave privada da recuperação de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem journal/host habilitado ou implantação.
- Plano: [102 / M38c5d](../tasks/writer-v2/execucao/102-reserva-e-chave-da-recuperacao-do-lore.md).
- Antecedente: [ADR 0116](0116-authenticated-manual-lore-edit-transport.md).

## Decisão de produto

O operador aprovou preservar rascunho e pedido pendente em cópia cifrada
no dispositivo, recuperável pela mesma conta após revalidar a ficha original.
Isso não autoriza persistir a chave, rebasear o rascunho ou publicar conteúdo.

## Contrato servidor

Reserva permanente em users/uid/bookLoreWriteRecoveries/writeId fixa intenção
fechada bookId/loreId/sourceToken/intentHash, UID e hash do pedido. A primeira
reserva reautoriza o livro/ficha ativos com CAS C1. Não abre seus corpos:
observa metadata e fixa nascimentos nativos do livro e da ficha.

Raiz, prova imutável e chave aleatória de 32 bytes nascem no mesmo commit.
Fingerprint SHA da chave fica vinculado à prova. Token inclui nascimento da
reserva. Chave ausente, alterada ou recriada não é regenerada; documento
recriado não pode ser removido como se fosse a chave original.

Reserve/get são metadata e podem confirmar o evento após revogação ou exclusão.
Não devolvem chave, prosa, coordenadas físicas ou certificados como grant.
A mesma writeId não pode ser usada para outra intenção.

Get key exige token original, prova e chave nativas, além de autorização
vigente das mesmas encarnações do livro/ficha. Deleting, tombstone, marcador
deletedBooks, origem ausente/recriada ou mudança de dono impedem liberação.
Uma revisão posterior da mesma ficha autorizada permite recuperar o rascunho;
seu sourceToken original continua congelado e não autoriza nova aplicação.

Revogação explícita remove somente a chave original e cria prova terminal
permanente. Antes da reserva, cria fence permanente, mesmo sem acesso atual
à origem. Repetir reserva/revogação não reabre chave ou remove uma recriação.
Revogar a chave não cancela filhos de edição, confirma adoção ou apaga journal.

## Transporte e regras

Três callables metadata usam o wrapper regional com App Check; chave sai
somente por HTTP POST text/plain;charset=utf-8, com Auth/App Check explícitos,
até 8 KiB UTF-8, no-store em todos os resultados e erros sanitizados.
Hosting encaminha /api/book-lore/recovery-key ao handler antes da SPA.
A função da chave é onRequest, nunca callable. O namespace inteiro nega SDK.

Não há segredo/provedor novo, dependência, corpo de texto ou mutação de livro,
clock, privacidade/crédito. Controles/provas ficam permanentes. Chave ainda
existente fica inacessível após perder a origem, mas sua remoção física exige
revogação explícita; não se alega coleta dessa chave pela exclusão do livro.
Auditoria do ciclo de vida integrado continua necessária antes do rollout.

## Consequências e portões

Node e Firestore nativo provam reserva concorrente, nascimento conjunto,
isolamento, Rules, CAS, revogação e rollback. HTTP local usa verificadores
injetados só na composição de teste; não certifica login/attestation reais.

Journal cifrado, AAD e formato de partes, checkpoints/reconstrução do coordenador,
Web Locks/CAS/IDB, descoberta de pedidos incertos e host visual ainda precisam
de implementação. Antes de permitir edição/enviar bytes, o host deve obter a
chave e aguardar oncomplete da cópia cifrada; nunca guardá-la no dispositivo.
Encerrar recuperação exige reconciliar/cancelar a operação antes de oferecer
descarte, preservando metadata mesmo se a chave foi revogada.

Demais writers/consumidores/backup/ativação, rollout e certificação de
P1/F2-09/V2 permanecem abertos, assim como fases 3–5 e condições humanas/
comerciais. Exportar endpoints não autoriza deploy.
