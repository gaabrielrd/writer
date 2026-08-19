# Tarefa 04 — Editor WYSIWYG e Lore Integrado

## Contexto

A experiência central de escrita do **Writer Assistant** combina um editor de texto rico com o compêndio de lore: ao escrever, termos cadastrados são automaticamente identificados, balões informativos aparecem no hover, o autor pode inserir menções rápidas via `@` e a barra lateral permite consultar e editar fichas sem perder o foco do texto.

## Objetivo

Implementar a feature `editor` com editor WYSIWYG para os capítulos, detecção em tempo real e destaque de termos de lore, menu de menções `@`, tooltips informativos, sidebar de consulta/edição rápida de entidades e salvamento automático com debounce no Cloud Firestore.

## Escopo

- Implementação da feature `src/features/editor`:
  - `model/editorState.ts`: Estrutura de conteúdo rico do capítulo, status de salvamento (`saved`, `saving`, `unsaved`), e lista de marcações de lore ativas.
  - `services/chapterContentStorage.ts`: Serviço com debounce para persistir o conteúdo e contagem de palavras do capítulo no Firestore (`books/{bookId}/chapters/{chapterId}`).
  - `components/EditorPage.tsx`: Tela de escrita do capítulo (`/books/:bookId/editor/:chapterId`) contendo cabeçalho com status de salvamento, seletor/navegador de capítulos e área de escrita.
  - `components/RichEditor.tsx`: Componente de edição rica (títulos, negrito, itálico, citações, diálogos) com marcação visual sutil sobre termos casados pelo `loreMatcher`.
  - `components/MentionMenu.tsx`: Menu suspenso flutuante acionado ao digitar `@` com busca instantânea de entidades e inserção direta no texto.
  - `components/EditorLoreSidebar.tsx`: Painel lateral retrátil integrado ao editor para visualizar e editar as fichas do compêndio sem sair da página.
  - `hooks/useAutoSave.ts`: Hook para salvamento automático periódico e na perda de foco com indicação visual de status.
  - `tests/`: Testes de unidade e componentes cobrindo digitação, salvamento automático, menções `@`, exibição de tooltips e acionamento da sidebar.
- Registro da rota `/books/:bookId/editor/:chapterId` em `src/app/routes/index.tsx`.

## Não escopo

- Autocomplete preditivo de IA e menu de ações sob demanda de IA (Tarefa 05).
- Exportações para PDF/DOCX (Tarefa 07).

## Critérios de aceite

- [ ] O autor consegue formatar o texto com títulos, negrito, itálico e parágrafos de diálogo.
- [ ] Qualquer termo ou apelido cadastrado no lore é automaticamente sublinhado/destacado de forma não intrusiva durante a digitação.
- [ ] Ao passar o mouse sobre o termo destacado, o `LoreTooltip` exibe a categoria, nome e resumo da entidade.
- [ ] Ao clicar no termo ou em um botão na barra de ferramentas, o `EditorLoreSidebar` abre exibindo a ficha completa e permitindo edições.
- [ ] Ao digitar `@`, um menu flutuante permite buscar e selecionar entidades com `Enter` ou clique, inserindo o nome selecionado no texto.
- [ ] O conteúdo do capítulo é salvo automaticamente no Firestore com debounce de 1 segundo após pausa na digitação, com feedback visual claro ("Salvando..." / "Salvo").
- [ ] Testes cobrem o comportamento observável do editor, inserção de menções e o fluxo de salvamento automático.

## Tarefas

- [ ] 1. Gerar a feature `src/features/editor` (`npm run generate:feature -- --name="editor"`).
- [ ] 2. Implementar a estrutura de estado e autosave em `src/features/editor/model/` e `hooks/useAutoSave.ts`.
- [ ] 3. Construir o componente `RichEditor` com suporte a marcação semântica de lore e atalhos de teclado.
- [ ] 4. Integrar o motor `loreMatcher` da feature `lore` para destacar termos dinamicamente no conteúdo.
- [ ] 5. Implementar o componente `MentionMenu` para inserção com `@`.
- [ ] 6. Integrar a sidebar retrátil `EditorLoreSidebar` permitindo consultar e editar fichas diretamente na tela de escrita.
- [ ] 7. Criar a página `EditorPage` e registrar a rota `/books/:bookId/editor/:chapterId`.
- [ ] 8. Escrever testes automatizados em `src/features/editor/tests/`.
- [ ] 9. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Preservação do cursor/seleção durante a aplicação de destaques de lore: garantir que a renderização dos destaques ocorra de maneira compatível com o fluxo de edição do browser sem reiniciar o foco do cursor.
