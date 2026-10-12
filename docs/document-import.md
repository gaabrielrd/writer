# Importação de manuscritos

Na biblioteca, use **Importar Documento** para criar um livro. Nos detalhes de
uma obra, use **Opções do livro → Importar documento** para acrescentar capítulos.
A seleção de arquivo e o arrastar/soltar aceitam os mesmos formatos:

| Formato       | Extensões          | Detecção                                                                                                    |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Word          | `.docx`            | Títulos estruturados ou parágrafos “Capítulo N”; preserva a formatação de prosa.                            |
| PDF com texto | `.pdf`             | Posições, fontes e regiões; reconhece capítulos, introdução, partes e apêndices, inclusive em duas colunas. |
| Markdown      | `.md`, `.markdown` | Títulos `#` a `######`; preserva negrito, itálico, listas, citações e código aceitos pelo editor.           |
| Texto simples | `.txt`, `.text`    | “Capítulo N”, “Chapter N”, prólogo/epílogo e partes quando não há capítulos explícitos.                     |
| HTML          | `.html`, `.htm`    | Títulos estruturados; sanitiza para o mesmo formato seguro usado pelo editor.                               |

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

O extrator ordena fragmentos pela posição e separa duas colunas por faixas,
respeitando títulos largos e títulos de seção no topo. A ordem de pintura do
PDF não determina a ordem de leitura. Títulos internos e salas numeradas ficam
dentro da seção. Número e título separados de um capítulo podem ser combinados.
Fragmentos de fonte na mesma palavra não recebem espaços extras. Números nas
margens e texto recorrente nas margens são removidos. Para remover um cabeçalho
ou rodapé textual, ele precisa aparecer em pelo menos três páginas e em 40%
das páginas do documento; texto igual no corpo é preservado.

Um sumário precisa ter pelo menos três entradas com pontilhados e números e
correspondência com pelo menos dois títulos posteriores. Pode ter marcador
**Sumário**, **Índice**, **Contents** ou **Table of Contents**, ou ser identificado
pela predominância de entradas na página. A exclusão aparece na revisão com
acesso à página original. Apresentação anterior sem título de seção também é
excluída quando um sumário confirmado a sucede; prólogos identificados são
preservados. Menções à palavra sumário dentro da prosa não removem conteúdo.

Títulos, listas, negrito e itálico usam o formato seguro do editor. Regiões
delimitadas por preenchimentos são convertidas em citações, incluindo caixas
para ler aos jogadores e notas laterais. As cores e a diagramação do PDF não
integram o manuscrito. Fichas com FOR/DES/CON/INT/SAB/CAR ou STR/DEX/CON/INT/WIS/CHA
associam cada atributo ao valor e modificador correspondente. Tabelas simples
de encontros viram pares de rótulos/valores; linhas ambíguas preservam os valores
e mostram aviso. Expressões de dados, CD, XP e medidas não são reescritas.

O worker do PDF.js é incluído no bundle e servido pela mesma origem da aplicação,
sem depender de CDN. A análise não envia o arquivo a servidores e não altera o
livro antes da confirmação.

## Revisão e limites

Antes de confirmar, confira a quantidade, títulos, prévias e palavras. Você pode
renomear capítulos, escolher quais importar ou trocar de arquivo. A criação de
capítulos mantém a ordem exibida e recalcula o total de palavras do livro.

**Conferir conteúdo** expande o texto completo e as páginas de origem. No PDF,
mostra a página original ao lado no desktop e abaixo em celular. O seletor
permite visitar qualquer página, inclusive mapas e sumário. **Dividir antes do
trecho** cria um capítulo a partir de um bloco; **Unir ao próximo capítulo**
combina conteúdos na ordem atual. A seleção do capítulo é preservada na divisão.
A análise anuncia progresso por página e pode ser cancelada ou substituída por
outro arquivo; respostas antigas não alteram a revisão.

Páginas sem texto e imagens não são descartadas silenciosamente: os avisos
identificam as páginas e permitem abrir o original. PDFs mistos aproveitam as
páginas textuais. Após uma falha de gravação, capítulos cuja criação já foi
confirmada são preservados; tentar novamente na mesma revisão continua pelos
pendentes, sem recriar o livro. Isso não é uma transação do documento inteiro
nem recuperação persistente após fechar a janela.

Arquivos vazios, binários renomeados e formatos não suportados mostram erro e
permitem outra seleção. PDFs digitalizados sem camada de texto precisam de OCR
prévio. OCR, importação de imagens/mapas, reprodução da diagramação, RTF, `.doc` legado e codificações
sem BOM além de UTF-8/Windows-1252 não fazem parte deste importador. A separação
automática usa heurísticas; documentos com estrutura ambígua exigem revisão.
Layouts com três ou mais colunas e texto rotacionado recebem aviso de conferência,
mas não têm reconstrução garantida. Detecção de caixas/tabelas depende da geometria
do PDF; compare o original em casos duvidosos. Não há extração de lore por IA,
consumo de créditos ou criação automática de atos.

## Verificações

- `src/features/books/tests/documentParserService.test.ts`: formatos, codificações,
  sumário, formatação, sanitização e erros.
- `src/features/books/tests/pdfTextExtraction.test.ts`: nove capítulos, linhas,
  fragmentos, margens repetidas e preservação da prosa.
- `src/features/books/tests/pdfLayoutExtraction.test.ts`: duas colunas, faixas,
  sumário sem título, partes/apêndices, caixas, atributos, tabelas e avisos.
- `src/features/books/tests/pdfDocumentService.test.ts`: worker local, fontes,
  geometria, cancelamento, prévia e liberação de recursos.
- `src/features/books/tests/documentImport.test.ts` e
  `src/features/books/tests/ImportBookReview.test.tsx`: divisão/união, páginas,
  revisão, progresso, respostas tardias e retentativa após falha parcial.
- `src/features/books/tests/ImportBookModal.test.tsx`: seleção, arrastar/soltar,
  revisão, importação e recuperação após erro.
- `e2e/visual/import-documents.visual.ts`: PDF gerado pelo Chromium com nove
  capítulos e importação Markdown nos três temas, em desktop e celular.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/import-documents.visual.ts
npx playwright test --config playwright.visual.config.ts e2e/visual/import-campaigns.visual.ts
```

O cenário de aventuras usa um PDF sintético de duas colunas e verifica os três
temas em desktop/celular, teclado e 320 px. O teste do arquivo real é opcional:
informe `WRITER_IMPORT_PDF` com o caminho local do Phandelver usado como referência.
Sem essa variável, apenas esse teste é pulado; o PDF não integra o repositório.
`WRITER_VISUAL_PORT` permite usar uma porta separada numa worktree.
