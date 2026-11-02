# Writer V2 — Revisão própria persistida de campanhas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base c56c720.
- Escopo: [plano 229](../tasks/writer-v2/execucao/229-revisao-propria-com-indice-persistido.md).
- Decisão: [ADR 0259](../decisions/0259-campaign-persistent-own-semantic-review.md).
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK.

## Implementado

Após integridade, revisão própria indexa frames e confere vínculos em páginas
retomáveis. Pausa/reinício conserva cursor, contadores e SHA cifrados, sem reler
o arquivo inteiro em cada chamada. Regras de metadata/envelope/vínculos foram
compartilhadas com o revisor completo. A prova própria é equivalente para todas
as famílias, inclusive referência e vínculo da sessão, omissões e legado v1.

DTO JSON de até 4 MiB continua suportado: ao concluir um registro, relê somente
aquele corpo limitado, valida SHA e projeta metadata. O checkpoint não acumula
partes. Índice novo guarda apenas metadata cifrada com ordinal, identityHash,
prova nativa do recibo/testemunha e metadataHash. Páginas inteiras são
autenticadas antes de dependências; lookup limitado recusa duplicatas.

Cancel limpa estados/chave; coleta comprova ordinais por metadata antes de
chunks. Preserva estranhos/órfãos e não avança na falha. Recibos mínimos não
guardam ciphertext nem prosa. SDK, inclusive dono, não lê índice nem consulta
subcoleção. Não há endpoint público, grant de origem/derivado ou campanha ativa.

## Validação observada

271/271 testes dirigidos passaram, zero falhas/skips/cancelamentos, em
29.570,1769 ms (m152-directed-final.log). São 21 novos e 250 regressões de
upload, integridade, semântica própria/derivada e revisão de origens.

Novos casos cobrem arquivo rico real assinado e prova equivalente ao revisor
completo; todas as famílias/vínculos próprios, retomada por frame e reinício,
DTO expandido acima de 2 MiB, mais de 25 linhas/paginação, legado assinado v1,
sessão ausente em arquivo re-assinado, recriação/corrupção/duplicatas, CAS,
rollback de produção/cancelamento/coleta, cancelamento durante leitura,
coleta sem payload, revogação emissora, fronteira de integridade e isolamento.

SDK/Rules: 5/5 casos distintos positivos em 59.749,7475 ms (m152-sdk.log).
Uma jornada existente foi ampliada: campanha nativa com sessão/pista/vínculo,
emissão assinada, upload, integridade e semântica própria retomados entre
serviços, lookup real por hash, CAS concorrente, bloqueio SDK e coleta do índice
antes dos chunks. As outras quatro regressões passaram; não são cinco casos
novos. Emulador demo/JAR verificado em porta efêmera, encerrado pelo runner.

ESLint dirigido aos dez mjs positivo. Sintaxe de 462 módulos Functions positiva
(m152-syntax.log). Arquitetura/documentação/formato/diff e scan dirigido de
segredos conferidos. Nenhuma nova dependência, Rules ou entrada pública.

As primeiras execuções falharam por fixtures: o inventário isolado não preparava
lore para exportação completa; depois faltava ligar seu Storage de teste; um
cenário usava operationId abaixo do mínimo. Foram corrigidos para usar arquivo
rico válido e IDs completos. Não se alteraram limites ou guards de produção
para fazer passar. Resultados finais acima são posteriores às correções.

## Continuação e limites

Ainda faltam semântica derivada e autorização atual de origens persistidas,
remapeamento/materialização/mídia, C4 dos jobs/índice antes da ativação e
Estúdio/ciclos. Prova própria revalida a chave emissora e continua
campaign-own-semantics-only. Macro 8/35 e P3/D/F2-09 abertos.

Somente checks dirigidos, conforme operador; validate integral no fechamento
do bloco persistente. Os 9.710 testes de bf6bb14 são baseline histórico 219–226,
sem atribuição ao código novo. Nenhuma validação visual/build foi repetida:
interface e entradas públicas não mudaram. Somente commit local; servidor
manual/master preservados. Sem agentes/CI/push/PR/merge/deploy.
