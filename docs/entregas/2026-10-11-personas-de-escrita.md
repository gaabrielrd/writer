# Personas de escrita por livro e capítulo

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Plano de origem**: plano aprovado na conversa

## Objetivo

Permitir que o autor defina instruções e personalidade para a assistência de
escrita, com uma base para o livro e um complemento para cada capítulo.

## Funcionalidades entregues

- **Configuração ampliada** — acesso à biblioteca de personas pelo modal de IA,
  mantendo as preferências de provedor, modelo e chave própria.
- **Seis personas padrão** — O Atmosférico, O Incisivo, O Íntimo, O Irônico,
  O Épico e O Inquietante, com instruções, valores iniciais e os seis avatares
  fornecidos em `public/img/persona`, visíveis na biblioteca e na seleção.
- **Biblioteca privada** — criar, editar, duplicar, arquivar e reativar personas;
  personalizar um padrão cria uma cópia. Revisões evitam sobrescrever edições
  feitas em outra janela.
- **Personalidade ajustável** — oito atributos padrão e até oito sliders próprios,
  com nome, significado, extremos e valores de 0 a 100. Definições próprias podem
  ser editadas e removidas.
- **Livro e capítulo** — seleção de base no livro e complementar no capítulo,
  herança de atributos, substituições explícitas e prévia das orientações efetivas.
- **Geração consistente** — autocomplete e ações de texto recebem a mesma
  composição nos três caminhos de provedor; mudanças de configuração invalidam
  sugestões anteriores. Texto e cobrança continuam dependendo do aceite.
- **Backup privado** — JSON versão 3 preserva definições utilizadas, vínculos e
  ajustes; PDF, DOCX, Markdown e publicação não incluem os prompts.

## Critérios de aceite

- [x] Configuração abrangente acessível pelo menu existente, em modal.
- [x] Seis personas padrão disponíveis e protegidas de edição direta.
- [x] Seis avatares fornecidos pelo autor carregam na biblioteca e na seleção.
- [x] Instruções permanentes, sliders padrão e personalizados persistidos.
- [x] Personas privadas isoladas por conta, com revisão transacional.
- [x] Persona opcional por livro e complementar opcional por capítulo.
- [x] Composição explícita de prompts, herança e substituições de atributos.
- [x] Autocomplete e ações enviam as orientações e descartam resultados antigos.
- [x] Livros sem persona preservam a assistência anterior.
- [x] Interface operável por teclado, nos três temas e em 320 px.
- [x] Testes, revisão do diff e documentação local realizados.

## Arquivos alterados

