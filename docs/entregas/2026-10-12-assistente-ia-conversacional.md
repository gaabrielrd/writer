# Assistente IA conversacional no editor

- **Data**: 2026-10-12
- **Branch**: `codex/assistente-ia-chat-editor`
- **Plano de origem**: [12 tarefas aprovadas](../tasks/assistente-ia-conversacional-no-editor.md)

## Objetivo

Oferecer ao autor uma conversa persistente durante a escrita, no espaço do
Compêndio, com contexto da seleção, cursor ou passagem visível. Conversar não
debita créditos; alterações no capítulo exigem aceite explícito.

## Funcionalidades entregues

- **Painel compartilhado** — Assistente IA e Compêndio alternam no mesmo espaço,
  preservando manuscrito, minimapa, seleção e rascunho; três temas e celular de 320 px.
- **Conversa completa** — streaming, parar, retry, regenerar, editar pedido com
  confirmação, copiar, excluir conversa, paginação e indicador de novas mensagens.
- **Contexto inspecionável** — origem automática ou manual, contexto fixado,
  texto ainda não salvo, persona e lore relevante local/global.
- **Comandos e seleção** — catálogo `/` por teclado; as ações de seleção preparam
  pedidos no mesmo chat e só geram após Enviar.
- **Histórico privado** — conversas por conta e capítulo retomáveis após reload,
  rascunho local/sincronizado e limpeza por exclusão de capítulo, livro, perfil ou conta.
- **Provedores** — plataforma no servidor e OpenAI/Gemini BYOK com streaming;
  chaves locais não entram no histórico nem nas requisições da callable.
- **Aceite protegido** — prévia do destino, validação de texto/persona/lore,
  coordenação com autosave, transação com texto/saldo/recibo e recuperação de rede.
  Desfazer/refazer continuam disponíveis; sugestão já paga não debita novamente.
- **Conversa gratuita** — funciona com saldo zero; primeiro aceite da plataforma
  custa 1 crédito; BYOK, análises, mensagens e regenerações não debitam.

## Critérios de aceite

- [x] Tarefa 1: contratos e estados de conversa, contexto, sugestão e operação.
- [x] Tarefa 2: espaço lateral único e dimensões iguais ao Compêndio.
- [x] Tarefa 3: captura real da seleção, cursor e viewport interna/documental.
- [x] Tarefa 4: contexto limitado, inspecionável, manual e fixado.
- [x] Tarefa 5: persistência privada, paginação, retomada, rascunho e exclusão.
- [x] Tarefa 6: geração conversacional e streaming nos três caminhos de provedor.
- [x] Tarefa 7: interface, falhas, cancelamento e controle de rolagem.
- [x] Tarefa 8: catálogo `/`, parâmetros e navegação acessível.
- [x] Tarefa 9: integração das ações existentes de seleção.
- [x] Tarefa 10: aceite atômico, idempotência, concorrência e recuperação.
- [x] Tarefa 11: testes de comportamento, servidor, regras reais e navegador.
- [x] Tarefa 12: validação local, revisão, documentação e evidência.
- [x] Respostas tardias de uma geração interrompida não encerram a geração seguinte.
- [x] Recuperação rejeitada definitivamente libera nova tentativa sem alterar texto/saldo.
- [x] Arquivo paralelo de entrega preservado com SHA-256 original.

## Arquivos alterados

| Arquivos                                                                                                  | Mudança                                                         |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/features/ai-assistant/components/ChapterChatPanel.tsx`, CSS e `AIChatLauncher.tsx`                   | Painel, comandos, contexto, sugestões e ações.                  |
| `src/features/ai-assistant/hooks/useChapterChat.ts` e `model/chapterChat.ts`                              | Estado, retomada e contratos públicos.                          |
| `src/features/ai-assistant/services/chapterChatService.ts`, `chatDraftStorage.ts` e `chatApplyStorage.ts` | Streaming e adaptadores privados de recuperação.                |
| `src/features/ai-assistant/index.ts`                                                                      | Interface pública da feature.                                   |
| `src/features/editor/components/EditorPage.tsx`, `RichEditor.tsx` e `hooks/useChatEditorBridge.ts`        | Composição do painel, geometria real e transação do manuscrito. |
| `src/features/editor/hooks/useAutoSave.ts` e `services/chapterContentStorage.ts`                          | Fila comum de gravação/aceite e conteúdo salvo conhecido.       |
| `functions/src/chapterChat.mjs`, `index.mjs` e `functions/package.json`                                   | Autoria, cotas, registros, geração, aceite e limpeza.           |
| `firestore.rules`                                                                                         | Conversas/recibos/cotas exclusivos do servidor.                 |
| `e2e/visual/fixtures/chapterChatService.ts`, `chapterChatStore.ts` e `vite.visual.config.ts`              | Fixtures isoladas, sem produção.                                |
| `docs/chapter-chat.md`, ADR 0022, arquitetura, personas, styleguide, testes, plano, README e AGENTS       | Contratos, decisões e regras documentadas.                      |

## Testes

| Testes                                                                          | Tipo                       | Cobertura observável                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ChapterChatPanel.test.tsx`                                                     | Integração                 | Slash, teclado/IME, confirmação, contexto, rascunho, histórico, rolagem, erros, sanitização, cancelamento e resposta tardia. |
| `chapterChatModel.test.ts`, `chapterChatService.test.ts`                        | Unidade                    | Comandos, isolamento local, hashes, SSE fragmentado, UTF-8, abort, truncamento e BYOK.                                       |
| `chatEditorBridge.test.tsx`                                                     | Integração                 | Editor ProseMirror real, seleção/viewport, texto não salvo, alvo antigo, inserção segura e undo.                             |
| `EditorPageChat.test.tsx`, `EditorPage.test.tsx`                                | Integração                 | Aceite, conflito remoto, estado salvo, recuperação incerta/rejeitada e edições posteriores.                                  |
| `functions/test/chapterChat.test.mjs`                                           | Servidor                   | Autoria, histórico com prosa, cota, zero saldo, BYOK, estados, edição/exclusão e transação idempotente.                      |
| `tests/firestore/chapter-chat.rules.test.mjs`                                   | Firestore real no emulador | Negação de acesso direto e concorrência de aceite com um único débito.                                                       |
| `e2e/visual/chapter-chat.visual.ts`                                             | Chromium                   | Dimensões, fluxo explícito, aplicação/undo/reaplicação, reload, 320 px, viewport real e cancelamento.                        |
| `dialog-layout.visual.ts`, `editor-adjustments.visual.ts`, `personas.visual.ts` | Chromium                   | Fluxos existentes adaptados ao painel e envio explícito.                                                                     |
| `autocomplete-trigger.visual.ts`, `chapter-minimap.visual.ts`                   | Chromium                   | Regressões de autocomplete por digitação e navegação do minimapa.                                                            |

