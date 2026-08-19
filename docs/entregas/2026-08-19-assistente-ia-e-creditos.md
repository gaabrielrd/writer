# Entrega: Assistente de IA e Gestão de Créditos

- **Data**: 2026-08-19
- **Origem**: [docs/tasks/05-assistente-ia-e-creditos.md](../tasks/05-assistente-ia-e-creditos.md)
- **Status**: Concluída

---

## 1. Funcionalidades Entregues

- **Integração com Firebase AI Logic (Gemini 3.7 Flash) & Firebase App Check**:
  - Configuração do serviço de IA nativo com backend `GoogleAIBackend` (`firebase/ai`).
  - Suporte ao modelo `gemini-3.7-flash` para geração de continuações fluidas e contextualizadas.
  - Inicialização segura do Firebase App Check com chave de site reCAPTCHA Enterprise (`firebase/app-check`).
- **Autocomplete Preditivo em Tempo Real (Estilo Copilot)**:
  - Hook `useAIAutocomplete` com monitoramento de pausas na digitação (debounce de 600ms).
  - Cancelamento transparente de requisições anteriores em andamento via `AbortController`.
  - Sugestão translúcida (`GhostSuggestion`) exibida diretamente no editor abaixo do cursor.
  - Interceptação da tecla `Tab` para inserir o texto sugerido e debitar exatamente 1 crédito do saldo do autor no Firestore.
  - Interceptação da tecla `Esc` ou continuação da digitação manual para descartar a sugestão sem cobrança de créditos.
- **Menu de Ações Criativas de IA Sob Demanda (`AIActionMenu`)**:
  - _Continuar Cena_: Expande a narrativa e desenvolve diálogos e tensão narrativa mantendo tom e personagens.
  - _Aprimorar Estilo & Sensorialidade_: Reescreve trecho selecionado elevando ritmo da prosa e riqueza descritiva.
  - _Coerência com Lore_: Analisa a compatibilidade do trecho com as fichas cadastradas no compêndio do livro.
  - _Instrução Personalizada_: Campo de texto livre para direcionar o modelo conforme a necessidade do escritor.
  - Opções para inserir no texto, substituir a seleção ativa ou copiar para a área de transferência.
- **Gestão Atômica de Créditos de IA (`creditsService`)**:
  - Saldo de créditos persistido e debitado com transações atômicas (`runTransaction`) no documento `users/{uid}`.
  - Bloqueio automático de chamadas quando o saldo atinge zero sem interromper a digitação manual nem o salvamento de capítulos.
  - Modal informativo `OutOfCreditsDialog` orientando sobre recarga ou uso de chave própria.
- **Suporte Completo a BYOK (Bring Your Own Key)**:
  - Repositório local isolado `byokStorage` para chaves pessoais de API.
  - Suporte a chaves da Google Gemini API (AI Studio) e OpenAI API.
  - Quando uma chave BYOK está ativa, as chamadas são ilimitadas e não consomem créditos da plataforma.
  - Modal `BYOKSettingsDialog` acessível pela barra de ferramentas do editor para gerenciar chaves e modelos customizados.

---

## 2. Critérios de Aceite Atendidos

- [x] Autor com créditos disponíveis pausa a digitação por mais de 600ms e recebe uma sugestão de continuação contextualizada em texto translúcido.
- [x] Pressionar `Tab` insere o texto sugerido no editor e debita exatamente 1 crédito do saldo do autor no Firestore.
- [x] Pressionar `Esc` ou continuar a digitação cancela a sugestão sem debitar nenhum crédito.
- [x] Menu de ações sob demanda permite selecionar texto e solicitar melhorias de estilo ou expansão de cena.
- [x] Quando o saldo de créditos chega a zero e não há chave BYOK, as chamadas de IA são pausadas e o modal `OutOfCreditsDialog` é oferecido sem interromper a digitação manual nem o salvamento.
- [x] Autor pode cadastrar sua chave de API nas configurações locais (BYOK); quando preenchida, as chamadas utilizam a chave informada e não consomem créditos do sistema.
- [x] Testes cobrem o comportamento observável do autocomplete, débito no aceite e descarte sem cobrança.

---

## 3. Arquivos Criados ou Alterados

