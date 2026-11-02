# Writer V2 — Verificação derivada retomável por dependência

- Data: 2026-10-29.
- Branch: codex/writer-v2; base 14ae5ef.
- Escopo: [plano 231](../tasks/writer-v2/execucao/231-verificacao-derivada-por-dependencia.md).
- Decisão: [ADR 0261](../decisions/0261-campaign-resumable-derived-semantics.md).
- Estado: núcleo interno implementado e validado, sem origem/ativação/UI.

## Implementado

Verificador derivado agora retoma dentro de um mesmo item: campo, parte de
corpo e relação. Até 25 passos semânticos por chamada, sem repetir prefixo nem
guardar array de dependências. Hash canônico anterior é emitido em fragmentos.
Máquina de regras é compartilhada com o revisor completo.

Estado/cursores/SHA ficam cifrados no job com binding ao índice/arquivo/
encarnação; progresso e recibos mostram apenas metadata limitada. CAS e recibo
original conservados, inclusive após cancelamento. Cancel limpa estado/chave
atomicamente. Não há nova família física, Rules, endpoint ou dependência.

Prova interna revalida chave emissora/índice e conserva
campaign-derived-semantics-only. Autorização atual de origens continua separada.

## Validação observada

379/379 testes dirigidos positivos, zero falhas/skips/cancelamentos, em
50.867,4173 ms (m154-directed-final.log). São 15 novos e 364 regressões.
Cobrem verificador derivado, índice, own, upload/integridade, arquivo, revisores
semânticos/origens, UTF-8 e relações não resolvidas.

Novos testes incluem mil dependências de corpo, pausa na parte 350 sem releitura,
estado limitado e digest canônico; retomada por passo/serviço, teto por chamada,
arquivo re-assinado com corpo ausente e falha tardia sem avanço, unresolved v3,
legado v1, replay após cancelamento, rollback, CAS concorrente, cancelamento
durante lookup, revogação/C4/isolamento e corrupção cifrada sem reinício em zero.

Compatibilidade independente: cinco perfis assinados (base, texto longo/lore
local, variante, relação não resolvida e legado) produziram provas e digests
idênticos na referência anterior, revisor novo completo e fluxo persistido
(m154-compatibility-persistent.log). São cinco perfis, sem somar reexecuções.
A referência congelada e os scripts ficam apenas no QA local.

SDK/Rules: 1/1 jornada nova positiva em 39.427,7276 ms (m154-sdk.log).
Campanha independente nativa foi emitida/enviada/revisada; checkpoint concorrente
teve um vencedor, retomada em novo serviço preservou a prova, SDK do dono foi
bloqueado, chave revogada recusou prova e cancel retirou estado/chave com replay
histórico preservado. Emulador demo/JAR verificado em porta efêmera, encerrado
pelo próprio runner; sem dados de produção.

ESLint dirigido aos dez mjs positivo; sintaxe de 469 módulos Functions positiva
(m154-syntax.log). Arquitetura/documentação/formato/diff e scan de segredos
conferidos. Nenhum build/interface/navegador repetido: entradas públicas e UI
não mudaram.

Payloads de edição/documentação falharam antes de escrever: ajustamos o formato
da lista e tratamos conteúdo novo antes de tentar editá-lo. O primeiro comando
da referência QA tinha import absoluto sem functions/src, corrigido sem
alterar o algoritmo anterior.
Não houve falha de teste de produção nem redução de limites/guards.

## Próxima etapa e limites

Revisão persistida da autorização de origens ainda é necessária; depois
remapeamento/materialização/mídia, C4 dos temporários antes de ativação e
Estúdio/ciclos. Semântica concluída não concede origem nem ativa campanha.
Macro 8/35 e P3/D/F2-09 continuam abertos.

Conforme operador, somente checks dirigidos neste incremento. Validate integral
no fechamento do bloco persistente; os 9.710 testes de bf6bb14 são baseline
219–226, sem atribuição ao código novo. Servidor manual/master preservados.
Somente commit local; sem agentes/CI/push/PR/merge/deploy.
