# Writer V2 — Interface e descarte local da edição de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [109 / M38c5k](../tasks/writer-v2/execucao/109-interface-e-descarte-da-edicao-manual-de-lore.md).
- **Decisão**: [ADR 0124](../decisions/0124-literal-lore-editor-and-local-discard.md).

## Objetivo e funcionalidades entregues

Host visual novo edita captura bruta do lore por campos tocados, preserva
ausência/vazio/literais e permite preparar, revisar, aplicar explicitamente,
retomar, cancelar e descartar cópia confirmada. Lista paginada descobre
recuperações da conta/livro sem ler texto. Componentes exportados pela feature.

**Ainda não montados no compêndio legado**: ativação espera writers Admin/
Rules/drenagem coordenados do plano 81. Não anunciar esta UI como disponível
na navegação normal ou considerar P1/F2-09/V2 concluídos.

Novo host não herda caps/trims do formulário antigo. Campos intocados mantêm
valores e presença; aliases/relações usam um item por vez e structuredDetails
uma chave. Revisão congelada é navegável/copiável. Campos preparados são
identificados; aplicar exige clique próprio. CR/CRLF intocados são preservados
no roundtrip do textarea, além de BOM/espaços.

Falha conserva handle e intenção; retomada confere conta/escopo antes de texto.
Cancel conserva cópia/chave. Rascunho cancelado pode iniciar nova preparação
explícita com o CAS original, sem rebase silencioso. Fechar/navegar pede
confirmação, com aviso correto antes de existir cópia. beforeunload cobre reload.
Troca real de actor SDK revalida; atualização de perfil/créditos conserva draft.

Descarte tem confirmação e intenção durável. Fecha jobs, revoga a chave e
só então remove registros locais em lotes até 50. Primeiro lote fenceia o
journal, junto com contador/marker/frames. Abort e reload não perdem progresso.
Criação tardia é recusada; tombstone permanece. Cópia aplicada/original,
recibos e outras operações/contas são preservados. Não pede chave/decrypt.

## Critérios de aceite

- [x] Campos brutos/tocados, ausência/vazio e texto sem caps/trims herdados.
- [x] Prepare/revisão/apply explícitos; retry conserva o mesmo handle.
- [x] Retomada por conta/escopo e cancel independente de key/RPC pendente.
- [x] Confirmação de saída/router/descarte e foco/teclado.
- [x] Lista paginada com loading/vazio/erro/retry e isolamento do livro.
- [x] Purga com prova, batches, fence e tombstone atômicos/retomáveis.
- [x] Writer tardio/recriação, abort, corrupção e adoção vencedora cobertos.
- [x] Temas/mobile, revisão, testes e documentação.
- [ ] Ativação no compêndio após writers/Rules/drenagem.
- [ ] Exclusão integrada da chave, demais consumidores e validate de P1.
- [ ] Leitor de tela, zoom físico 200% e segundo dispositivo reais.

## Arquivos alterados

Contrato de preparação, DB, operação manual e sessão ampliados; host, campos
literais, lista, estilos, hook de actor e modelos pequenos novos. Exportações,
harness/testes e docs/ADR/AGENTS atualizados. Sem backend, Rules ou dependências.
Banco permanece v2; campo discard opcional normaliza metadados anteriores.

## Testes e validações

**241 Vitest distintos positivos em rodadas**: 18 da UI, 12 da purga, 12 da sessão
manual (três novos), e 199 regressões de operação/controller/journal/checkpoint/
controles/sessão/chave. São 33 casos novos; retakes não somam casos.

- Purga/operação: 49/49 em 8.26 s.
- UI inicial: 10/14; ajustados os testes ao helper de dropdown (elemento,
  não texto) e à atualização reativa de Auth; retake 14/14 em 5.23 s.
- UI/purga ampliados: 29/29 em 7.55 s.
- Rodada de integração dirigida, dez arquivos: **240/240 em 30.12 s**.
- Após distinguir actor de metadata do perfil: **56/56 em 7.51 s**, incluindo
  UI final 18, sessão manual 12 e sessão existente 26.
- Lint dirigido verde, sem warning final. Corrigidos tipos de listas/mocks,
  reset de loading no evento em vez de effect, e constante movida ao modelo.
- Typecheck/build/bundle/smoke finais verdes. Primeiro build pegou opção
  exact inválida no teste do Testing Library; corrigida a fixture.
- Arquitetura/styleguide/documentação, formatação e diff final: passaram.
- Avisos existentes de chunks grandes/imports dinâmicos ineficazes mantidos.
- Não executados: suíte integral/coverage, backend, Rules ou E2E da aplicação
  inteira. Validate integral fica no fechamento de P1.

**Três jornadas Chromium no código final**:

1. React/kit/router reais: preparar e aplicar explicitamente, revisar campos
   congelados, manter ou confirmar descarte, remover cópia preservando lore
   ativo/clock; foco retorna ao opener. Três temas e viewport 390×844 sem
   overflow horizontal, capturas de tela inspecionadas.
2. Append multipart aceito com resposta perdida: reiniciar processo, retomar
   escopo/autorização, repetir wire exato e aplicar por clique. BOM/CRLF e
   Unicode confirmados no backend; 79 chamadas nativas no cenário completo.
3. 72 frames reais: primeiro descarte remove exatamente três, some header,
   bloqueia recriação e retoma após reiniciar processo, sem novas chaves.
   Lista visual oculta tombstones completos e conserva recuperação ativa.

Backend real sobre double; facades no browser substituem sessão Auth/SDK,
enquanto testes próprios verificam os guards/delegação. Não é prova de
Firebase/App Check/Rules reais, produção ou navegação normal do produto.

Ensaios iniciais do browser ajustaram expectativa de saída após descarte
(corrigido aviso falso no produto), aguardaram callback de foco e preservação
de CRLF original no sufixo. Contraste aparente no primeiro screenshot vinha
da transição do tema; captura estável confirmou cores corretas, sem alterar
CSS global. Retake final: 3/3. Hooks permanecem habilitados.

Artefatos fora do Git em writer-v2-portability-qa: m38c5k-browser-editor.mjs,
m38c5k-browser-result-final.txt e screenshots light/dark/sepia/mobile, além
dos perfis preservados. Não incluem material real do usuário.

## Revisão, riscos e pendências

Revisão local conferiu isolamento UID/writeId, CAS/prova antes de purga,
transações limitadas, late replies/crypto, texto intocado, foco, estados,
conta/escopo e ausência de segredos. Ajustes de revisão cobrem marker completo
contra armazenamento real e preservação de draft em atualização de perfil.

Próximo portão: writers Admin/Rules e drenagem antes de ativar a entrada do
novo host no compêndio. Permanecem ciclo da chave ao excluir livro, demais
consumidores/backup/ativação/rollout, P1/F2-09/V2, fases 3–5 e condições
humanas/comerciais. Sem CI/push/PR/merge/deploy.

## Como verificar

Rodar os testes novos de UI/purga e os serviços afetados; harness Chromium
usa dev server em 127.0.0.1:5173 e facades de fixture. O componente exige router
de dados/Auth do aplicativo. No compêndio normal, o formulário legado continua
até o portão de ativação. Confirmar descarte somente para a cópia escolhida;
cancelar conserva a recuperação e não apaga texto aplicado.
