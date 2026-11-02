# ADR 0209 — Finalização de mídia da aventura por ativo

- Data: 2026-10-28.
- Estado: implementado internamente; checks dirigidos, sem endpoint/UI.
- Plano: [187](../tasks/writer-v2/execucao/187-finalizacao-das-imagens-da-aventura-restaurada.md).
- Antecedentes: [0207](0207-adventure-image-library-preparation.md) e
  [0208](0208-adventure-atomic-restore-activation.md).

## Decisão

Depois de activated, manter o job congelado e processar uma imagem por chamada
em advanceAdventureRestoreMedia. Um sidecar activationMedia/current guarda
checkpoint próprio, cursor e contagens; activationMediaItems guarda outcomes
imutáveis e adventureRestoreMediaOperations os recibos da conta. A conclusão
exige uma consulta final vazia e processed igual ao total congelado.

getAdventureRestoreMediaState e advanceAdventureRestoreMedia permanecem internos.
O checkpoint de mídia começa em zero, distinto do checkpoint de ativação. Controles
e recibos fechados têm provas nativas de nascimento/atualização, fingerprint,
hash do resultado e vínculo à ativação original. Não há array de todos os ativos.

A unidade prova a intenção preparada e a instalação original da imagem pelo
journal/recibo de biblioteca. readAdventureStageJournal foi separado da leitura
do alvo; readAdventureStageArtifact preserva seus checks anteriores. O consumidor
pós-ativação confere explicitamente nascimento, origem v2, caminho, geração/hash
imutáveis e usos canônicos. Não compara a imagem inteira com seu valor inicial,
nem exige que o head autoral atual continue idêntico ao staging.

## I/O e efeitos

Aceitar a geração preparada fora da transação pelo adaptador compartilhado.
Validar proof/URL com o contrato existente; no ACK, repetir autorização,
checkpoint e provas. Imagem ativa/outcome/controle/recibo confirmam juntos.
Resposta perdida confirma recibo antes de novo I/O; PATCH aceito com ACK perdido
retoma idempotentemente. Concorrentes não duplicam a contagem nem a geração.

Não alterar texto, raiz, vínculos ou cabeças históricas. Um detach nativo preserva
a imagem na biblioteca pessoal, com zero usos. Editar ou excluir a aventura não
elimina essa cópia própria. Leitores normais resolvem imageId depois da liberação,
sem gravar URLs nos heads.

Imagem deleting/deleted com zero usos exige retirada física permanente antes
de registrar unavailable, inclusive quando o removedor original ainda aguarda
Storage. O marcador deve substituir a geração preparada. Uma retirada durante
aceitação invalida o ACK; retry confirma a indisponibilidade, nunca republica.

Imagem/uso ausente, recriado ou de origem divergente e geração estrangeira
falham sem sobrescrever ou apagar substitutos. Falha não vira conclusão.
Replay após rename, detach, retirada ou exclusão da aventura é histórico;
contagens ready/unavailable são resultados na época da confirmação, não
autorização nem disponibilidade atual.

## Validação e limites

Testes dirigidos cobrem vazio, múltiplos ativos, rollback de cada write, CAS/
replay, ACKs perdidos, instalação/controle/outcome/recibo recriados, detach,
retirada/aceitação concorrentes e consumo nativo. Resultados reais na
[evidência](../entregas/2026-10-28-writer-v2-finalizacao-das-imagens-restauradas-de-aventuras.md).

Sem dependência, índice ou alteração de Rules. Novos paths internos permanecem
negados por padrão. Coleta da fonte, recuperação/transportes/UI/roundtrip,
P2/P3/D/F2-09, fases 3–5 e condições humanas/comerciais continuam abertos.
Macro 8/35 inalterada. Validate integral no fim do próximo grande bloco.
