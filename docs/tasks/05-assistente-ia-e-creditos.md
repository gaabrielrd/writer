# Tarefa 05 — Assistente de IA e Gestão de Créditos

## Contexto

Escritores de ficção se beneficiam de sugestões criativas contextualizadas no lore de suas histórias. O sistema opera com tiers Free e Premium tarifados por consumo de créditos por sugestão aceita, com suporte a chave de API própria (BYOK).

## Objetivo

Implementar a feature `ai-assistant` contendo o cliente de integração com modelos de linguagem (Gemini / OpenAI), autocomplete preditivo em tempo real no editor (estilo copilot), menu de ações de estilo sob demanda, sistema de consumo de créditos atômico no Firestore e modal de configurações BYOK.

## Escopo

- Implementação da feature `src/features/ai-assistant`:
  - `model/aiPrompt.ts`: Montagem de prompt estruturado incluindo os últimos parágrafos do texto e o resumo das entidades de lore relevantes do livro.
  - `model/byokConfig.ts`: Tipagem e regras de validação para chaves próprias de API (OpenAI / Gemini).
  - `services/aiClient.ts`: Serviço de chamada à API de IA (via SDK do Firebase AI / Gemini ou fetch direto para OpenAI/Gemini com chave BYOK).
  - `services/creditsService.ts`: Serviço de débito e verificação de créditos no Firestore (`users/{uid}`).
  - `services/byokStorage.ts`: Repositório isolado para ler/gravar chave de API no `localStorage`.
  - `components/GhostSuggestion.tsx`: Renderizador da sugestão translúcida (ghost text) no editor após pausa na digitação.
  - `components/AIActionMenu.tsx`: Menu suspenso ou barra de ferramentas com ações rápidas: _Sugerir continuação de cena_, _Aprimorar sensorialidade/estilo_, _Revisar consistência com o lore_.
  - `components/OutOfCreditsDialog.tsx`: Modal exibido quando o saldo é zero e não há chave BYOK, orientando sobre recarga ou inclusão de chave própria.
  - `components/BYOKSettingsDialog.tsx`: Tela de configurações para salvar a chave de API própria do autor.
  - `hooks/useAIAutocomplete.ts`: Hook que monitora pausas na digitação (debounce de 600ms), dispara a chamada de IA, exibe o ghost text e intercepta a tecla `Tab` para aceitar (debitando 1 crédito) ou `Esc` para descartar (sem debitar crédito).
  - `tests/`: Testes de unidade para montagem de prompts, debounce, consumo de créditos e persistência de chave BYOK.
- Integração do hook `useAIAutocomplete` e dos componentes no `RichEditor` da feature `editor`.

## Não escopo

- Cobrança financeira real com cartão de crédito na V1.
- Geração de livros inteiros de forma não supervisionada.

## Critérios de aceite

- [x] Autor com créditos disponíveis pausa a digitação por mais de 600ms e recebe uma sugestão de continuação contextualizada em texto translúcido.
- [x] Pressionar `Tab` insere o texto sugerido no editor e debita exatamente 1 crédito do saldo do autor no Firestore.
- [x] Pressionar `Esc` ou continuar a digitação cancela a sugestão sem debitar nenhum crédito.
- [x] Menu de ações sob demanda permite selecionar texto e solicitar melhorias de estilo ou expansão de cena.
- [x] Quando o saldo de créditos chega a zero e não há chave BYOK, as chamadas de IA são pausadas e o modal `OutOfCreditsDialog` é oferecido sem interromper a digitação manual nem o salvamento.
- [x] Autor pode cadastrar sua chave de API nas configurações locais (BYOK); quando preenchida, as chamadas utilizam a chave informada e não consomem créditos do sistema.
- [x] Testes cobrem o comportamento observável do autocomplete, débito no aceite e descarte sem cobrança.

## Tarefas

- [x] 1. Gerar a feature `src/features/ai-assistant` (`npm run generate:feature -- --name="ai-assistant"`).
- [x] 2. Implementar os modelos de prompt contextual e tipos de configuração em `model/`.
- [x] 3. Implementar o serviço de chamadas de IA `aiClient.ts` e o repositório `byokStorage.ts`.
- [x] 4. Implementar o serviço de débito transacional de créditos em `creditsService.ts`.
- [x] 5. Construir o hook `useAIAutocomplete` com debounce e controle de teclado (`Tab` e `Esc`).
- [x] 6. Criar os componentes de interface (`GhostSuggestion`, `AIActionMenu`, `OutOfCreditsDialog`, `BYOKSettingsDialog`).
- [x] 7. Integrar o autocomplete e o menu de ações ao `RichEditor` da feature `editor`.
- [x] 8. Escrever testes em `src/features/ai-assistant/tests/`.
- [x] 9. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Latência e custo de chamadas contínuas de autocomplete: mitigar com debounce calibrado (600ms), cancelamento de requisições anteriores em andamento (`AbortController`) e prompt condensado.