| Arquivo ou grupo                                                                       | Mudança                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/features/ai-assistant/model/persona.ts`                                           | Esquema, seis padrões, validações e composição.                         |
| `src/features/ai-assistant/services/personaService.ts` e `hooks/usePersonaLibrary.ts`  | Persistência privada, revisão e atualização entre abas.                 |
| `src/features/ai-assistant/components/PersonaManager.tsx` e `PersonaBindingDialog.tsx` | Biblioteca, edição, sliders e vínculos.                                 |
| Configuração, prompts, `AIActionMenu` e `useAIAutocomplete`                            | Integração e invalidação de resultados.                                 |
| `src/features/books` e `src/features/editor`                                           | Metadados, seleção, resumo e backup JSON.                               |
| `src/shared/ui/Slider.tsx`, estilos, `Dialog.tsx`, `StyleguidePage.tsx`                | Controle acessível e modais que se ajustam ao redimensionamento.        |
| `firestore.rules` e `tests/firestore/personas.rules.test.mjs`                          | Privacidade, vínculos, revisão e limites.                               |
| Testes das features e `e2e/visual/personas.visual.ts`                                  | Cobertura do comportamento e serviços fictícios.                        |
| `e2e/styleguide.spec.ts`                                                               | Demonstração do Slider com teclado.                                     |
| `docs/ai-personas.md`, arquitetura, testes e styleguide                                | Comportamento, contratos e verificação.                                 |
| `AGENTS.md`                                                                            | Inclui Slider nas regras de formulário; `CLAUDE.md` permanece coerente. |

## Testes

| Teste                                                                    | Tipo               | O que cobre                                                                          |
| ------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| `persona.test.ts`, `personaService.test.ts`, `usePersonaLibrary.test.ts` | Unidade            | Padrões, composição, limites, revisão e troca de conta.                              |
| `PersonaManager.test.tsx`, `PersonaBindingDialog.test.tsx`               | Componente         | Criação, edição de atributos, erro, duplicação, arquivo e herança.                   |
| `aiPrompt`, `aiClient`, `AIActionMenu`, `useAIAutocomplete`              | Unidade/componente | Envio das instruções, formato e descarte de resultados antigos.                      |
| `bookService`, `BookPage`, `EditorPage`, `exportManuscript`              | Unidade/componente | Vínculos, assinaturas, retentativas, conservação da escrita e backup.                |
| `personas.rules.test.mjs` e suíte de regras existente                    | Emulador           | Acesso privado, 16 atributos, valores inválidos, revisão e vínculos por autor.       |
| Personas, diálogos e ajustes do editor                                   | Navegador          | Teclado, 320 px, três temas, biblioteca e prompts sem alterar texto antes do aceite. |
| Suíte E2E de produção                                                    | Navegador          | Navegação, persistência de temas e Slider no modal do styleguide.                    |

Saída real da validação final, incluindo os avatares:

```text
Test Files  86 passed (86)
Tests  604 passed (604)
Functions    : 90.98% ( 1232/1354 )
```

## Validações executadas

| Comando                                                                                                                                                             | Resultado                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions`                                                                                                                                         | Dependências instaladas; auditoria com zero vulnerabilidades.                                                           |
| `npm run validate`                                                                                                                                                  | Verde: skills, arquitetura, documentação, styleguide, formato, lint, cobertura, setup, backend, tipagem, build e smoke. |
| `npm run test:rules`                                                                                                                                                | 40 testes aprovados.                                                                                                    |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/personas.visual.ts e2e/visual/editor-adjustments.visual.ts e2e/visual/dialog-layout.visual.ts` | 66 testes aprovados.                                                                                                    |
| `npm run test:e2e`                                                                                                                                                  | 6 aprovados; 1 snapshot ignorado por ausência de referência Windows.                                                    |
| `git diff --check`                                                                                                                                                  | Sem erros de whitespace.                                                                                                |

```text
Smoke test do bundle OK.
ℹ tests 40
ℹ pass 40
ℹ fail 0
66 passed (3.2m)
1 skipped
6 passed (17.2s)
```

Os testes visuais de personas foram inspecionados também por captura de tela.
Após integrar os avatares, a suíte específica de personas foi executada novamente
nos seis projetos: `12 passed (1.4m)`. Ela verifica o carregamento real de cada PNG
e a apresentação da persona selecionada no livro e no capítulo.
O Slider está demonstrado no modal do styleguide, mantendo a página fechada
compatível com a referência visual existente. Limites de cobertura foram
preservados; nenhum pacote novo foi adicionado.

## Fora do escopo

Personas para geração completa de livros, capas, sinopses ou extração estruturada
de lore; publicação das instruções; restaurador completo de manuscritos JSON.
Alterações locais preexistentes em fontes e skills foram preservadas. Os seis
avatares fornecidos pelo autor foram integrados sem modificar os arquivos PNG.

## Limitações e pendências conhecidas

- Implantar `firestore.rules` junto da aplicação antes de usar a persistência em
  produção. Não houve implantação nesta tarefa.
- A adesão literária depende do modelo; os testes confirmam o envio e os fluxos,
  sem consumir provedores reais.
- Build aprovado com avisos de tamanho de bundle e importação dinâmica de DOCX.
- O snapshot completo do styleguide não roda em Windows sem referência própria;
  contratos visuais, teclado e temas foram verificados.
- PR e CI remoto não foram executados nesta entrega local; esses itens
  da definição de concluído permanecem pendentes.

## Como verificar manualmente

1. Abra **Configurar inteligência artificial → Personas de escrita**. Consulte os
   seis padrões com seus avatares e personalize um deles.
2. Ajuste os oito atributos, crie um slider próprio e salve. Reabra para conferir
   instruções, definições e valores. Duplique, arquive e reative a persona.
3. Em **Opções do livro → Persona de IA**, selecione a base.
4. No editor, abra **Persona do capítulo**, selecione a complementar e defina
   um atributo no capítulo. Consulte **Orientações efetivas**.
5. Gere uma continuação ou uma revisão. O texto permanece intacto até o aceite.
   Modifique a configuração e confirme que a sugestão anterior desaparece.
6. Exporte JSON e confira versão 3, personas utilizadas e vínculos. Exporte um
   formato de leitura e confira que as instruções permanecem privadas.
7. Abra `/styleguide`, use **Abrir Modal de Demonstração** e ajuste o Slider com
   as setas, Home e End; repita nos temas Claro, Escuro e Sépia.

## Incremento de interface — 2026-10-11

Este incremento substitui a configuração geral em modal por uma página própria
e concentra o gerenciamento contextual no botão **Persona** do capítulo.

### Funcionalidades e critérios de aceite

- [x] `/settings/ai` oferece abas **Personas** e **Provedor**, seguindo o padrão
      dos detalhes de livro, com seleção na URL e navegação por teclado.
- [x] Personas são exibidas em uma lista com avatar, nome, descrição, origem e
      quantidade de atributos. Clicar abre os detalhes.
- [x] Os detalhes apresentam avatar, direção de escrita e mapa de personalidade:
      ícones Lucide, barras de intensidade, valores, extremos e hierarquia de textos.
      O grid usa duas colunas no desktop e uma em telas pequenas.
- [x] Detalhes e edição compartilham um único modal; fechar devolve o foco ao
      controle de origem. Ações de detalhes usam duas colunas no celular.
- [x] O botão do editor foi renomeado para **Persona**. Ele reúne as abas
      **Capítulo**, **Livro** e **Biblioteca**, com seleção, criação, edição,
      orientações efetivas, erros e retentativas no mesmo modal.
- [x] A faixa de personas foi removida do editor. O gerenciamento contextual
      não navega para outra página, não aninha modais e não altera o manuscrito.
- [x] O link de retorno da configuração geral preserva a origem, inclusive
      livro/editor. A aba Provedor e suas preferências sobrevivem ao recarregamento.

### Arquivos do incremento

| Arquivo ou grupo                                                                      | Mudança                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/app/routes/index.tsx`, `AISettingsProvider.tsx`, `AISettingsPage.tsx`            | Rota, navegação com retorno e abas.                                                  |
| `BYOKSettingsDialog.tsx`                                                              | Reaproveita o formulário de provedor na página.                                      |
| `PersonaManager.tsx`, `PersonaTraits.tsx`, `PersonaAvatar.tsx`, `Personas.module.css` | Lista, detalhes gráficos, edição e apresentação responsiva.                          |
| `ChapterPersonaDialog.tsx`, `PersonaBindingDialog.tsx`                                | Gerenciamento contextual com um único modal ativo.                                   |
| `EditorPage.tsx` e seus estilos                                                       | Botão Persona, remoção da faixa e recuperação de foco.                               |
| Testes das features e `e2e/visual`                                                    | Abas, detalhes, persistência, retorno, teclado, fluxo contextual e texto preservado. |
| `docs/ai-personas.md`, arquitetura, styleguide e testes                               | Documentação do comportamento atual.                                                 |

