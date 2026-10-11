# Importação de manuscritos

Na biblioteca, use **Importar Documento** para criar um livro. Nos detalhes de
uma obra, use **Opções do livro → Importar documento** para acrescentar capítulos.
A seleção de arquivo e o arrastar/soltar aceitam os mesmos formatos:

| Formato       | Extensões          | Detecção                                                                                                        |
| ------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Word          | `.docx`            | Títulos estruturados ou parágrafos “Capítulo N”; preserva a formatação de prosa.                                |
| PDF com texto | `.pdf`             | Linhas e posições; combina o número do capítulo com o título seguinte quando a tipografia o distingue da prosa. |
| Markdown      | `.md`, `.markdown` | Títulos `#` a `######`; preserva negrito, itálico, listas, citações e código aceitos pelo editor.               |
| Texto simples | `.txt`, `.text`    | “Capítulo N”, “Chapter N”, prólogo/epílogo e partes quando não há capítulos explícitos.                         |
| HTML          | `.html`, `.htm`    | Títulos estruturados; sanitiza para o mesmo formato seguro usado pelo editor.                                   |

Markdown exportado pelo aplicativo pode ser importado novamente: os metadados
YAML e o título do livro não viram capítulos, e subtítulos ficam dentro do
capítulo. Sem títulos explícitos, DOCX/HTML/Markdown usam o nível mais alto dos
títulos; um título isolado de livro sem prosa antes dos títulos seguintes é
tratado como apresentação. Sem delimitadores,
o documento permanece em um capítulo.

Arquivos de texto aceitam UTF-8, UTF-16 com BOM e Windows-1252. Texto simples
preserva caracteres literais, inclusive marcações que poderiam parecer HTML ou
Markdown. HTML/DOCX passam pelo sanitizador existente: scripts, atributos de
eventos, estilos e conteúdo ativo não integram o manuscrito.

## PDF e sumário

O extrator preserva linhas usando posições e quebras informadas pelo PDF.js.
Fragmentos de fonte na mesma palavra não recebem espaços extras. Números nas
margens e texto recorrente nas margens são removidos. Para remover um cabeçalho
ou rodapé textual, ele precisa aparecer em pelo menos três páginas e em 40%
das páginas do documento; texto igual no corpo é preservado.

Um marcador de **Sumário**, **Índice**, **Contents** ou **Table of Contents**,
seguido de capítulos reconhecidos, permite descartar as páginas preliminares e
entradas repetidas. A palavra mencionada dentro de uma frase não remove conteúdo.
Prólogos sem um sumário anterior são preservados.

O worker do PDF.js é incluído no bundle e servido pela mesma origem da aplicação,
sem depender de CDN. A análise não envia o arquivo a servidores e não altera o
livro antes da confirmação.

## Revisão e limites

Antes de confirmar, confira a quantidade, títulos, prévias e palavras. Você pode
renomear capítulos, escolher quais importar ou trocar de arquivo. A criação de
capítulos mantém a ordem exibida e recalcula o total de palavras do livro.

Arquivos vazios, binários renomeados e formatos não suportados mostram erro e
permitem outra seleção. PDFs digitalizados sem camada de texto precisam de OCR
prévio. OCR, imagens/diagramação, RTF, `.doc` legado, múltiplas colunas e codificações
sem BOM além de UTF-8/Windows-1252 não fazem parte deste importador. A separação
automática usa heurísticas; documentos com estrutura ambígua exigem revisão.

## Verificações

- `src/features/books/tests/documentParserService.test.ts`: formatos, codificações,
  sumário, formatação, sanitização e erros.
- `src/features/books/tests/pdfTextExtraction.test.ts`: nove capítulos, linhas,
  fragmentos, margens repetidas e preservação da prosa.
- `src/features/books/tests/ImportBookModal.test.tsx`: seleção, arrastar/soltar,
  revisão, importação e recuperação após erro.
- `e2e/visual/import-documents.visual.ts`: PDF gerado pelo Chromium com nove
  capítulos e importação Markdown nos três temas, em desktop e celular.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/import-documents.visual.ts
```
