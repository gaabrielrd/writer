# Writer V2 — efeitos retomáveis da restauração de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: a2f7a16.
- Plano: [195](../tasks/writer-v2/execucao/195-efeitos-retomaveis-da-restauracao-de-aventuras.md).
- Decisão: [ADR 0217](../decisions/0217-adventure-restore-durable-effects.md).

## Resultado

A camada cliente pode revisar e ativar explicitamente a aventura restaurada,
recuperar pedidos sem resposta e concluir mídia/coleta ou cancelamento por
unidades. O registro local guarda somente metadata fechada. Confirmar uma
operação histórica não recria um projeto excluído ou altera a edição atual.

Cancelamento e primeira coleta removem a chave no servidor; a confirmação
continua recuperável por metadata própria. Mídia usa checkpoint por ativo e
coleta usa checkpoint próprio, sem adaptar o schema de livros. Revisão alterada
aposenta a operação original somente após erro explícito; falha de transporte
mantém a pendência e não ativa automaticamente.

Cinco serviços novos: EffectContracts, FinalizationViews, EffectStore,
EffectCallables e EffectSession. Barrel e helper SDK existentes ajustados;
três arquivos de teste novos e uma regressão de transporte atualizada para a
allowlist intencionalmente ampliada. São 11 arquivos de código/testes.
A lista cliente corresponde aos 29 métodos públicos reais; chave/helpers não
integram essa lista. Sem dependência, backend, Rules, índice ou ambiente novo.

## Testes dirigidos

Rodada final: **136/136 em cinco arquivos**, **13,66 s** entre início do runner
e último arquivo no relatório JSON. São **84 casos novos e 52 regressões**:

- EffectContracts: 30; cinco fingerprints comparados com funções reais do servidor,
  inputs/codecs fechados, contas/IDs/stamp/checkpoints, revisão/mídia/coleta.
- EffectSession: 24; serviços reais com banco de teste e timestamps simulados,
  revisão explícita, perda de ACK, replay/retirada/resolução e concorrência.
- EffectCallables: 30; dez endpoints, região/prazo, captura de input, guard/conta,
  extras e seleção por payload recusados antes do SDK, sem retry automático.
- PreparationCallables: 35; regressão do helper comum.
- TransferCallables: 17; regressão do helper comum.

Perda de ativação confirma uma única operação após excluir a raiz, sem recriá-la.
Retirada perdida usa o mesmo pedido; unresolved no mesmo checkpoint conserva
dívida; avanço concorrente permite superseded. Cancel/cleanup retomam sem chave.
Mídia/coleta conservam job congelado e edição posterior do título. Recibos
malformados, contexto estrangeiro, falha de persistência/guard e CAS concorrente
não apagam o pedido original.

Rodadas anteriores dirigidas também passaram: sessão inicial 17/17 e seleção
intermediária 129/129, seguida de 134/134. Não somar essas rodadas aos 136 casos
da seleção final. Durante a revisão, o leitor foi alinhado aos campos públicos
reais: auditSealOperationId é privado e draftOutcome aceita none/version.
Não houve falha de teste contornada ou redução de cobertura.

## Chromium e IndexedDB nativo

**13/13 verificações**, **924 ms** na rodada final, Chromium **153.0.8010.12**.
Contexto isolado e IndexedDB/CAS reais; serviços reais de aventura com cena/PNG
de teste usam banco/Storage simulados, com ponte HTTP local de mesma origem e
ator sintético. Web Locks/WebCrypto estão disponíveis como pré-requisitos;
o registro de efeitos é metadata e não usa a chave de cifra de preparação.

O cenário confirma:

1. Pausa para revisão sem ativação automática.
2. Quota injetada no put nativo bloqueia envio da ativação.
3. Resposta perdida conserva somente metadata fechada.
4. Recarga confirma ativação pelo resolver, sem segunda mutação.
5. Resposta perdida de mídia mantém a unidade.
6. CAS nativo conserva registro substituído por outra sessão após replay.
7. Nova recarga confirma a mesma unidade de mídia.
8. Unidade vazia conclui mídia antes da coleta.
9. Primeira coleta remove chave; pendência continua isolada por conta.
10. Recarga conclui coleta sem recuperar chave privada.
11. Job congelado e edição posterior da raiz permanecem iguais.
12. Cancelamento remove chave antes da resposta perdida.
13. Nova sessão conclui cancelamento/cleanup sem chave.

Browser/contexto/HTTP de teste encerrados. Nenhum dado/sessão do usuário foi
usado. Não prova Firebase SDK/Auth/App Check reais, Firestore/Storage remoto,
disco cheio real, UI nova ou implantação. O SDK é exercitado com mocks nos
testes dirigidos; a ponte usa serviços reais, sem escolher helper privado.

## Checks e revisão

ESLint da feature e arquitetura passaram. Build final passou com typecheck,
**3028 módulos em 2,37 s** e smoke verde. Avisos existentes de tamanho de chunks/
imports dinâmicos não impediram o build. Serviços novos ainda não têm consumidor
de UI e são removidos do bundle; Chromium os importa diretamente pelo Vite.

Revisão conferiu persistência antes de RPC, domínio/fingerprint próprios,
checkpoint de cada sidecar, ação/ID/consentimento no recibo, reconciliação
monotônica, captura antes de await, CAS e preservação de falhas/conta.
Documentação/formato/diff recebem conferência final antes do commit com hooks.

**npm run validate integral não executado neste incremento**, conforme processo
vigente: testes dirigidos durante ajustes e suíte completa no fechamento do
próximo grande bloco. O validate verde de 189–194 é base anterior, não prova do
código novo. Cobertura/limites não foram alterados; nenhuma CI remota executada.

## Continuidade

A interface de inspeção/revisão e roundtrip completo no Estúdio continua
pendente. P2/P3/D/F2-09, fases seguintes, macro 8/35 e gates humanos/comerciais
permanecem abertos. Sem subagentes, CI, push/PR, merge ou deploy.

## Auditoria final

18 arquivos no escopo, sendo 11 de código/testes. Hashes dos 11 conferidos após
os checks; sem alteração de código durante o fechamento documental.
Nenhum marcador de segredo identificado, arquivo .env, artefato maior que
5 MiB ou CR nos arquivos da entrega. Documentação e diff passaram.
Checkout E preservado limpo em 522ccaa; /studio respondeu HTTP 200.
Commit local usa hooks normais; nenhum teste/processo da validação ficou ativo.
