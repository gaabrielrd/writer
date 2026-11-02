# ADR 0259 — Índice próprio cifrado e revisão semântica retomável

- Data: 2026-10-29.
- Estado: aceita para o núcleo interno pré-ativação.
- Plano: [229](../tasks/writer-v2/execucao/229-revisao-propria-com-indice-persistido.md).
- Continua [ADR 0258](0258-campaign-resumable-file-integrity.md).

## Decisão e fronteira

campaignBackupOwnChecks concentra metadata, envelope, contadores e vínculos que
o revisor temporário e o retomável compartilham. A prova própria mantém digest/
contagens/semântica anteriores, incluindo universo organizacional unproven da
procedência 1. A revisão persistente exige primeiro integridade concluída e
revalida sua chave emissora. Não consulta origem, concede derivado ou ativa mesa.

campaignRestoreOwnReview indexa em até 25 frames por chamada. Somente após selo/
EOF idênticos à prova integral entra em checking e confere até 25 linhas por
chamada, com lookup dos vínculos próprios. Pausa/reinício conserva fases, cursor,
estado SHA e contador em ownReview cifrado no job, schema 1/codec hash-wasm 4.12.0.
CAS, encarnação, C4 e recibos continuam valendo; resultado tardio após mudança
não pode criar linhas nem avançar. Replay confirma operação original e estado atual.

## DTO grande sem acumular o arquivo

O contrato próprio admite JSON de até 4 MiB; não reduzir a 64 KiB por conveniência
do checkpoint. Durante indexação, o estado conserva apenas descriptor, contador
de partes e cursor do início do DTO. Ao terminar um DTO próprio disponível,
relê somente esse registro em até 64 partes e 4 MiB, valida seu hash e entrega
ao parser existente. Corpo é descartado após projetar metadata.

Portanto a indexação tem 25 frames de avanço mais essa leitura adicional
limitada de DTOs concluídos na chamada; não é teto de 25 leituras. Partes não são
guardadas em ownReview e o checkpoint cifrado continua até 64 KiB. Derivados são
percorridos sem reunir seus corpos. Não há releitura completa a cada chamada.

## Índice persistente e autenticação

Nova família: users/UID/campaignRestores/RID/reviewRows/ORDINAL, com ordinal
contíguo de 15 dígitos. Schema 1 e kind own; identidade lógica family/id vira
identityHash. Não há nome/prosa/descriptor de origem no caminho. Payload cifrado
contém apenas metadata própria projetada, nunca o texto. AAD vincula domínio,
UID/RID/jobToken nativo, tipo e ordinal. Não criar método que aceite linhas de
cliente; somente o produtor da revisão gera linhas.

Linha imutável nasce no mesmo commit do recibo/testemunha; metadataHash desse
ordinal consta no efeito mínimo do recibo. Leitura confere native birth,
imutabilidade, job/contadores, recibo e cipherHash antes de decifrar. Recriação,
transplante e corrupção não ganham validade por repetir valores. A página toda
é autenticada antes do primeiro lookup dependente.

Lookup usa identityHash com igualdade e limite 2, recusa zero/duplicata, autentica
a linha e confere a identidade decifrada. Usa índice automático de campo único,
sem índice composto novo. Progresso mostra apenas fase/contagens; recibos guardam
hashes de metadata, sem ciphertext/prosa/relações. Rules recursivas existentes
continuam server-only, inclusive dono e consultas da nova subcoleção.

## Inventário e cancelamento antes do produtor

reviewIndex opcional do job, schema 1, guarda rows/cleanedRows. Job e linhas são
criados atomicamente com contadores. Ausência é compatível com jobs antigos:
não reinterpretar recursos estranhos como próprios. FileReview conserva sua
encarnação/checkpoint original; checkpoint de etapa pode ser menor que o global.

Antes de ligar produtor, a coleta passou a consultar reviewRows por nome e masks
limitadas, incluindo documentos estranhos sem identityHash. Cancel limpa
ownReview/fileReview e remove chave atomicamente; preserva contadores mínimos.
Cleanup coleta até 25 ordinais contíguos, comprovando recibo/birth por metadata,
sem chave ou payload. Só depois de confirmar ausência do índice coleta chunks.
Órfão, buraco, estrangeiro, recriação ou falha mantém o passo sem avanço.

Temporário permanece pré-ativação, com coleta própria; nenhum layout C4 1–4 muda.
Nova família exige integrar o inventário C4 adequado antes de campanha ativa.
Futuros índices derivados/origens exigem seus próprios contratos de coleta/
reserva antes do produtor e não podem reinterpretar linhas kind own.

## Consequências e gates

Revisão própria é retomável e comparável ao revisor completo sobre arquivo real.
Prova interna campaign-own-semantics-only revalida assinatura atual, sem grant.
Semântica derivada/origens persistidas, remapeamento, materialização/mídia,
C4 dos jobs antes de ativação, interface e ciclos continuam obrigatórios.