- `src/features/ai-assistant/model/aiPrompt.ts`: Montagem de prompts estruturados com contexto de lore e recentes parágrafos.
- `src/features/ai-assistant/model/byokConfig.ts`: Modelos de dados e validação de chaves BYOK.
- `src/features/ai-assistant/model/index.ts`: Exportação pública dos modelos.
- `src/features/ai-assistant/services/byokStorage.ts`: Persistência isolada no localStorage para chaves de API.
- `src/features/ai-assistant/services/creditsService.ts`: Gestão transacional de créditos no Firestore.
- `src/features/ai-assistant/services/aiClient.ts`: Cliente de IA suportando Firebase AI Logic (Gemini 3.7 Flash), Gemini direto e OpenAI.
- `src/features/ai-assistant/services/index.ts`: Exportação pública dos serviços.
- `src/features/ai-assistant/hooks/useAIAutocomplete.ts`: Hook de autocomplete preditivo com debounce e débito no aceite.
- `src/features/ai-assistant/components/GhostSuggestion.tsx` & `.module.css`: Componente de sugestão visual inline.
- `src/features/ai-assistant/components/AIActionMenu.tsx` & `.module.css`: Menu e modal de ações criativas de IA.
- `src/features/ai-assistant/components/OutOfCreditsDialog.tsx` & `.module.css`: Modal de alerta para créditos esgotados.
- `src/features/ai-assistant/components/BYOKSettingsDialog.tsx` & `.module.css`: Modal de preferências de IA e chaves BYOK.
- `src/features/ai-assistant/index.ts`: Ponto de entrada público da feature `ai-assistant`.
- `src/features/editor/components/RichEditor.tsx`: Integração do autocomplete preditivo, menu de IA e diálogos no editor.
- `src/features/editor/components/EditorPage.tsx`: Integração do saldo de créditos e usuário autenticado com o editor.
- `src/shared/config/env.ts` & `src/shared/lib/firebase.ts`: Inicialização de App Check e Firebase AI.
- `src/features/ai-assistant/tests/aiPrompt.test.ts`: Testes do construtor de prompts.
- `src/features/ai-assistant/tests/byokConfig.test.ts`: Testes de validação de configurações BYOK.
- `src/features/ai-assistant/tests/byokStorage.test.ts`: Testes de persistência de chaves locais.
- `src/features/ai-assistant/tests/creditsService.test.ts`: Testes de débito transacional e adição de créditos.
- `src/features/ai-assistant/tests/aiClient.test.ts`: Testes de integração de provedores Firebase AI, Gemini e OpenAI.
- `src/features/ai-assistant/tests/useAIAutocomplete.test.ts`: Testes do hook de autocomplete preditivo.
- `src/features/ai-assistant/tests/GhostSuggestion.test.tsx`: Testes do componente de ghost suggestion.
- `src/features/ai-assistant/tests/OutOfCreditsDialog.test.tsx`: Testes do modal de créditos esgotados.
- `src/features/ai-assistant/tests/BYOKSettingsDialog.test.tsx`: Testes do formulário de chaves BYOK.
- `src/features/ai-assistant/tests/AIActionMenu.test.tsx`: Testes do menu e ações criativas.
- `src/features/editor/tests/RichEditor.test.tsx`: Testes de atalhos e integração de IA no editor.
- `src/features/editor/tests/EditorPage.test.tsx`: Testes da página do editor com autenticação e créditos.
- `docs/tasks/05-assistente-ia-e-creditos.md`: Checklist e critérios atualizados.
- `tasks.md`: Backlog atualizado.

---

## 4. Testes e Validações

### Testes Automatizados

- **Test Files**: 42 passed (42)
- **Tests**: 166 passed (166)
- **Coverage**:
  - Statements: 93.31% (>85%)
  - Branches: 78.03% (>75%)
  - Functions: 92.94% (>90%)
  - Lines: 94.91% (>85%)

### Validação Completa (`npm run validate`)

```text
> writer-assistant@0.0.0 check:skills
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).

> writer-assistant@0.0.0 check:architecture
Verificação arquitetural OK.

> writer-assistant@0.0.0 check:docs
Validação da documentação OK.

> writer-assistant@0.0.0 check:styleguide
Verificação do styleguide OK.

> writer-assistant@0.0.0 format:check
All matched files use Prettier code style!

> writer-assistant@0.0.0 lint
Passed with 0 errors and 0 warnings.

> writer-assistant@0.0.0 test
166 tests passed across 42 suites. Coverage thresholds satisfied.

> writer-assistant@0.0.0 build
Typecheck, bundle e smoke build OK.
```

---

## 5. Fora de Escopo e Próximos Passos

- Leitor público com páginas personalizáveis para livros publicados (Tarefa 06).
- Exportações para PDF e DOCX (Tarefa 07).
