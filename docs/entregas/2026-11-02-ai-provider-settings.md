# Seleção de modelos e raciocínio da plataforma

- **Data**: 2026-11-02
- **Branch**: `codex/ai-provider-settings`
- **Plano de origem**: plano aprovado na conversa, com temperatura removida
- **Base**: `522ccaa7bcc92fe5eb4ae4ff54446afee98a52bf`

## Objetivo

Permitir que o autor escolha Firebase AI Logic ou BYOK e configure o modelo e
raciocínio da plataforma na aba Provedor, com aplicação efetiva nos fluxos de texto.

## Funcionalidades entregues

- **Conexão em duas etapas** — primeiro Firebase/BYOK; depois modelo/raciocínio
  ou provedor BYOK, chave e modelo personalizado.
- **Modelos da plataforma** — Gemini 3.8 Flash (padrão), 3.5 Flash-Lite e 4 Argon,
  com raciocínio Médio (padrão) ou Alto e sem temperatura.
- **Preferências locais** — salvar explícito, migração do modelo BYOK legado,
  chaves e modelos independentes por provedor e restauração.
- **Geração efetiva** — preferências aplicadas a autocomplete, ações, chat,
  sinopse, criação assistida e análise de lore. Functions validam a lista.
- **Recuperação** — snapshots públicos e configuração efetiva no servidor,
  retry do chat e da criação assistida preservado; blocos/reparação de lore
  compartilham parâmetros. Conversas existentes preservam raciocínio próprio;
  novas conversas Firebase herdam a aba Provedor.
- **Compatibilidade** — pedidos antigos conservam fingerprints e modelos
  reconhecidos; preferências não cancelam gerações em andamento. Capas, créditos,
  autorização e limites por operação são preservados.

## Critérios de aceite

- [x] Primeiro seletor contém Firebase AI Logic e BYOK.
- [x] Firebase apresenta três modelos e raciocínio Médio/Alto.
- [x] Temperatura e tooltip não são apresentadas; Gemini não recebe temperatura.
- [x] Preferências persistem após reload e chegam aos transportes pertinentes.
- [x] Modelos não autorizados são recusados no servidor.
- [x] BYOK preserva os campos de cada provedor ao alternar.
- [x] Configurações do pedido contêm somente parâmetros públicos.
- [x] Retry conserva parâmetros; regeneração do chat usa a escolha atual.
- [x] Interface verificada em desktop/celular, três temas e até 320 px.
- [x] Validação local completa verde e diff revisado.
- [x] Documentação afetada atualizada.

## Arquivos alterados

- `docs/architecture.md`
- `docs/chapter-chat.md`
- `docs/decisions/0023-chat-reasoning-capabilities.md`
- `docs/styleguide.md`
- `docs/testing.md`
- `e2e/visual/chapter-chat.visual.ts`
- `e2e/visual/dialog-layout.visual.ts`
- `e2e/visual/fixtures/chapterChatService.ts`
- `functions/.env.example`
- `functions/src/assistedBook.mjs`
- `functions/src/chapterChatProvider.mjs`
- `functions/src/chatGeneration.d.mts`
- `functions/src/chatGeneration.mjs`
- `functions/src/generation.mjs`
- `functions/src/index.mjs`
- `functions/src/loreAnalysis.mjs`
- `functions/test/assistedBook.test.mjs`
- `functions/test/chapterChat.test.mjs`
- `functions/test/chapterChatProvider.test.mjs`
- `functions/test/chatGeneration.test.mjs`
- `functions/test/generation.test.mjs`
- `functions/test/loreAnalysis.test.mjs`
- `src/features/ai-assistant/components/BYOKSettingsDialog.tsx`
- `src/features/ai-assistant/components/ChapterChatPanel.tsx`
- `src/features/ai-assistant/hooks/useChapterChat.ts`
- `src/features/ai-assistant/index.ts`
- `src/features/ai-assistant/model/assistedBook.ts`
- `src/features/ai-assistant/model/byokConfig.ts`
- `src/features/ai-assistant/model/chatGeneration.ts`
- `src/features/ai-assistant/services/aiClient.ts`
- `src/features/ai-assistant/services/assistedBookService.ts`
- `src/features/ai-assistant/services/bookGenerationService.ts`
- `src/features/ai-assistant/services/byokStorage.ts`
- `src/features/ai-assistant/services/chapterChatService.ts`
- `src/features/ai-assistant/services/chatReasoningStorage.ts`
- `src/features/ai-assistant/tests/AISettingsPage.test.tsx`
- `src/features/ai-assistant/tests/BYOKSettingsDialog.test.tsx`
- `src/features/ai-assistant/tests/ChapterChatPanel.test.tsx`
- `src/features/ai-assistant/tests/aiClient.test.ts`
- `src/features/ai-assistant/tests/assistedBookService.test.ts`
- `src/features/ai-assistant/tests/byokStorage.test.ts`
- `src/features/ai-assistant/tests/chapterChatService.test.ts`
- `src/features/ai-assistant/tests/chatReasoningStorage.test.ts`
- `src/features/lore/model/loreAnalysis.ts`
- `src/features/lore/services/loreAnalysisService.ts`
- `docs/ai-provider-settings.md`
- `e2e/visual/ai-provider.visual.ts`

## Testes

