# ADR 0262 — Revisão de origens persistida com reinício explícito

- Data: 2026-10-29.
- Estado: aceita internamente, antes de materialização/ativação.
- Plano: [232](../tasks/writer-v2/execucao/232-revisao-de-origens-retomavel.md).
- Continua [ADR 0261](0261-campaign-resumable-derived-semantics.md).

## Problema e decisão

A revisão de autorização corrente precisa sobreviver a chamadas limitadas e
recarga do processo sem aceitar decisões de clocks ou encarnações diferentes.
Compartilhar preparo, aplicação e fechamento em campaignBackupOriginChecks,
mantendo leitores de metadata/nascimento e protocolo de hash anteriores.
O revisor completo e campaignRestoreOriginReview executam captura e rechecagem;
somente resumos idênticos concluem a revisão.

Reutilizar w:base/w:item/w:anchor de derivedRows na ordem global já autenticada.
Reconstruir project, quando provenanceVersion 2, do estado own concluído,
preservando a referência original completa. Não criar coleção de testemunhas
ou decisões duplicadas. A testemunha project é o primeiro evento de cada passe;
o legado v1 conserva universo organizacional unproven.

## Estado, limites e autorização

originReview opcional guarda estado AES-GCM até 64 KiB no próprio job:
fase, cursores, pass metadata, clock, resumo capturado e SHA incremental.
AAD vincula UID/RID/jobToken/checkpoint; scope vincula arquivo, índice e project.
Codec permanece hash-wasm 4.12.0. O teto limita apenas metadata, nunca texto
originário. Progresso/recibos não contêm clock, estado SHA, ciphertext ou prosa.

Uma chamada processa até 25 eventos: project ou linhas do índice, incluindo
linhas ignoradas que não são testemunhas. Autenticar a página inteira antes da
primeira consulta de origem. Cada testemunha usa transação com job/CAS atual,
clock esperado e máscaras de metadata; não ler texto nem a campanha original.
Omissões exportadas não revivem quando a fonte volta a existir.

Mudança de clock, nascimento ou decisões entre passes impede a conclusão.
A gravação do checkpoint reconfere clock na mesma transação do CAS/jobHash.
A prova concluída reconfere clock, chave emissora e encarnação; é somente
campaign-origin-review-only, não autorização por recurso. Antes de qualquer
materialização, reautorizar cada recurso na própria transação de escrita.
Mesmo uma prova recente ou assinatura válida não substitui esse guard.

## Reinício, recibos e cancelamento

Restart explícito limpa somente originReview com CAS e recibo. Não exigir o
clock antigo: seu propósito é iniciar nova revisão após mudança de acesso.
Preservar upload, integridade, own e derivados; a revisão seguinte usa as fontes
atuais, sem reabrir conteúdo revogado. Não aceitar clock/cursor do cliente.

Consulta de operação anterior precede guards de nova mutação. Recibos originais
continuam recuperáveis após reinício e cancelamento. Concorrência publica
somente um checkpoint; rollback não avança o estado.

Antes do produtor, cancelamento foi atualizado para limpar originReview junto
dos demais estados e revogar a chave atomicamente. Não há nova coleção física
nem novo coletor. Ausência do campo mantém jobs antigos. Layouts C4 1–4 e Rules
permanecem; integração dos temporários ao C4 adequado antecede ativação.

## Validação e continuação

Referência anterior congelada em QA compara provas/digests com o revisor
compartilhado e o persistido. Testes dirigidos cobrem origens reais, omissões,
mudanças/recriações, retomada, CAS, rollback, cancelamento e reinício.
A execução SDK e a validação integral do bloco 227–232 são registradas com
seus resultados reais na evidência do incremento.

Materialização/remapeamento/mídia, C4 dos temporários, ativação e Estúdio/ciclos
continuam necessários. Macro 8/35 e P3/D/F2-09 continuam abertos.
