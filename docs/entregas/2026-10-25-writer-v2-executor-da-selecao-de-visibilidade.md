# Writer V2 — Executor da seleção de visibilidade

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [125 / marco B](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md).
- **Decisão**: [ADR 0141](../decisions/0141-durable-book-lore-visibility-selection.md).

## Objetivo e funcionalidades

Preparar/aplicar a visibilidade de uma seleção inteira com origem fixa,
progresso parcial e retomada. O manifesto e o ledger locais guardam somente
metadata. A edição de isPublic reaproveita fonte C1 real, cópia cifrada,
checkpoint e referências gravadas antes de RPC.

Pedido de aplicação incerto consulta o aceite original; reenviar requer retry
separado depois da consulta. Cancel é independente de produtor retido, preserva
aceites, fecha todos os IDs e limpa preparações sem chave. Unchanged é um
resultado próprio, sem edição fictícia. Conflitos antes/depois de ready fecham
a origem antiga; não adotam uma origem nova.

Serviço Auth exportado, com descoberta paginada e conferência fria de provas.
Ainda sem revisão/diálogo/lista visual de retomadas ou montagem no compêndio.

## Critérios de aceite do marco

- [x] Manifesto/páginas/estados atômicos antes de RPC; 53 membros sem teto de 50.
- [x] CAS/oncomplete, refs imutáveis, pin de tokens e contador/outcome atômicos.
- [x] Fonte C1/v2 original e somente isPublic; campos privados preservados.
- [x] Inline/payload v1/v2, mixed e unchanged sem falso apply.
- [x] Consulta original/retry explícito; cópia filha perdida preserva aceite.
- [x] Dívida antes de RPC e ACK perdido salvam sem produzir outra unidade.
- [x] Cancel de IDs nunca iniciados/preparados sem chave; aceites preservados.
- [x] Duas instâncias/abas e respostas tardias vinculadas a membro/geração.
- [x] Actor/host, descoberta metadata, órfãos/corrupção/prova recriada recusados.
- [x] Runtime compartilhado preserva formatos antigos e cinco stores cifrados.
- [ ] Revisão/UI/retomada de visibilidade e composição do compêndio.
- [ ] Demais lifecycle/consumidores/backup/rollout/validate de P1 e fases/gates.

## Arquivos alterados

| Grupo                                        | Mudança                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| MetadataDb/RemovalSelectionDb                | Rotina curta compartilhada, formatos antigos mantidos  |
| VisibilitySelectionContracts/Db              | Manifesto e ledger metadata próprios                   |
| VisibilitySelectionCleanup/Operation         | Executor, prova original, retry/cancel e reconciliação |
| VisibilitySelectionService/EditService/index | Composição Auth e exportação pública                   |
| VisibilitySelection tests/Db/Session/harness | Casos novos e dois bancos IDB isolados no harness      |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos, evidência e continuidade                    |

## Testes dirigidos

**98 casos distintos positivos: 31 novos e 67 regressões.**

Rodada final de seis arquivos: 97 positivos. Depois foi acrescentado somente o
caso das três formas de armazenamento ao harness; execução isolada positiva
(um caso, 19 fora do filtro). Não corresponde a suíte completa do projeto.

| Arquivo/grupo              |                                  Positivos |
| -------------------------- | -----------------------------------------: |
| VisibilitySelection        | 20 novos (19 na rodada final + um isolado) |
| VisibilitySelectionDb      |                                    6 novos |
| VisibilitySelectionSession |                                    5 novos |
| RemovalSelection           |                              26 regressões |
| RemovalSelectionSession    |                               7 regressões |
| EditService                |                              34 regressões |

```text
Test Files  2 passed (2)
Tests  34 passed (34)
Duration  49.57s

Test Files  2 passed (2)
Tests  22 passed (22)
Duration  53.01s

Test Files  1 passed (1)
Tests  5 passed (5)

Test Files  1 passed (1)
Tests  1 passed | 19 skipped (20)
Duration  3.06s
```

O relatório final m38c6b-vitest.json confirma 97 testes nos seis arquivos.
As rodadas acima se sobrepõem: a contagem distinta é 98, não a soma das execuções.

Cobertura: 53 aplicações reais do campo, inline/v1/v2 e demais campos preservados,
nenhuma mudança/misto/consentimento ausente, origem alterada, consulta/retry de
pedido original, perda de journal, chave negada, cancel sem chave, produtor aceito
retido, dívidas antes/depois de commit, ausência de replay, prova recriada,
descoberta/Auth/CAS/rollback/órfãos/metadata corrompida.