| Testes                                                              | Tipo             | Comportamento verificado                                                  |
| ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| BYOKSettingsDialog, AISettingsPage                                  | Vitest/interface | Duas etapas, seleção, salvar, falhas, restauração e preservação de campos |
| byokStorage, chatReasoningStorage                                   | Vitest           | Migração, snapshot público, persistência e precedência do padrão          |
| aiClient, chapterChatService, ChapterChatPanel, assistedBookService | Vitest           | Parâmetros enviados, recuperação e geração em andamento                   |
| chatGeneration, chapterChat, chapterChatProvider                    | Node             | Lista autorizada, raciocínio, HTTP/SSE, limites e snapshots               |
| generation, assistedBook, loreAnalysis                              | Node             | Modelos efetivos, idempotência, retry e reparação em blocos               |
| ai-provider.visual.ts e cenário Provedor de dialog-layout.visual.ts | Playwright       | 12 cenários: temas, responsividade, persistência, BYOK e restauração      |
| Dois cenários de chapter-chat.visual.ts                             | Playwright       | 12 cenários: configuração solicitada/efetiva, regeneração e conversas     |

Saída real resumida de `npm run validate`:

```text
 Test Files  116 passed (116)
      Tests  861 passed (861)
All files          |   92.81 |    86.41 |   91.36 |   94.87 |
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ tests 91
ℹ pass 91
ℹ fail 0
Smoke test do bundle OK.
```

A cobertura global reportada acima está na ordem statements, branches,
functions e lines; os limites do projeto não foram reduzidos.

Saídas reais dos cenários visuais:

```text
12 passed (1.1m)
12 passed (1.3m)
```

## Validações executadas

| Comando                                                     | Resultado                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts` e `npm ci --prefix functions`     | Dependências instaladas na worktree                                                                                  |
| `npm run prepare`                                           | Hooks preparados e skills sincronizadas                                                                              |
| `npm run validate`                                          | Verde, incluindo arquitetura, docs, styleguide, formato, lint, cobertura, setup, Functions, typecheck, build e smoke |
| Playwright: ai-provider e cenário Provedor de dialog-layout | 12/12 verdes                                                                                                         |
| Playwright: parâmetros e raciocínio privado de chapter-chat | 12/12 verdes                                                                                                         |
| `git diff --check`                                          | Sem erros                                                                                                            |

Comandos visuais executados com `WRITER_VISUAL_PORT=4193`:

```sh
npx playwright test --config playwright.visual.config.ts ai-provider.visual.ts dialog-layout.visual.ts --grep 'configura Firebase|preferências de IA'
npx playwright test --config playwright.visual.config.ts chapter-chat.visual.ts --grep 'geração registra|raciocínio privado'
```

A revisão final verificou escopo, limites, ausência de credenciais nos snapshots,
fronteiras públicas entre features, compatibilidade e regras de débito.
O build passou com avisos sobre chunks grandes e import estático/dinâmico do
exportador DOCX; esse empacotamento não foi alterado nesta entrega.

## Fora do escopo

Modelos de capas, áudio/vídeo, novos provedores, mudança de preços/créditos e
sincronização de preferências entre dispositivos.

## Limitações e pendências conhecidas

- Implementação e validações locais; push, PR, CI remoto e deploy não executados.
  A definição de concluído do projeto ainda exige CI verde no PR.
- Não houve geração real paga nem verificação de acesso aos três modelos no
  projeto Firebase de produção. Verificar disponibilidade, quotas e Blaze antes
  da publicação; não há fallback silencioso entre modelos.
- A publicação deve coordenar Functions e frontend.
- Testes visuais usam rotas/componentes reais com serviços fictícios e rede
  externa bloqueada; a inspeção de screenshots cobriu desktop e 320 px.
- Preferências e credenciais BYOK continuam no perfil local do navegador.

## Como verificar manualmente

1. Abrir /settings/ai?tab=provider.
2. Escolher Firebase AI Logic, trocar modelo e raciocínio e salvar.
3. Recarregar e conferir que as escolhas permanecem.
4. Escolher BYOK; preencher Google e OpenAI e alternar entre eles.
5. Conferir preservação dos campos, salvar e recarregar.
6. Restaurar o padrão e conferir Gemini 3.8 Flash e Médio.
7. No editor, conferir modelo e raciocínio; conversas com escolha própria devem
   preservá-la, enquanto conversas novas Firebase recebem o padrão da aba.
8. Conferir temas claro, escuro e sépia e navegação por teclado.

## Integração em codex/writer-v2 — 2026-11-02

O commit de origem 83d7e7d foi aplicado sobre dadff70 sem substituir os
contratos próprios da Writer V2. Os conflitos em arquitetura, styleguide,
testes e lore foram conciliados preservando os dois conjuntos de documentação
e testes, a leitura autorizada de lore e as barreiras de escrita nativa.

O chat de cenas/blocos (EditorChatPanel) também passa a mostrar o modelo
selecionado no pedido e recupera modelo/raciocínio da aba Provedor ao voltar
de BYOK para Writer. Um teste de interface cobre esse retorno e um teste do
servidor cobre os três modelos com snapshot e replay sem nova geração.

Validação executada na branch de destino:

- Vitest em ai-assistant e no serviço de lore: 42 arquivos, 511 testes passaram.
- Após a adaptação, EditorChatPanel foi verificado novamente: 30 testes passaram.
- Functions afetadas, incluindo editorChatGeneration, com concorrência 2:
  119 testes passaram.
- Após incluir a prova de seleção no chat nativo, editorChatGeneration:
  22 testes passaram.
- Playwright ai-provider.visual.ts com WRITER_VISUAL_PORT=4195:
  6 cenários passaram, nos três temas, desktop/celular e até 320 px.
- Typecheck, arquitetura, documentação, styleguide, build do bundle e smoke:
  passaram. O build conserva avisos de tamanho de chunks/imports dinâmicos.
- Não houve conflitos restantes nem erros de whitespace.
- A validação completa da branch de origem permanece registrada acima.
  npm run validate não foi repetido integralmente na Writer V2; esta integração
  usa os testes dirigidos e checks listados, conforme o processo da branch.
- Nenhum push, PR, CI remoto ou deploy foi executado nesta integração.
