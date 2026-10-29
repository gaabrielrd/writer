# P3 — Integridade de campanha com checkpoint persistido

- Data: 2026-10-29.
- Base: d37d159; upload privado do plano 227 implementado.
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK, sem ativação.

## Objetivo e requisitos

Permitir parar e retomar a conferência de integridade/assinatura sem reler o
prefixo já validado ou acumular o arquivo inteiro. Reutilizar a gramática real
do revisor atual, incluindo conteúdo 1/2/3, testemunhas, raízes e selo/EOF.

O servidor aceita apenas identidade do job, operação, CAS e limite de 1–25 frames.
Cursor, hashes parciais, cabeçalho e atestado nunca são fornecidos pelo cliente.
Checkpoint cifrado fica dentro do job existente; não criar índice sem coletor.
Cancelamento remove esse checkpoint e revoga a chave atomicamente antes da
coleta de chunks. Jobs antigos sem checkpoint continuam válidos.

## Suposições e limites

Upload bytes-verified é imutável por encarnação; leituras continuam revalidando
job/chave/chunk/recibo e C4. O checkpoint é host-trusted, autenticado pela cifra,
AAD e cadeia job/recibo nativa. O codec fixa hash-wasm 4.12.0.
Integridade de arquivo é somente a primeira etapa: semântica própria/derivada,
autorização atual das origens, materialização, mídia, C4 da campanha ativa e
interface continuam necessárias. Não expor callables nem criar grant de ativação.

## Solução e arquivos

Extrair campaignBackupFileScanner como motor de um frame compartilhado por
validateCampaignBackupFile e pelo coordenador persistente. O modo com callbacks
mantém o contrato atual e não permite exportar estado; modo de checkpoint não
retém payload. Serializar somente estado limitado e hashes SHA incrementais.
campaignRestoreFileReview persiste o estado cifrado em fileReview do job e
conserva recibos/CAS. Atualizar contratos/Store/Transfer/Cleanup, sem novos paths
ou Rules. Testar scanners, serviço real e SDK Firestore existentes.

## Sequência e aceite

1. Extrair motor comum e provar equivalência dos revisores atuais.
2. Acrescentar codec de checkpoint, limite e retomada no meio de um conteúdo.
3. Preparar remoção no cancelamento e validação fechada antes do produtor.
4. Coordenar frames limitados, recibos/replay, CAS e comprovação interna.
5. Provar arquivo assinado real, reinício, falta de selo, assinatura/conta/chave,
   corrupção/recriação, concorrência/cancelamento e rollback. Provar no SDK.
6. Checks dirigidos, revisão, ADR/documentação/evidência e commit local.

Critérios: por chamada no máximo o limite de frames; nenhum prefixo relido ao
retomar; sem payload no checkpoint claro/progresso/recibo; nenhuma campanha
ativa; falha não avança; replay preserva história; cancel elimina estado
cifrado; assinatura é revalidada ao consumir prova completa.

## Riscos e gates

SHA nativo não permite exportar estado: usar codec fixado já instalado, sem nova
dependência. Callbacks provisórios não podem virar grants nem índices não
autenticados. Alterar a máquina comum exige regressões de semântica/origem e
arquivos assinados. Não serializar TextDecoder nem partes JSON; exportação
somente em modo retomável de integridade, sem callbacks. Nova etapa de índices semânticos terá
inventário/coleta próprios antes do produtor. Full validate no fechamento do
bloco persistente; 9.710 testes de bf6bb14 são baseline, não evidência deste código.
Sem agentes/CI/push/PR/merge/deploy; preservar servidor manual e master.

## Resultado local

Núcleo interno implementado, sem ativação/endpoint público. 36 novos e 284
regressões passaram: 320/320. SDK/Rules 5/5, dois novos e três regressões,
incluindo assinatura real, retomada entre serviços, CAS e cancelamento
concorrentes. ESLint dirigido e sintaxe de 459 módulos positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-integridade-retomavel-de-campanhas.md)
registra resultados, correções iniciais e limites.

Cancel lê o ciphertext do job para conferir recibos, mas não o decifra nem lê
payload de chunks; descarta estado/chave atomicamente. Próximo incremento:
índices semânticos duráveis/autenticados com coleta antes do produtor e avanço
limitado de revisão própria/derivada/origens. Materialização/ativação, C4 dos
jobs, UI e ciclos ainda obrigatórios; P3/D/F2-09 e macro 8/35 continuam abertos.
