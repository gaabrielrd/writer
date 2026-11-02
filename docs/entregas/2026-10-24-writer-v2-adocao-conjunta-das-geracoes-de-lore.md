# Writer V2 — Adoção conjunta de gerações de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [95 / A2a](../tasks/writer-v2/execucao/95-adocao-conjunta-das-geracoes-de-lore.md).
- **Decisão**: [ADR 0110](../decisions/0110-atomic-book-lore-adoption-batches.md).

## Objetivo e implementação

Adotar 1..50 fichas preparadas na transação do caller, abrindo espaço para a
futura confirmação integral de fichas, crédito e recibo da análise. Preparação
faz somente leituras; commit faz somente writes. A API singular conserva
pedidos, hashes, comprovantes e resultados.

Lote exige CAS, edições/alvos distintos e mesmo UID/livro/nascimento. Reabre
todas as fontes/compilações. Cabeças, gerações ativas, aposentadorias anteriores,
leases lógicas e comprovantes de edição/criação confirmam juntos, com timestamp
comum monotônico e um avanço de localLoreVersion. Se algum consentimento for
retirado, publicação é revogada uma vez, com uma versão de privacidade final
comum e before/after próprios em cada membro.

Comprovante e prova imutáveis sob a primeira edição fixam intenção ordenada e
progressos metadata. Nascimento precisa coincidir com os recibos/eventos
originais de todos os membros. Replay não agrupa sucessos individuais nem
aceita comprovantes recriados; funciona após reedição, coleta, retirada e
exclusão do livro sem consultar prosa ou recriar cabeças. Não cria preparação,
bytes ou inventário independente: metadata só nasce com sucesso, sob o job
permanente já preservado pelos protocolos existentes.

Preparação aguarda todas as leituras irmãs mesmo quando um membro falha,
antes de rejeitar a transação. Isso evita deixar leituras usando uma transação
que o SDK já encerrou. Não há writes de partes, headers ou leases individuais
durante a adoção; corpos já foram preparados e certificados.

## Critérios

- [x] Plano interno adia writes e preserva API/recibos singulares.
- [x] 1..50 membros com CAS, alvos distintos e origem comum.
- [x] Cabeças/gerações/leases lógicas/recibos/criadores atômicos.
- [x] Timestamp/clock/privacidade agregados sem publicar automaticamente.
- [x] Prova conjunta original, replay metadata sem ressurreição.
- [x] Rollback, saldo/recibo compostos e ausência de leituras órfãs.
- [x] Testes dirigidos, revisão e documentação.
- [ ] A2b/A2c: preparação/inventário/cancelamento e débito/recibo reais da análise.
- [ ] Demais integrações e validate integral de P1.

## Arquivos

Núcleo bookLoreEditAdoption, commit diferido em bookLoreEditReservationStore e
novo bookLoreEditAdoptionBatch. Helper do lote, testes Node e SDK, plano,
ADR, arquitetura, README, testes e regra em AGENTS.

## Validação local dirigida

- **37/37 Node novos**, 5577.8073 ms na rodada final. Inclui limites 1/50,
  inline/v1/v2/criação, privacidade, timestamp comum, CAS/autorizações, alvos
  duplicados, concorrência, provas ausentes/recriadas, reedição/GC/retirada/
  exclusão, cancelamento e rollback em sete pontos.
- **206/206 Node de regressão**, 6528.0532 ms: adoção singular, criação,
  reserva, compilação, retirada e exclusão de lore. Total de **243 casos
  Node distintos positivos**, sem executar a suíte completa.
- **Quatro casos SDK distintos positivos**, em duas rodadas, no emulador
  Firestore 1.22.0 verificado por SHA e restrito a projeto demo/loopback.
  Primeira rodada confirmou lote misto concorrente/privacidade/Rules/exclusão
  (99455.2555 ms) e rollback por falha nativa ao criar o recibo final
  (45804.2743 ms), com saldo e comprovante do criador preservados.
- A primeira rodada também expôs timeout de locks no caso de membro stale;
  o beforeEach seguinte não conseguiu limpar a base, então o teste de 50
  não chegou ao corpo. Corrigimos a rejeição antecipada das leituras paralelas,
  acrescentamos teste determinístico e repetimos apenas os dois casos afetados.
  Retomada **2/2 SDK**, 88784.6045 ms: stale/prova recriada e 50 payloads.
  O segundo caso confirma mais de 500 writes de metadata em um commit,
  uma única escrita da raiz, nascimentos compartilhados e 50 predecessoras
  aposentadas, sem writes de corpos/leases individuais.
- ESLint dirigido, arquitetura e sintaxe dos **227 módulos** positivos.
- Docs, Prettier e diff: positivos após redação final.

Somente saldo/recibo de um caller de teste; não houve integração ou cobrança
real da análise. Nenhuma IA paga, produção ou dado real. Logs de QA fora do Git.

## Revisão, limitações e próximo passo

A revisão conferiu preservação dos hashes singulares, separação de leituras
e writes, agregado único de clock/privacidade, prova nativa conjunta e cleanup
sem ressurreição. Corrigiu leituras irmãs que podiam sobreviver à rejeição.
O teste nativo valida o caso de 50 fichas pequenas já preparadas, sem prometer
que qualquer combinação arbitrária cabe nos limites de tamanho/tempo do
Firestore. Corpos grandes não são regravados no commit.

A2a é a primitiva interna de adoção. applyLoreAnalysis ainda recusa alvos
payload: A2b/A2c precisam preparar/cancelar/inventariar todos os itens, integrar
locais/globais/novos e cobrar uma vez junto do recibo na mesma transação.
Esse trabalho continua obrigatório, preservando o contrato de até 50 itens.

Demais writers/consumidores, backup/cliente, rollout e certificação de P1
permanecem pendentes. Sem novo callable/UI/Rule/índice/dependência. Sem TS/UI
novos, não repetimos tipos/Vitest/build/browser. Validate/cobertura completos
no fechamento de P1, conforme autorizado. Sem CI, push, PR, merge ou deploy.
P1/F2-09/Writer V2 e condições humanas/comerciais continuam abertos.

## Como conferir

Executar functions/test/bookLoreEditAdoptionBatch.test.mjs. A regressão está
nos seis arquivos de adoção, criação, reserva, composição, retirada e exclusão.
tests/firestore/bookLoreEditAdoptionBatch.rules.test.mjs exige demo/loopback.
Dev server permanece em http://127.0.0.1:5173/, sem implantação destas Functions.