### Verificação executada

- `npm run validate`: verde, incluindo lint, cobertura, tipagem, backend, build e smoke.
- Suíte visual de personas, diálogos e análise de lore: **54 aprovados**, nos
  três temas, desktop/celular e 320 px.
- Suíte visual geral do Writer em desktop escuro: **21 aprovados**.
- E2E de produção: **6 aprovados** e **1 snapshot ignorado**, por ausência de
  referência Windows. Capturas da lista, detalhes e editor foram inspecionadas.

```text
Test Files  88 passed (88)
Tests  607 passed (607)
Functions    : 91.28% ( 1247/1366 )
Smoke test do bundle OK.
54 passed (3.3m)
21 passed (1.1m)
1 skipped
6 passed (19.2s)
```

A preparação dos testes visuais foi corrigida: cada teste já usa um contexto
de navegador limpo, portanto suas preferências não devem ser apagadas a cada
reload. O teste confirma o provedor e a chave fictícia após recarregar a página.
As regras do Firestore e os contratos de geração não foram alterados por este
incremento. PR, CI remoto e implantação continuam pendentes.

### Conferência manual atualizada

1. Abra **Configurar inteligência artificial** no menu do usuário. Alterne as
   abas e clique numa linha da lista para consultar ou personalizar uma persona.
2. No capítulo, abra **Persona**. Ajuste a base na aba **Livro** e a complementar
   na aba **Capítulo**; use **Salvar vínculo** para persistir cada alteração.
3. Na aba **Biblioteca**, consulte, crie ou edite uma persona sem sair do capítulo.
   Feche os detalhes para voltar à lista, ou feche o gerenciamento para escrever.
4. Confira que o manuscrito permanece intacto e que o editor não possui a faixa
   de personas abaixo do cabeçalho.
