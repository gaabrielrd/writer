# Importação de documentos e detecção de capítulos

## Objetivo e requisitos

Corrigir a importação do PDF informado, com nove capítulos, sem incluir capa,
sumário, cabeçalhos repetidos ou numeração de página no manuscrito. Aceitar
também Markdown (`.md`, `.markdown`), texto (`.txt`, `.text`) e HTML (`.html`,
`.htm`), preservando DOCX/PDF e a revisão dos capítulos antes da gravação.

## Suposições e solução

PDFs possuem camada de texto; OCR e reconstrução de layouts de múltiplas colunas
ficam fora do escopo. A extração usa posições e quebras de linha; títulos
separados do número podem ser reconhecidos pela tipografia. O sumário é
descartado somente quando existe um marcador reconhecido e capítulos depois
dele. Sem delimitadores, o conteúdo permanece em um capítulo.

Markdown e HTML usam a estrutura de títulos e o sanitizador de prosa existente.
Texto simples aceita UTF-8, UTF-16 com BOM e Windows-1252. Arquivos vazios,
binários ou PDFs sem texto apresentam erro para permitir outra seleção.

## Tarefas sequenciais

1. Preservar linhas, títulos e remover margens repetidas na extração PDF.
2. Corrigir a separação de capítulos/sumário para PDF, DOCX e texto.
3. Ampliar formatos, filtro de seleção e mensagens do modal.
4. Adicionar regressões do parser e das interações do modal.
5. Verificar o PDF real em Chromium, executar `npm run validate`, revisar o diff
   e registrar a entrega.

## Riscos

PDF não possui estrutura semântica garantida: a detecção depende da camada de
texto e da diagramação. Remover margens exige repetição em várias páginas para
evitar apagar prosa. Títulos internos devem permanecer dentro do capítulo.

## Critérios de aceite

- O anexo retorna nove capítulos em ordem, com número e título, sem sumário.
- Cabeçalhos recorrentes e números de página não entram nos capítulos.
- Os novos formatos funcionam por seleção e arrastar/soltar.
- DOCX preserva formatação e capítulos; subtítulos não criam capítulos extras.
- Erros e ausência de texto permitem tentar outro arquivo.
- Testes e `npm run validate` passam sem reduzir cobertura.
