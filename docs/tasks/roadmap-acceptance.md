# Revisão de aceite do roadmap 01–08

Esta revisão confronta os critérios já comprometidos no PRD e nas tarefas com o
código, sem acrescentar colaboração, marketplace, pagamentos ou publicação
automática. Os checkboxes antigos, isoladamente, não comprovavam o aceite.

| Tarefa                | Entrega ou correção                                                                                                                                                  | Evidência de comportamento                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Auth/Firebase    | Perfil transacional, sessão e saldo reativos, cache persistente; nenhuma cota fictícia em falha                                                                      | `authService.test.ts`, `AuthProvider.test.tsx`, `AuthButton.test.tsx`, `AuthorBookRoute.test.tsx`, testes reais de créditos no emulador                                                                        |
| 02 — Livros/capítulos | CRUD existente preservado; totais de texto renderizado, exclusão de lore/revisões e compatibilidade de livros publicados antigos                                     | `bookService.test.ts`, `chapter.test.ts`, `BookPage.test.tsx`, regras de exclusão e livro legado                                                                                                               |
| 03 — Compêndio        | Ficha estruturada sem perda da ficha livre; descrição de relações; privacidade revoga publicação atomicamente                                                        | `LoreEntityForm.test.tsx`, `loreService.test.ts`, `loreMatcher.test.ts`, testes reais de consentimento/replay                                                                                                  |
| 04 — Editor           | WYSIWYG real, destaques durante edição, fiche completa, menção por nome/apelido/categoria e criação; fila de gravação, recuperação explícita e proteção de navegação | `RichEditor.test.tsx`, `richDocument.test.ts`, `EditorLoreSidebar.test.tsx`, `EditorPage.test.tsx`, `useAutoSave.test.ts`, `chapterContentStorage.test.ts`, `BusyNavigationGuard.test.tsx`, `writer.visual.ts` |
| 05 — IA/créditos      | Cobrança somente no aceite único; cancelamento/stale results; seleção preservada; BYOK; saldo sincronizado e concessão mensal autorizada no servidor                 | Suíte `ai-assistant/tests`, `RichEditorAIAdapter.test.tsx`, regras de criação/débito/renovação/direitos administrativos                                                                                        |
| 06 — Leitor           | Rota anônima, versões públicas permitidas, navegação/histórico/setas, temas, balões públicos, revogação e falhas                                                     | `ReaderView.test.tsx`, `publicBookService.test.ts`, `publicationService.test.ts`, `reader.publication.visual.ts`, regras reais de publicação                                                                   |
| 07 — Exportação       | Markdown e DOCX reais; impressão isolada para PDF; capítulo/livro e conteúdo ainda não salvo; JSON privado do livro completo (RN-05)                                 | `exports.test.ts`, `exportManuscript.test.ts`, `exportPdf.test.ts`, `ExportButton.test.tsx`, `exports.visual.ts`; DOCX renderizado para inspeção                                                               |
| 08 — Redesign         | Estúdio caramelo/café, três temas, kit e responsividade preservados                                                                                                  | Gate visual existente e novos cenários desktop/mobile nos mesmos temas; referência Linux do styleguide preservada                                                                                              |

## Limites e implantação

- A evidência final de validação integrada e CI é registrada na entrega; a
  existência de um teste não equivale a uma execução bem-sucedida.
- O PDF usa **Imprimir / Salvar como PDF** do navegador. O aplicativo não salva
  um arquivo PDF silenciosamente nem controla a confirmação do diálogo nativo.
- As regras e o aplicativo precisam de implantação coordenada pelo operador.
  Livros antigos não são publicados automaticamente. Veja
  [segurança da publicação](../publication-security.md).
- A renovação Premium exige direito administrativo independente do perfil
  legado. Direitos e saldos antigos precisam de auditoria do operador. Nenhuma
  concessão ou reconciliação de conta real faz parte desta entrega.
- O saldo de produto não constitui um backend de cobrança das chamadas diretas
  à IA. Cobrança real/pagamentos permanecem fora do escopo original.
- O matcher usa busca binária de predecessores. Medições locais em capítulo de
  15.000 palavras tiveram mediana aquecida de 8,13 ms, com variação até 164 ms no
  ambiente compartilhado. Isso não é uma garantia de latência abaixo de 50 ms
  em todos os dispositivos ou sob carga; a meta de desempenho permanece uma
  referência de produto, não um teste temporal instável.
- O parser preserva Markdown legado e HTML de prosa permitido. Scripts, estilos,
  embeds e imagens remotas não são executados; imagens viram texto alternativo.
  Conteúdo inicial não é regravado só por abrir o editor.
- Nenhum merge, deploy, publicação de obra, migração de produção ou alteração de
  conta real é executado pelos testes ou pelo PR.
