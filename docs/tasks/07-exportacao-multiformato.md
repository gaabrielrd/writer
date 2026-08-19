# Tarefa 07 — Exportação Multiformato (Markdown, DOCX e PDF)

## Contexto

Autores precisam da flexibilidade de extrair seus manuscritos do sistema a qualquer momento, seja para backup, revisão offline, envio para editoras ou leitura em e-readers e documentos formatados.

## Objetivo

Implementar a funcionalidade de exportação multiformato na feature `editor` e no painel do livro, permitindo o download do capítulo atual ou do livro completo em **Markdown** (`.md`), **DOCX** (`.docx`) e **PDF** (layout de impressão formatado).

## Escopo

- Implementação na feature `src/features/editor`:
  - `services/exportMarkdown.ts`: Compilador para formato Markdown com metadados de cabeçalho, divisão de capítulos e notas.
  - `services/exportDocx.ts`: Gerador client-side de arquivos `.docx` formatados com estilos de títulos, parágrafos e quebras de página.
  - `services/exportPdf.ts`: Utilitário para acionamento de visualização e diálogo de impressão limpo com folha de estilo de mídia de impressão (`@media print`).
  - `components/ExportDialog.tsx`: Modal permitindo escolher o escopo (capítulo atual vs. livro inteiro) e o formato desejado (Markdown, DOCX ou PDF).
  - `components/ExportButton.tsx`: Botão de ação rápida integrado ao editor e ao painel do livro.
  - `tests/`: Testes de unidade cobrindo a conversão e montagem de arquivos Markdown e DOCX a partir de conteúdos de exemplo.

## Não escopo

- Geração de arquivos proprietários de diagramação gráfica (.indd).
- Conversão de e-books em formato proprietário Kindle (.mobi/.kfx).

## Critérios de aceite

- [ ] Autor pode clicar em "Exportar" no editor ou no painel do livro e selecionar o formato desejado (Markdown, DOCX ou PDF).
- [ ] Ao escolher Markdown, um arquivo `.md` válido e estruturado é baixado no navegador.
- [ ] Ao escolher DOCX, um documento `.docx` formatado com capítulos e quebras de página é baixado no navegador.
- [ ] Ao escolher PDF, o diálogo nativo de impressão do navegador é aberto com estilos dedicados de leitura limpa (ocultando barras de ferramentas e botões da interface).
- [ ] A exportação funciona tanto para um único capítulo quanto para a compilação de todos os capítulos do livro.
- [ ] Testes de unidade validam a geração e integridade das saídas de Markdown e DOCX.

## Tarefas

- [ ] 1. Implementar o compilador de Markdown em `src/features/editor/services/exportMarkdown.ts`.
- [ ] 2. Implementar a geração client-side de DOCX em `src/features/editor/services/exportDocx.ts`.
- [ ] 3. Criar os estilos de impressão `@media print` e o serviço de PDF em `src/features/editor/services/exportPdf.ts`.
- [ ] 4. Construir o modal `ExportDialog` e o botão `ExportButton` com `@vitru/styleguide`.
- [ ] 5. Integrar o botão de exportação no `EditorPage` e no `BookCard`/painel principal.
- [ ] 6. Escrever testes automatizados em `src/features/editor/tests/`.
- [ ] 7. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Caracteres especiais ou formatações complexas no DOCX: cobrir nos testes com casos de acentuação, itálico, negrito e quebras de linha.