A revisão identificou uma corrida de observação antiga de limpeza: depois de
cancelar e avançar, o callback usava active mutável e marcava inspectionClosed
no membro seguinte. Um teste reteve o GET, reproduziu a falha e confirmou
revision/flag indevidas. Corrigido com membro e geração fixos, rejeição de
observação velha e marcador fechado exigindo referência observada. O teste
específico passou e a rodada final completa dos seis arquivos também.

A primeira rodada Auth teve quatro de cinco positivos: resumeSelection lançava
guard de forma síncrona, enquanto a API de retomada existente é assíncrona.
Alinhado o método novo; cinco de cinco finais. Asserções de tipo redundantes
foram removidas pelo lint, sem suprimir regras.

Os testes usam serviços nativos de produção com Firestore em memória e harness
de eventos/atomicidade IDB. O harness separa DB pai e DB cifrado; não presume que
um único mapa de stores representa bancos diferentes.

## Chromium real

**Cinco jornadas novas positivas**, com IndexedDB, Web Locks, WebCrypto/AES-GCM,
cópias protegidas e módulos de produção reais:

1. Filhos protegidos e resultados mistos; reinício confere efeitos originais
   sem nova aplicação nem chave.
2. 53 unchanged em duas páginas, sem editar/cifrar uma ficha fictícia.
3. Resposta aceita perdida, remoção somente dos registros da filha cifrada e
   reinício de contexto; uma consulta original confirma o efeito sem replay.
4. Pedido não enviado, reinício, consulta e retry explícito com wire original.
5. Outra aba cancela produtor aceito retido, mantém um aceite/duas canceladas,
   não pede chave e não aceita sobrescrita de progresso por ACK tardio.

O harness confere manifesto e referências metadata persistidos, intenção de
apply e pedido cifrado pendente antes de cada RPC de produção. Os cinco stores
antigos preservaram sentinelas e o pai nunca recebeu nomes/prosa.

**Quatro regressões Chromium da retirada positivas** após extração do runtime:
53 fontes/reinício, resposta perdida sem replay, cancel em outra aba e journal
filho removido; cinco stores e retirada não relacionada preservados.

Browser usa backend/Auth/SDK em fixtures locais e binding de loopback.
Não certifica credenciais de produção, App Check real, rede Functions implantada,
piloto humano, leitor de tela, segundo dispositivo ou zoom físico.
Sem alteração visual, não há nova captura/layout de interface a certificar.

Artefatos fora do Git em writer-v2-portability-qa:
m38c6b-browser.mjs, m38c6b-browser-result.json,
m38c6b-removal-regression.mjs, m38c6b-removal-browser-result.json e
m38c6b-vitest.json. A bateria nova foi repetida após corrigir concorrência.
Os quatro casos antigos verificam o runtime compartilhado, que não mudou depois.

## Validações executadas

- Lint dirigido positivo.
- Build (npm run build): tipos, bundle e smoke positivos.
- 2968 módulos transformados; smoke do bundle OK.
- Formatação, arquitetura, docs e diff conferidos no fechamento.
- Avisos de chunks/imports dinâmicos anteriores permanecem.
- Backend/Rules/deps/env sem alterações; sem repetir Node/SDK.
- Validate completo reservado ao fechamento de P1 por decisão do operador.
- Sem CI, push, PR, merge ou deploy.

## Limitações e próximos passos

Não conclui o plano 125: falta revisão/diálogo/lista visual e composição do
compêndio preservando todas as ações. Filhas de seleção devem ser retomadas
pela seleção, sem oferecer apply isolado na lista manual. Callback deve reler
valores atuais; efeito histórico não congela o valor da ficha.

Fechamento bloqueado pelo inventário mantém limpeza pendente. Não há promessa
de atomicidade do grupo ou certificado geral de GC. A fonte completa pode atingir
limites reais do dispositivo; o plano fica preservado, sem inventar prosa/stub.

Lifecycle/consumidores/backup/rollout/validate de P1 e fases/gates humanos e
comerciais da V2 continuam no objetivo. Nenhuma ativação remota.

## Como conferir

Pelos serviços, preparar uma seleção de origens v2, avançar até ready e aplicar
explicitamente. Após interromper uma resposta, retomar e avançar: deve consultar
o resultado original. Se não aceito e a origem continuar a mesma, apenas retry
explícito pode reenviar o wire. Cancel por outro handle deve preservar aceites
e fechar os demais IDs sem abrir a cópia protegida.
