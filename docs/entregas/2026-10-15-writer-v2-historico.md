# Writer V2 — Histórico privado e restauração do texto

- **Data:** 2026-10-15
- **Branch:** `codex/writer-v2`
- **Plano de origem:** [F2-05](../tasks/writer-v2/execucao/11-historico-e-restauracao.md)
- **Estado:** validado localmente e enviado em `cd5edb0`; CI do incremento pendente

## Objetivo

Autores e mestres podem guardar versões do texto de capítulos e cenas, comparar
com o texto salvo e restaurar sem perder o estado substituído.

## Funcionalidades entregues

- **Versões manuais:** rótulo opcional, data e tamanho; autosave e IA não criam
  versões automaticamente. A retenção segue até exclusão explícita.
- **Comparação e restauração:** texto guardado e atual aparecem juntos. Restaurar
  guarda uma cópia anterior e confirma prosa, contagens e recibo atomicamente,
  conservando planejamento, posição, arquivo, publicação e créditos.
- **Proteção de edição:** texto pendente, recuperação, aplicação de IA e diferença
  entre editor e fonte salva bloqueiam mutações. Desfazer/refazer da restauração
  funcionam como nova edição normal.
- **Resposta incerta:** pedido estável por conta/recurso, sem corpo no registro
  local; o editor continua bloqueado até confirmar o mesmo pedido. Replay não
  reaplica texto sobre uma gravação posterior.
- **Histórico do projeto:** consulta paginada, cópia do texto e exclusão explícita,
  inclusive quando a origem foi removida ou convertida. Restaurar não recria a
  origem nem desfaz conversão em cenas.
- **Compatibilidade:** corpos privados separados em blocos UTF-8, reconstrução
  exata e SHA-256; capítulos legados não recebem o teto novo das cenas.

## Critérios de aceite

- [x] Captura manual preserva prosa, datas, contagem, publicação e créditos.
- [x] Restauração conserva predecessor no mesmo commit do texto e ledger.
- [x] Concorrência e replay não duplicam versões nem sobrescrevem edição posterior.
- [x] Texto pendente e recuperação permanecem protegidos; edição seguinte e undo funcionam.
- [x] Unicode/HTML grandes têm roundtrip sem truncamento; leitura verifica integridade.
- [x] Histórico privado não permite acesso direto por outro papel ou conta.
- [x] Exclusão de versão é retomável; exclusão existente de livro limpa os corpos.
- [x] Paginação, cancelamento, teclado, três temas e 320 px verificados.
- [x] Gates locais de validate, SDK dirigido e navegador de produção satisfeitos.
- [ ] CI do novo SHA, acompanhada em paralelo sem bloquear o próximo incremento.

## Arquivos alterados

| Área                                                              | Mudança                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/manuscript-history`                                 | Contratos públicos, chamadas, leitor, recuperação, hook e diálogo             |
| Editores de capítulo/cena e hooks de autosave                     | Reserva exclusiva, aceitação confirmada de corpo/base e fronteira de desfazer |
| Páginas de livro/aventura e exportação                            | Consulta por projeto e aviso de backup sem histórico                          |
| `functions/src/workHistory*.mjs`                                  | Autorização, tokens precisos, paginação, captura, restauração e limpeza       |
| Escritores `workProgressLegacy.mjs`/`scenes.mjs`                  | Preparação transacional reutilizada pelo histórico                            |
| `sceneJobs.mjs`, regras e índices                                 | Limpeza de livro, bloqueio direto e consultas limitadas                       |
| Testes unitários, SDK e `e2e/visual/manuscript-history.visual.ts` | Contratos e jornadas observáveis                                              |
| README, arquitetura, testes, AGENTS e ADR 0029                    | Estado real e regras do incremento                                            |

## Testes e validações executadas

| Execução                                                               | Resultado real                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run validate`                                                     | Parou somente em Prettier do novo teste SDK; gates anteriores verdes                               |
| Retomada: formatação dirigida, `format:check`, `lint`, `test`, `build` | Exit 0, sem repetir os gates anteriores já verdes                                                  |
| Frontend com cobertura                                                 | 155 arquivos; 1.423 testes; 110,22 s; limites mantidos                                             |
| Scripts                                                                | 77/77; 7.489,4862 ms                                                                               |
| Functions                                                              | 237/237; 1.838,4617 ms; sintaxe verde                                                              |
| Tipos/build/smoke                                                      | Verdes; bundle 1,27 s                                                                              |
| SDK integral inicial                                                   | 89/90; um ID do novo teste tinha 15 caracteres e contrariava o contrato 16–80                      |
| SDK após corrigir apenas esse ID                                       | Caso afetado 1/1 verde; 6.745,2073 ms; outros 89 já verdes, não repetidos                          |
| Chromium histórico                                                     | 36/36; 101.153,683 ms; zero falhas, skips ou flaky; retries 0, workers 2                           |
| Produção Chromium                                                      | 6/6 aplicáveis; 1 skip preexistente de referência visual Windows; 14,6 s; retries 0                |
| Revisão                                                                | Revisões independentes e diff final sem bloqueadores; capturas 320 px inspecionadas nos três temas |

