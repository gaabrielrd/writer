# Writer V2 — Preparação vinculada do lote da análise

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [97 / A2b2](../tasks/writer-v2/execucao/97-preparacao-vinculada-do-lote-da-analise.md).
- **Decisão**: [ADR 0112](../decisions/0112-bound-lore-analysis-application-preparation.md).

## Objetivo e implementação

Preparar e auditar todos os alvos locais do manifesto, até 50 itens, com
retomada por unidade e sem aplicação parcial. Os globais preservam sua fonte
e recebem prontidão metadata para A2c. Nenhuma cabeça ou crédito é alterado.

Cada unidade confere pedido/CAS, análise/provedor originais, nascimentos,
expiração e contexto lógico atual. Filho e registros de proprietário/prova
nascem junto do evento/checkpoint do pai. A capacidade é ligada à transação;
serviços singulares não continuam filhos reservados fora dela. Criação e
inspeção vinculadas não podem gerar filhos não previstos.

O fluxo cobre inspeção, campos/partes/selos, reserva/geração e composição/
auditoria, com transação injetada nos serviços existentes. Checkpoint guarda
somente metadata. Certificados de membro fixam referências CAS prontas,
acopladas ao cursor; ready só aparece após todos os membros.

Cancelamento fecha o pai antes de limpar. Uma unidade por transação limpa
edição, campos e origem e audita os comprovantes. Pode continuar após revogação,
sem grant de produção ou prosa. Dados estrangeiros/recriados bloqueiam para
reconciliação. Exclusão do livro coordena essa limpeza com seu checkpoint.
Fences/tokens/eventos v1 são conservados.

## Critérios

- [x] Unidades reautorizadas e CAS, sem novo corpo em checkpoint.
- [x] Filho/proprietário/prova/pai com nascimento e commit conjuntos.
- [x] Guards singulares, filhos previstos e adoção individual bloqueada.
- [x] Preparação real inline/v1/v2/criação, defaults privados e fontes intactas.
- [x] Prontidão de todos os membros e certificados metadata.
- [x] Cancelamento em cada etapa, cleanup após revogação e exclusão integrada.
- [x] Provas originais, rollback, retries/concorrência e sem ressurreição.
- [x] Testes dirigidos, revisão e documentação.
- [ ] A2c: adoção/aplicação local/global/nova com crédito e recibo reais.
- [ ] Demais integrações e validate integral de P1.

## Arquivos e fronteira

Novos contratos de workflow/filhos, reautorização, bindings, produção,
coordenador e cleanup. Estado/replay/cancelamento da aplicação evoluídos;
serviços existentes receberam transação injetada e guards de produção/origem.
Exclusão coordena cleanup e Rules protegem registros/provas. Helper, testes
Node/SDK, plano, ADR, AGENTS e documentação atualizados.

## Validação local dirigida

**454 casos Node distintos positivos**, em rodadas dirigidas sem suíte completa:

- **182/182** produtores existentes, 3946.828 ms: campos, inspeção, reserva,
  composição e criação.
- **198/198** ciclos existentes, 8678.7964 ms: adoção singular/conjunta,
  criação ativada, exclusão/retirada e aplicação legada da análise.
- **39/39** reserva, 848.1778 ms. O caso de filho desconhecido foi atualizado
  para a nova regra: intenção fecha o pai e a limpeza bloqueia/preserva o filho.
- **33/33** workflow novo, 98120.3907 ms. Inclui 50 fichas locais novas reais
  preparadas e limpas (94015.0385 ms), quatro formatos de origem, mistura de
  destinos, defaults privados, CAS/replay/concorrência, sete revogações,
  bypass singular, adoção individual recusada, cinco recriações, cancelamento
  em seis etapas e rollback em filho/proprietário/pai/bytes/certificado.

A primeira rodada ampliada detectou que a edição precisava ler seus campos
selados de criação sem ganhar capacidade para escrever neles. A guarda foi
ajustada para dependência planejada, com prova nativa; a rodada de 33 passou.
Dois ramos adicionais de descendentes interrompidos passaram em rodada dirigida:
**2/2**, 667.9237 ms, materialização inline e criação nova após revogação.
Somam 35 casos novos distintos, preservando as 33 jornadas verdes.
Lint apontou dois símbolos de teste sem uso; foram removidos sem mudança de
comportamento ou repetição desnecessária das jornadas verdes.

**3/3 SDK**, 322344.0348 ms, emulador Firestore 1.22.0 verificado por SHA,
projeto demo/loopback e recursos limitados desde o início (Java 256 MiB/dois
CPUs e Node 384 MiB), sem novo OOM:

- 50 membros mistos (dois locais, um global existente e 47 globais novos)
  chegam a ready; todos os filhos têm nascimento conjunto com proprietário/
  prova/evento. Sources/clocks/crédito intactos, Rules negam SDK, adoção
  singular falha e cleanup após revogação conserva os corpos originais.
- Falha nativa no checkpoint final reverte parte recém-escrita, estado do campo
  e pai. Retry exato confirma a parte na mesma data nativa do checkpoint;
  exclusão limpa todos os bytes e replay metadata permanece.
- Proprietário/prova recriados não autorizam produção nem exclusão automática
  do substituto estrangeiro.

Lint dirigido, arquitetura e sintaxe dos **240 módulos** positivos.
Docs/formato/diff positivos após redação final. Logs fora do Git. Fixtures
sem IA paga, produção ou dados reais.

## Revisão, limitações e próximo passo

Revisão conferiu provas de nascimento, CAS/replay, leitura de dependências,
ausência de nested transactions/reads após writes e fechamento antes do
cleanup. APIs injetadas de edição não expõem adoção singular. Guards dos
produtores normais preservam os IDs existentes fora do namespace reservado.

Node cobriu 50 locais; SDK cobriu 50 mistos. Os resultados não são benchmark
de produção nem demonstram aplicação/cobrança real. A2c deve abrir prontidão/
origem, autorizar adoção conjunta, aplicar globais e confirmar crédito/
recibo uma única vez na mesma transação. A aplicação payload ainda é recusada.

Sem novo callable/UI/dependência/índice composto ou migração. Sem UI/TS novos,
não repetimos tipos/Vitest/build/browser. Validate/cobertura integrais no fim
de P1, conforme autorizado. Sem CI, push, PR, merge ou deploy. Demais writers/
consumidores/backup/cliente/rollout e P1/F2-09/V2 permanecem abertos, assim como
as condições humanas/comerciais.

## Como conferir

Executar functions/test/loreAnalysisApplicationPreparation.test.mjs.
SDK em tests/firestore/loreAnalysisApplicationPreparation.rules.test.mjs
exige demo/loopback. Dev server permanece em http://127.0.0.1:5173/,
sem implantar estas Functions.
