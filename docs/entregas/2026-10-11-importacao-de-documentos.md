# Importação de documentos e correção dos capítulos PDF

- **Data**: 2026-10-11
- **Branch local**: `master`
- **Plano de origem**: [Importação de documentos](../tasks/importacao-de-documentos.md)

## Objetivo

Corrigir a importação do manuscrito informado, cujo PDF possui nove capítulos,
mas antes resultava em um capítulo contendo o sumário. Ampliar os formatos de
texto aceitos na seleção de arquivo e no arrastar/soltar.

## Funcionalidades entregues

- **PDF em capítulos**: preserva linhas, une fragmentos pela geometria e combina
  número e título destacados. Remove cabeçalhos/rodapés recorrentes e números
  nas margens.
- **Sumário separado**: marcadores de sumário/índice, com capítulos reconhecidos
  depois deles, permitem excluir páginas preliminares e entradas repetidas.
- **Novos formatos**: Markdown (`.md`, `.markdown`), texto (`.txt`, `.text`) e
  HTML (`.html`, `.htm`), além de DOCX/PDF.
- **Formatação e revisão**: títulos de capítulos são separados dos subtítulos;
  DOCX/HTML/Markdown reutilizam a prosa segura do editor. Texto simples preserva
  marcações literais e aceita UTF-8, UTF-16 com BOM e Windows-1252.
- **Erros recuperáveis**: arquivos vazios, binários renomeados e PDF sem texto
  mostram erro e permitem outra seleção. O worker PDF é servido localmente.
- **Acessibilidade**: arquivo, títulos e seleção de capítulos têm rótulos;
  checkbox e edição do título usam controles separados.

## Critérios de aceite

- [x] O PDF `duna_a_abdicacao_ato_i.pdf` retorna nove capítulos na ordem correta.
- [x] Número e título de cada capítulo são reconhecidos.
- [x] Sumário, capa, cabeçalhos repetidos e números de página não entram na prosa.
- [x] A prosa completa coincide com uma extração independente após normalizar espaços.
- [x] Novos formatos funcionam por seleção e arrastar/soltar.
- [x] Subtítulos ficam dentro dos capítulos e a formatação de prosa é preservada.
- [x] Seleção, renomeação e importação continuam funcionando.
- [x] `npm run validate` e os cenários Chromium passam sem reduzir cobertura.

## Arquivos alterados

| Arquivo                                                  | Mudança                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/books/services/documentParserService.ts`   | Formatos, codificações, sumário, estrutura e sanitização.         |
| `src/features/books/services/pdfTextExtraction.ts`       | Linhas, fragmentos, títulos e margens do PDF.                     |
| `src/features/books/components/ImportBookModal.tsx`      | Filtro de arquivos, mensagens e rótulos acessíveis.               |
| `src/features/books/components/BookList.tsx`             | Ação de importação descreve todos os formatos.                    |
| `src/features/books/components/BookPage.tsx`             | Menu “Importar documento”.                                        |
| `src/features/books/tests/documentParserService.test.ts` | Formatos, estrutura, preservação e erros.                         |
| `src/features/books/tests/pdfTextExtraction.test.ts`     | Regressões de nove capítulos e geometria.                         |
| `src/features/books/tests/ImportBookModal.test.tsx`      | Novos formatos nos dois métodos de seleção e recuperação de erro. |
| `src/features/books/tests/BookPage.test.tsx`             | Abertura pelo menu atualizado.                                    |
| `e2e/visual/import-documents.visual.ts`                  | PDF válido gerado pelo Chromium e importação Markdown.            |
| `docs/document-import.md`                                | Uso, formatos, detecção e limites.                                |
| `docs/architecture.md`, `docs/styleguide.md`             | Fronteiras do importador e menu atualizado.                       |
| `docs/tasks/importacao-de-documentos.md`                 | Plano e critérios de aceite.                                      |

## Testes e validações executadas

| Comando                                                                                                                                                                                                                                                            | Resultado real                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `npm ci --prefix functions`                                                                                                                                                                                                                                        | 249 pacotes instalados; auditoria sem vulnerabilidades.                 |
| `npx vitest run src/features/books/tests/documentParserService.test.ts src/features/books/tests/pdfTextExtraction.test.ts src/features/books/tests/ImportBookModal.test.tsx src/features/books/tests/BookPage.test.tsx src/features/books/tests/BookList.test.tsx` | 5 arquivos e 68 testes passaram.                                        |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/import-documents.visual.ts`                                                                                                                                                                   | 12 testes passaram em desktop/celular, nos temas claro, escuro e sépia. |
| `npm run validate`                                                                                                                                                                                                                                                 | Verde, código de saída 0.                                               |
| `git diff --check`                                                                                                                                                                                                                                                 | Sem erros de whitespace.                                                |

Trechos da saída final:

```text
Test Files  75 passed (75)
     Tests  520 passed (520)

Statements   : 93.77% ( 3884/4142 )
Branches     : 84.7% ( 2891/3413 )
Functions    : 91.6% ( 982/1072 )
Lines        : 95.87% ( 3554/3707 )

Infraestrutura:
tests 66
pass 66
fail 0

Backend:
tests 28
pass 28
fail 0

Smoke test do bundle OK.

Chromium:
12 passed (34.2s)
```

Houve falhas intermediárias de formatação, lint e seleção do nível de títulos
HTML adjacentes. Foram corrigidas; os resultados acima são da execução final.
O build mantém avisos de tamanho de chunks e de importação estática/dinâmica
do exportador DOCX. Não foram alterados os limites nem as configurações para
ocultar avisos.

## Verificação com o anexo

O arquivo real foi lido localmente no Chromium, com rede externa bloqueada,
pelo serviço de análise e pelo modal. Nenhum livro real foi criado.

- **293 páginas** analisadas, **9 capítulos**, **38.729 palavras** de conteúdo.
- Inícios dos capítulos nas páginas **3, 32, 60, 95, 134, 170, 207, 239 e 271**.
- Títulos: O Peso das Colheitas; O Futuro Mais Provável; A Memória dos Erros;
  A Moral dos Números; O Homem que Disse Não; A Correção; Um Nome Impossível;
  Ausência de Autor; A Pergunta Errada.
- Nenhum capítulo continha o marcador Sumário, o cabeçalho recorrente ou a
  identificação ATO I. A frase final também foi preservada.
- A prosa, extraída dos capítulos importados, coincidiu integralmente com a
  extração independente por pypdf após retirar os títulos/margens e normalizar
  whitespace: **267.672 caracteres** nas duas extrações.
- O PDF e o conteúdo integral do manuscrito não foram adicionados ao repositório.

## Fora do escopo

OCR, RTF, Word `.doc` legado, imagens e reconstrução de diagramação complexa.
Sem alteração de persistência, regras do servidor ou cobrança.

## Limitações e pendências conhecidas

PDF depende de camada de texto e de heurísticas de posição/tipografia. A revisão
é necessária para documentos ambíguos. Consulte [formatos e limites](../document-import.md).

Entrega validada localmente. Push, PR, CI remoto e implantação não foram
executados nesta solicitação; a validação remota da definição de concluído
permanece pendente.

## Como verificar manualmente

1. Na biblioteca, abra **Importar Documento** e selecione o PDF informado.
2. Confira nove capítulos, títulos/previews de prosa e ausência do sumário.
3. Troque por um Markdown com título do livro, capítulos `##` e subtítulos `###`.
4. Confira os capítulos, desmarque um, renomeie outro e revise antes de confirmar.
5. Para acrescentar capítulos a uma obra existente, abra **Opções do livro →
   Importar documento**.