Saída observada da validação local:

```text
Test Files  102 passed (102)
     Tests  713 passed (713)
All files: statements 92.64%, branches 85.87%, functions 91.07%, lines 94.79%
scripts: tests 69; pass 69; fail 0
functions: tests 73; pass 73; fail 0
Smoke test do bundle OK.
```

Saída das regras e verificações adicionais:

```text
Firestore: tests 48; pass 48; fail 0
Navegador: 102 passed (6.8m), em seis projetos de tema/dispositivo
Nova execução do chat: 12 passed (1.5m)
Recuperação e cancelamento finais: Test Files 2 passed; Tests 18 passed
```

## Validações executadas

| Comando                                                                                                                                                                                                                                                                              | Resultado                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions`                                                                                                                                                                                                                                                          | Instalado; auditoria sem vulnerabilidades.                                                                          |
| `npm run validate`                                                                                                                                                                                                                                                                   | Verde: skills, arquitetura, documentação, styleguide, formato, lint, cobertura, servidor, typecheck, build e smoke. |
| `npm run test:rules`                                                                                                                                                                                                                                                                 | 48 testes passaram no emulador, incluindo transação Admin real.                                                     |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-chat.visual.ts e2e/visual/dialog-layout.visual.ts e2e/visual/editor-adjustments.visual.ts e2e/visual/personas.visual.ts e2e/visual/autocomplete-trigger.visual.ts e2e/visual/chapter-minimap.visual.ts` | 102 testes passaram nos três temas, desktop/celular.                                                                |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-chat.visual.ts`                                                                                                                                                                                         | 12 testes passaram na execução posterior.                                                                           |
| `git diff --check`                                                                                                                                                                                                                                                                   | Sem erros de whitespace.                                                                                            |

Capturas do chat em desktop escuro e celular claro foram inspecionadas visualmente.
O build conserva os avisos existentes de chunk grande e importação dinâmica
ineficaz de `exportDocx`; não há falha de build.

## Fora do escopo

Pesquisa na internet, anexos, voz, alterações autônomas de lore, edição de vários
capítulos, busca semântica do livro inteiro e migração da cobrança do autocomplete.

## Limitações e pendências conhecidas

- Implementação validada localmente; sem push, PR, CI remoto ou deploy nesta tarefa.
  O requisito de CI da definição de concluído depende da publicação posterior do PR.
- Fixtures e emulador não verificam conectividade nem qualidade literária em produção.
  A liberação requer frontend, callable, regras e triggers juntos, conforme
  [contrato do chat](../chapter-chat.md).
- Conversas têm cotas e limites documentados. Contexto reduzido é sinalizado;
  o chat não consulta automaticamente o livro inteiro.
- Cópias locais privadas permanecem no perfil do navegador em dispositivos compartilhados.
- A entrega paralela `2026-10-12-deploy-estudio-fluxos-diretos.md` não integra esta alteração;
  SHA-256 preservado: `0E9CF3E374CDAEDFBFF810947E703823F820C110B5C56ECEAB73D63EDB050E7A`.

## Como verificar manualmente

1. Abra um capítulo, selecione texto e alterne Compêndio/Assistente IA; confirme
   mesmo espaço, seleção preservada e ausência de geração automática.
2. Digite `/`, escolha `/estilo` por teclado e confira o contexto antes de Enviar.
3. Envie com saldo zero; confirme streaming sem débito. Pare uma resposta e envie outra.
4. Recarregue e confira mensagens/rascunho; outro autor ou capítulo não recebe a conversa.
5. Aplique uma sugestão com saldo disponível; confirme 1 crédito e texto salvo.
   Desfaça, escolha novo destino e reaplique: não deve ocorrer outro débito.
6. Altere o alvo depois de gerar: aceite antigo deve ser recusado. Escolha novo
   destino para revisar a prévia e confirmar explicitamente.
7. Confira os temas Claro/Escuro/Sépia e celular de 320 px, sem rolagem horizontal.
