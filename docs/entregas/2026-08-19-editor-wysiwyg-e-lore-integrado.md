# Entrega: Editor WYSIWYG e Lore Integrado

- **Data**: 2026-08-19
- **Origem**: [docs/tasks/04-editor-wysiwyg-e-lore-integrado.md](../tasks/04-editor-wysiwyg-e-lore-integrado.md)
- **Status**: Concluída

---

## 1. Funcionalidades Entregues

- **Ambiente de Escrita WYSIWYG para Ficção**:
  - Editor rico com suporte a marcação semântica rápida (Títulos H1 `#`, Subtítulos H2 `##`, Negrito `**`, Itálico `*`, Citações `>`, Travessão de diálogo `—` e Menções `@`).
  - Suporte a atalhos de teclado no editor (`Ctrl+B` / `Cmd+B` para negrito, `Ctrl+I` / `Cmd+I` para itálico).
  - Alternância instantânea entre modo de escrita ativa e modo de leitura com lore anotado.
- **Detecção e Destaque Dinâmico de Lore em Tempo Real**:
  - Identificação de entidades e apelidos (aliases) do universo no corpo do texto com algoritmo ponderado de intervalos do `loreMatcher`.
  - Sublinhado destacado das menções sem alterar o fluxo de digitação.
  - Balão informativo (`LoreTooltip`) ao passar o cursor sobre menções no texto, exibindo categoria com badge colorida, título e resumo de 140 caracteres.
  - Barra de pílulas no topo listando todas as entidades presentes no capítulo com contagem de repetições e clique direto para abrir a ficha.
- **Menu Flutuante de Menção Rápida (`@`)**:
  - Inserção de menções de lore pelo caractere `@` com busca instantânea por nome ou alias.
  - Navegação de opções por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`) ou clique.
- **Painel Lateral Retrátil de Lore (`EditorLoreSidebar`)**:
  - Drawer lateral para consulta, busca e filtragem por categorias de lore sem sair da página do capítulo.
  - Abertura de fichas detalhadas (`LoreDrawer`) e criação/edição direta de entidades (`LoreEntityForm`).
- **Salvamento Automático com Debounce (1s) e Navegação Sequencial**:
  - Hook `useAutoSave` com debounce de 1000ms após pausa na digitação e salvamento manual imediato.
  - Indicador em tempo real do estado de sincronização (`Salvando...`, `Salvo`, `Não salvo`, `Erro ao salvar`).
  - Contagem dinâmica de palavras do capítulo persistida no Firestore.
  - Navegação sequencial rápida entre capítulos adjacentes do mesmo livro.
- **Ponto de Entrada Integrado**:
  - Botão "Escrever" adicionado à listagem de capítulos (`ChapterList`) em cada livro.
  - Rota `/books/:bookId/editor/:chapterId` configurada e protegida por autenticação.

---

## 2. Critérios de Aceite Atendidos

- [x] O autor consegue formatar o texto com títulos, negrito, itálico e parágrafos de diálogo.
- [x] Qualquer termo ou apelido cadastrado no lore é automaticamente sublinhado/destacado de forma não intrusiva durante a digitação.
- [x] Ao passar o mouse sobre o termo destacado, o `LoreTooltip` exibe a categoria, nome e resumo da entidade.
- [x] Ao clicar no termo ou em um botão na barra de ferramentas, o `EditorLoreSidebar` abre exibindo a ficha completa e permitindo edições.
- [x] Ao digitar `@`, um menu flutuante permite buscar e selecionar entidades com `Enter` ou clique, inserindo o nome selecionado no texto.
- [x] O conteúdo do capítulo é salvo automaticamente no Firestore com debounce de 1 segundo após pausa na digitação, com feedback visual claro ("Salvando..." / "Salvo").
- [x] Testes cobrem o comportamento observável do editor, inserção de menções e o fluxo de salvamento automático.

---

## 3. Arquivos Criados ou Alterados

- `src/features/editor/model/editorState.ts`: Modelos de estado do editor, status de salvamento e menções.
- `src/features/editor/model/index.ts`: Exportações de modelos do editor.
- `src/features/editor/services/chapterContentStorage.ts`: Persistência de conteúdo e contagem de palavras no Firestore.
- `src/features/editor/services/index.ts`: Exportações de serviços do editor.
- `src/features/editor/hooks/useAutoSave.ts`: Hook de salvamento com debounce de 1s e rastreamento de status.
- `src/features/editor/components/MentionMenu.tsx` & `.module.css`: Menu flutuante de menções `@`.
- `src/features/editor/components/EditorLoreSidebar.tsx` & `.module.css`: Painel lateral retrátil de compêndio de lore.
- `src/features/editor/components/RichEditor.tsx` & `.module.css`: Editor de escrita com barra de ferramentas e renderização de lore.
- `src/features/editor/components/EditorPage.tsx` & `.module.css`: Página completa do editor (`/books/:bookId/editor/:chapterId`).
- `src/features/editor/index.ts`: Ponto de entrada público da feature `editor`.
- `src/features/lore/index.ts` & `src/features/lore/services/index.ts`: Re-exportação aprimorada de serviços.
- `src/features/books/components/ChapterList.tsx`: Botão de escrita rápida para navegação direta ao editor.
- `src/app/routes/index.tsx`: Registro da rota do editor.
- `src/features/editor/tests/chapterContentStorage.test.ts`: Testes do serviço de armazenamento.
- `src/features/editor/tests/useAutoSave.test.ts`: Testes do hook de salvamento automático.
- `src/features/editor/tests/MentionMenu.test.tsx`: Testes de interação e teclado do menu de menção.
- `src/features/editor/tests/EditorLoreSidebar.test.tsx`: Testes da barra lateral e formulários integrados.
- `src/features/editor/tests/RichEditor.test.tsx`: Testes de digitação, atalhos, modo de leitura e tooltips.
- `src/features/editor/tests/EditorPage.test.tsx`: Testes da tela de escrita, carregamento e navegação de capítulos.
- `docs/tasks/04-editor-wysiwyg-e-lore-integrado.md`: Documentação e checklist da tarefa.
- `tasks.md`: Atualização do backlog geral.

---

## 4. Testes e Validações

### Testes Automatizados

- **Test Files**: 32 passed (32)
- **Tests**: 124 passed (124)
- **Coverage**:
  - Statements: 95.16% (>85%)
  - Branches: 78.18% (>75%)
  - Functions: 95.12% (>90%)
  - Lines: 96.78% (>85%)

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
124 tests passed across 32 suites. Coverage thresholds satisfied.

> writer-assistant@0.0.0 build
Typecheck, bundle e smoke build OK.
```

---

## 5. Fora de Escopo e Próximos Passos

- Integração com Gemini API / Firebase AI Logic para sugestões de enredo e autocomplete preditivo em tempo real (Tarefa 05).
- Gestão de créditos com consumo por sugestão aceita (Tarefa 05).
- Leitor público com páginas personalizáveis para livros publicados (Tarefa 06).
- Exportações para PDF e DOCX (Tarefa 07).
