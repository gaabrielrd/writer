# Writer V2 — Barreira dos escritores legados de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [110 / M38c5l](../tasks/writer-v2/execucao/110-coordenacao-dos-escritores-legados-de-lore.md).
- **Decisão**: [ADR 0125](../decisions/0125-legacy-lore-writer-barrier.md).

## Objetivo e comportamento implementado

Preparar a proteção de fichas inline irmãs quando o livro já possui recursos
nativos. hasLoreResources permanece controlado pelo servidor: true ou valor
presente inválido exige writers nativos. Não há segundo flag ou conversão
automática. Reserva nativa de criação já fixa o marcador antes dos corpos;
cancelamento não o desfaz.

Rules recusam criação/atualização/exclusão SDK antigas, inclusive durante
deleting, com clock/revogação corretos e em lotes mistos. O serviço cliente
explica o motivo antes de gravar. Leitura do autor, confirmação de criação com
ID existente e exclusão ausente continuam sem mutação, pelo contrato anterior.
Livro com marcador false/ausente conserva CRUD inline e seus gates.

Admin não usa Rules. A aplicação legada da análise também recusa qualquer lote
com destino local, antes de writes/débito. Recibo aplicado continua confirmável
pelo hash antigo; global-only e aplicação nativa preparada preservam contratos.
Criação assistida continua usando livro novo, sem sobrescrever raiz existente.

**Proteção intermediária preparada, sem rollout**: editor/lista novos continuam
exportados e não montados no compêndio. Não implantar esta barreira isoladamente.
Bloquear cliente antigo não entrega CRUD nativo completo nem comprova drenagem.

## Critérios de aceite

- [x] SDK antigo não altera inline/payload após a barreira permanente.
- [x] Flag não pode ser forjado/removido pelo SDK para liberar a gravação.
- [x] Cliente verifica a barreira em cada callback/retry da transação.
- [x] Lote Admin legado/misto falha sem lore/clock/publicação/crédito parcial.
- [x] Recibo aplicado, leitura e operações sem mutação permanecem confirmáveis.
- [x] Legado false/ausente e universo global conservam comportamento.
- [x] Aplicação nativa real funciona com a barreira e preserva inline intocado.
- [x] Criação assistida não sobrescreve livro/fichas já existentes.
- [x] Matriz de writers, ADR, regra do projeto e revisão registradas.
- [ ] Drenagem real/rollout, entradas nativas no compêndio e CRUD completo.
- [ ] Demais consumidores, exclusão integrada de chaves e validate de P1.

## Arquivos e revisão

Alterados Rules, loreService e aplicação legada da análise; ampliados testes
próximos e SDK. Documentos atualizam plano 81, execução, arquitetura e AGENTS.
Matriz distingue os writers alterados dos inspecionados e dos não certificados.

Revisão local conferiu guard antes de writes/débito, preservação do receipt
anterior à barreira, atomicidade em lote misto, proteção de valor inválido,
retry e escopo global. Nenhuma dependência, segredo, novo namespace, endpoint,
crédito ou publicação introduzidos. Flags e clocks continuam atômicos nos
writers nativos existentes; nenhum Admin genérico ganha permissão implícita.

## Testes e validações reais

**155 testes distintos positivos, sendo 24 novos**:

- **97 Node**, três arquivos, 45.22 s: análise legada, aplicação preparada
  e criação assistida. Nove casos novos, incluindo inline irmão, lote misto,
  valores inválidos, recibo antigo, global-only e escrita nativa com barreira.
- **43 Vitest**, loreService, 2.02 s. Nove novos: marcadores, confirmação/no-op,
  false e concorrência que força retry antes de commit.
- **15 SDK/Rules**, emulador Firestore demo 1.22.0 com JAR verificado:
  book-local-lore + lore-analysis **14/14 em 17.01 s**; aplicação nativa
  filtrada **1/1 em 107.90 s**. Seis casos novos. Controle positivo da raiz,
  CRUD legado, leitura e escrita nativa isolam os denies da nova barreira.
- O primeiro ensaio do caso SDK nativo terminou positivo, mas a revisão achou
  falta de status na fixture. Corrigida a fixture e adicionados controles
  positivos de update da raiz antes/depois; somente o retake conta como prova.
- Logs PERMISSION_DENIED correspondem aos denies esperados. O primeiro ensaio
  SDK também apresentou warning de descoberta de metadata do Admin; os
  requests de dados foram restritos ao emulador demo em loopback.
- Lint final dos oito arquivos de código/teste: passou, sem warnings.
- Typecheck: passou. Check de Functions: **248 módulos** com sintaxe válida.
- Checks de arquitetura/documentação/formatação/diff executados no fechamento.
- Não executados: suíte integral/coverage, build/E2E/UI ou SDK completo.
  Nenhuma interface foi alterada. Validate integral fica no fechamento de P1.

Artefatos fora do Git em writer-v2-portability-qa: m38c5l-sdk.mjs,
m38c5l-sdk.log, m38c5l-sdk-retake.mjs, m38c5l-sdk-retake.log e logs do emulador.
Não usam material real do usuário. Dev server existente mantido em
127.0.0.1:5173, servindo o checkout isolado do Writer V2.

## Pendências e como verificar

Não ativar entrada produtora isoladamente. Faltam criação/exclusão nativas no
cliente, demais writers/consumidores, ciclo de chaves na exclusão do livro,
backup/ativação/rollout e validate de P1. P1/F2-09/Writer V2, fases 3–5 e
condições humanas/comerciais permanecem abertos.

Para verificar, executar os três testes Node de análise/criação, o teste de
loreService e os SDK dirigidos no emulador demo. Comparar docs/ADR/plano 81.
No produto atual o formulário legado permanece; este incremento prepara
proteção para implantação conjunta. Sem CI/push/PR/merge/deploy.
