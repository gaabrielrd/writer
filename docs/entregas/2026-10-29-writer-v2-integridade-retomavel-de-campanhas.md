# Writer V2 — Integridade retomável de campanhas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base d37d159.
- Escopo: [plano 228](../tasks/writer-v2/execucao/228-integridade-de-campanhas-com-checkpoint.md).
- Decisão: [ADR 0258](../decisions/0258-campaign-resumable-file-integrity.md).
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK.

## Implementado e limites

Verificação do arquivo enviado agora avança em 1–25 frames, conserva checkpoint
cifrado e retoma após novo serviço sem reler prefixo. Pode parar no meio de um
conteúdo longo sem guardar suas partes em memória. Máquina compartilhada mantém
a revisão completa anterior, conteúdos 1/2/3, testemunhas, raízes e selo/EOF.

Revisão persistida mantém CAS, encarnação, recibo original e progresso atual.
Concorrência/cancelamento impede publicação de resultado tardio. Progresso e
recibos não expõem estado, assinatura ou prosa. Cancel elimina checkpoint e
chave atomicamente; lê ciphertext do job para conferir a cadeia de recibos,
sem decifrar o estado nem ler payload de chunks. Coleta continua limitada aos
chunks do temporário pré-ativação; não há nova família física ou mudança C4.

Prova interna revalida a chave emissora atual, inclusive após revogação, e vale
apenas campaign-file-integrity-only. Não ativa campanha, não autoriza origens
nem declara semântica concluída. Callables/cliente/UI permanecem pendentes.

## Evidência observada

320/320 testes dirigidos passaram, zero falhas/skips/cancelamentos, em
18.611,9273 ms (m151-directed-final.log). São 36 novos e 284 regressões
(49 upload e 235 dos revisores de arquivo/semântica/origem/UTF-8/relações).

Casos novos provam retomada por frame e no meio de texto, sem releitura de
prefixo, limites de estado/frames, versões assinadas 1/2/3, modo sem callbacks,
codec/conta/tamanho/cursor/hash inválidos, ciclo do leitor, recriação nativa,
CAS/operação/conta, concorrência, rollback, cancelamento durante leitura,
revogação, selo corrompido, truncagem e ciphertext transplantado entre passos.
A comparação usa revisão completa real assinada; não apenas um mock de aceite.

SDK/Rules: 5/5 casos distintos, dois novos e três regressões, em 30.123,1624 ms
(m151-sdk.log). Campanha nativa independente foi assinada, enviada e conferida
em passos cifrados entre serviços; chave revogada recusou prova. Dois revisores
concorrentes confirmaram somente um CAS; cancelamento durante read impediu
checkpoint tardio. SDK do dono continua sem leitura. Emulador demo/JAR
verificado em porta efêmera, encerrado pelo próprio runner.

ESLint dirigido aos nove mjs positivo. Sintaxe positiva de 459 módulos
Functions (m151-syntax.log). Arquitetura, links, formato e diff conferidos.
Sem nova dependência, endpoint público, Rules ou interface.

Primeiro ciclo teve uma asserção de recriação com timestamps impossíveis
(create posterior a update); o fixture foi corrigido para uma recriação nativa
coerente. O primeiro lint apontou variável não usada, removida. Resultado final
acima é posterior às correções; nenhum limite de teste foi alterado.

## Pendências e próximos passos

Índices semânticos persistidos/autenticados e sua coleta, revisão própria/
derivada, autorização atual de origens, remapeamento/materialização, mídia,
C4 dos jobs antes de ativação e Estúdio/ciclos continuam necessários. Nenhum
checkpoint provisório é grant nem índice público. Macro 8/35 e P3/D/F2-09 abertos.

Conforme orientação do operador, somente testes dirigidos neste incremento;
validate integral fica para o fechamento do bloco persistente. Os 9.710 testes
de bf6bb14 são baseline histórico 219–226, não comprovação do código novo.
Build/interface/navegador não repetidos: nenhuma UI ou entrada pública mudou.
Sem agentes/CI/push/PR/merge/deploy. Somente commit local; master e servidor
manual preservados.