Cobertura: statements 92,34%; branches 85,9%; functions 91,35%; lines 94,66%.
Não houve execução única SDK 90/90 após o ajuste nem uma segunda execução integral
de validate. A retomada respeita a decisão do operador de executar somente o que
falta ou foi afetado após ajustes; a CI executará seu portão completo próprio.

Saída real da retomada:

```text
Test Files  155 passed (155)
Tests       1423 passed (1423)
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ tests 237
ℹ pass 237
ℹ fail 0
✓ built in 1.27s
Smoke test do bundle OK.
```

Os controles negativos também detectaram e corrigiram: registro local corrompido
de outro recurso ocultando pedido saudável; edição de cena durante reserva;
controles de restauração habilitados após comparação remota divergente. O primeiro
ensaio desktop teve 4/6: uma expectativa de nota em cartão recolhido foi corrigida
para abrir o planejamento e conferir o mesmo campo; o outro caso revelou a falha
real de controles. O ensaio final 36/36 conserva essas verificações.

Os testes SDK usam Firestore real em emulador; os visuais substituem apenas o
transporte das callables. Leitor, hash, comparação e integração dos editores são
reais no navegador. Capturas não provam autorização em produção.

## Fora do escopo

Histórico por autosave, merge automático, lore versionado, restauração de projeto
inteiro, portal de jogadores, publicação, estorno financeiro e portabilidade do histórico.

## Limitações e pendências conhecidas

O commit `cd5edb0e18ac96edefac526036f7f00f86486734` foi enviado ao
[PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21), junto do plano
`7276f11`. Hooks mantidos; pre-push confirmou tipos e 1.423 testes (155 arquivos,
97,24 s). [CI](https://github.com/gaabrielrd/writer/actions/runs/38705606516) e
[regras](https://github.com/gaabrielrd/writer/actions/runs/38705606462) foram
observadas em execução; o trabalho seguinte avança sem esperar esses resultados.

- Backup v6 não inclui versões; a interface informa isso. Portabilidade integral: F2-09.
- Não existe exclusão de projeto de aventura; sua futura implementação deve limpar
  versões/corpos. Exclusão individual de versão funciona para livros e aventuras.
- Armazenamento cresce até exclusão explícita. Regras/índices/Functions não foram
  implantados; merge, deploy e lançamento permanecem sem autorização.
- CI do incremento e pilotos humanos/comerciais permanecem separados dos gates locais.
- Build conserva avisos existentes de tamanho de chunks e importação mista de DOCX.
- Logs e capturas ficam fora do Git, em `writer-v2-history-*` na pasta de artefatos
  deste chat. O checkout original `E:/Mega/dev/writer` continua limpo e preservado.

## Como verificar manualmente

1. Salve um capítulo/cena; abra Histórico do texto e crie uma versão com rótulo.
2. Altere e salve o texto; selecione a versão anterior e confira os dois textos.
3. Confirme restaurar; confira o texto e a nova versão Antes da restauração.
4. Feche o histórico; desfaça/refaça, escreva novamente e recarregue.
5. No histórico do projeto, consulte uma origem removida; copie ou exclua a versão,
   sem recriar o recurso nem substituir outra cena.
