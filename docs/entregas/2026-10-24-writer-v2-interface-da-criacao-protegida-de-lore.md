# Writer V2 — Interface da criação protegida de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [116 / M38c5r](../tasks/writer-v2/execucao/116-interface-da-criacao-protegida-de-lore.md).
- **Decisão**: [ADR 0131](../decisions/0131-protected-lore-creation-ui.md).

## Funcionalidades implementadas

Host BookLoreCreationEditor permite preencher campos, preparar, revisar somente
leitura e criar por confirmação distinta. Texto grande/literal, presenças,
vazios e duplicados são preservados; nova ficha começa privada. Mensagem de
sucesso e callback dependem do evento próprio confirmado.

Recuperações de criação têm lista própria por conta/livro, paginação, estados
de loading/vazio/erro/retry e abertura explícita. Antes de retomar ou cancelar,
creationTicket confere metadata do livro/writeId sem chave. Texto só aparece por
readDraft autorizado. Pedido de criação incerto pode ser verificado sem reaplicar.

Cancel/discard funcionam com produção ou chave pendentes. Confirmação de descarte
avisa que a ficha já criada fica no livro. Draft cancelado autorizado pode ser
usado em nova criação por ação explícita, com outro ID. Saída/rota/reload
protegem texto ainda não confirmado; after-apply não mantém aviso indevido.

**Fronteira**: host/lista exportados e testados, sem ativar entrada no compêndio.
A exclusão nativa do cliente precede a integração com os caminhos preparados.

## Critérios de aceite

- [x] Preparar separado de criar; revisão congelada e callback único.
- [x] Campos literais sem caps/trims ou captura/token fictícios.
- [x] Ticket por UID/livro/writeId antes de abrir texto/encerrar outra preparação.
- [x] Verificar apply pendente por advance sem envio automático de apply.
- [x] Cancel/discard independentes de produtor/chave, com confirmação explícita.
- [x] Erro preserva draft/operação e recebe foco; foco retorna ao acionador.
- [x] Rota/fechamento/beforeunload tratados e perfil preserva draft.
- [x] Lista privada/paginada com estados completos e status sem cancel prematuro.
- [x] Três temas, largura 390 px e regressão do editor existente conferidos.
- [ ] Entrada no compêndio, exclusão/lifecycle e demais portões de P1.
- [ ] Validações humanas de zoom físico/leitor de tela/outro dispositivo.

## Arquivos alterados

| Grupo                                        | Mudança                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| BookLoreCreationEditor/CreationRecoveries    | Host e lista privados                                    |
| BookLoreLiteralFields                        | Tipo recebe somente data; comportamento anterior mantido |
| EditService                                  | creationTicket com UID/actor capturados                  |
| lore index                                   | Exporta host/lista e props                               |
| CreationEditor/CreationSession tests         | 21 novos casos                                           |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contrato, evidência e continuidade                       |

## Testes e validações reais

**77 Vitest distintos positivos em rodadas, com 21 casos novos**:
20 do host/lista e um da sessão Auth. Inclui 56 regressões do editor/manual
e do serviço/sessão existentes. Retakes não somam casos.

```text
Test Files  4 passed (4)
Tests  76 passed (76)
Duration  7.85s

Retake final dos casos afetados:
Test Files  1 passed (1)
Tests  3 passed | 17 skipped (20)
Duration  3.37s
```

A integração inicial teve 76 casos. O novo caso de conflito recorrente elevou
o conjunto a 77 distintos; o fechamento repetiu somente os três afetados.
Rodada anterior ampliada: 45/45 em três arquivos, 7.90 s. Testes cobrem preparação
sem apply, congelamento/retry, texto >180 mil caracteres, duplicados/CRLF e
ausências na nova criação a partir de cancel, callback histórico sem corpo,
escopo errado, perfil/actor, cancel/discard com espera e listagem paginada.

O primeiro conjunto de UI pegou retorno de foco para botão já desmontado.
Refs dos acionadores montados corrigem a volta após confirmação. Outras falhas
iniciais eram consultas ambíguas dos dois botões Fechar e uso incorreto do helper
de Dropdown; corrigidas nos testes. Lint/tipos também exigiram mocks tipados,
Promise.resolve onde não havia await e opções válidas do Testing Library.
Nenhuma regra de teste/lint foi reduzida. Revisão final limitou a reconciliação
automática de conflito por ação: uma nova rejeição exige retry explícito,
conservando a preparação. Os três casos afetados passaram no retake.

**Três jornadas Chromium positivas com componentes e executor reais**:

1. Host real prepara sem cabeça, cria por clique próprio e notifica uma vez;
   foco de confirmação retorna ao botão. Capturas light/dark/sepia e mobile
   390×844 conferidas. Descarte nativo mantém cabeça e clock.
2. Append aceito sem resposta; reinício completo do processo reabre lista sem
   texto, recupera draft protegido literalmente e repete só o pedido original.
   Criar continua explícito.
3. Chave inicial fica retida enquanto o host encerra/purga sem esperar a resposta.
   Nenhuma chave adicional ou decrypt é necessário para descartar; liberação
   tardia não recria campos, frames ou cabeça.

Capturas foram inspecionadas. O harness foi alinhado à classe e data-theme do
ThemeProvider e desabilitou transições somente na captura, para medir o tema
estável. Contraste computado do texto do textarea sobre a superfície do modal:
light 14.21:1, dark 14.64:1, sepia 12.98:1. Isso não substitui auditoria completa
de contraste de todos os estados nem os gates humanos pendentes.

Script/perfis/JSON/PNGs ficam fora do Git no workspace de visualizações,
diretório writer-v2-portability-qa: m38c5r-browser-creation-ui.mjs,
m38c5r-browser-result.json e m38c5r-creation-{light,dark,sepia,mobile}.png.
O teste usa React/kit, UI, executor e serviços Functions reais, com ports
Auth/session e identidades de banco de fixture. IndexedDB/WebCrypto/Web Locks
e reinício são nativos. Não certifica SDK/Auth/App Check reais nem ativação.

| Validação                   | Resultado                                         |
| --------------------------- | ------------------------------------------------- |
| Vitest dirigido             | 77 distintos; integração 76/76 e retake final 3/3 |
| Chromium UI/nativo          | 3/3                                               |
| npm run build               | Tipos, bundle de 2.946 módulos e smoke positivos  |
| Lint/styleguide/arquitetura | Positivos                                         |
| Formatação/docs/diff        | Conferidos no fechamento                          |
| Validate/coverage integral  | Não executado; fechamento de P1                   |
| Backend/Rules/SDK reais/CI  | Não executados neste incremento                   |

Build conserva avisos existentes de chunks/imports dinâmicos. Sem backend/
Rules, dependências, env, assets ou rota de demonstração novos em produção.

## Como verificar e próximos passos

Executar BookLoreCreationEditor.test.tsx e CreationSession, junto das regressões
ManualEditor/EditService. Componentes estão na interface pública de lore para
composição; ainda não há atalho novo na navegação normal. O harness Chromium
é externo ao bundle e não representa login real no dev server.

Próximo: exclusão nativa no cliente e integração coordenada no compêndio.
Lifecycle de chaves, outros writers/consumidores/backup/ativação/rollout e validate
de P1 continuam necessários. P1/F2-09/V2/fases 3–5 e gates humanos/comerciais
continuam abertos. Dev server mantido em http://127.0.0.1:5173/;
sem CI/push/PR/merge/deploy.
