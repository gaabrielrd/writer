# Importação de aventuras PDF com revisão de estrutura

- **Data**: 2026-10-12
- **Branch**: `codex/pdf-campanhas-dd`
- **Plano de origem**: [importação de aventuras PDF](../tasks/importacao-pdf-campanhas.md), aprovado na conversa

## Objetivo

Permitir usar aventuras como Phandelver como campanha editável no Writer,
preservando a ordem de leitura e a organização do texto e conferindo o resultado
antes de gravar.

## Funcionalidades entregues

- **Estrutura de aventura** — introdução, partes e apêndices viram capítulos;
  títulos internos, encontros e salas numeradas permanecem na seção.
- **Duas colunas e regiões** — títulos aparecem antes de sua prosa mesmo quando
  pintados por último; colunas são lidas por faixas e caixas viram citações.
- **Fichas e tabelas** — formatação inline, listas, atributos/valores e tabelas
  simples são conservados como prosa segura. Dados, modificadores, CD, XP e
  medidas não são reescritos; casos ambíguos mostram aviso.
- **Sumário e conteúdo visual** — sumários com ou sem marcador são identificados
  por entradas e correspondência posterior. Avisos permitem conferir o sumário,
  mapas/páginas sem texto e imagens no original.
- **Revisão completa** — páginas de origem, texto completo, comparação local com
  o PDF, divisão por bloco e união de capítulos. Ao unir seções diferentes, o
  título seguinte é preservado como subtítulo.
- **Controle da análise** — progresso por página, cancelamento, troca de arquivo
  e descarte de respostas tardias. Nada é gravado antes da confirmação.
- **Retentativa na mesma revisão** — continua pelos capítulos ainda pendentes
  após falha, sem recriar livro ou capítulos cuja gravação já foi confirmada.

## Critérios de aceite

- [x] Phandelver retorna sete seções em ordem: Introdução; quatro partes;
      Apêndice A: Itens Mágicos; Apêndice B: Monstros.
- [x] Páginas iniciais 2, 6, 14, 27, 42, 52 e 54; capa/sumário fora da prosa.
- [x] Aberturas das partes precedem a prosa; colunas, caixas e fichas são separadas.
- [x] Valores de referência da aranha gigante preservados: `26 (4d10 + 4)`,
      FOR `14 (+2)`, DES `16 (+3)`, CON `12 (+1)`, INT `2 (-4)`, SAB `11 (+0)` e CAR `4 (-3)`.
- [x] Páginas sem texto 5, 13 e 43 identificadas com acesso ao original.
- [x] Revisão por teclado, três temas, desktop/celular e 320 px, sem transbordamento.
- [x] Regressões de PDF com nove capítulos, DOCX, Markdown, texto e HTML preservadas.
- [x] Validação local completa, revisão do diff e documentação atualizadas.

## Arquivos alterados

| Arquivo                                                                             | Mudança                                                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/features/books/services/documentParserService.ts`                              | Integra o resultado estruturado de PDF e mantém os demais formatos.           |
| `src/features/books/services/pdfDocumentService.ts`                                 | Worker local, fontes/geometria, progresso, cancelamento e prévia do original. |
| `src/features/books/services/pdfLayoutExtraction.ts`                                | Reconstrução de colunas, títulos, sumário, caixas, tabelas e avisos.          |
| `src/features/books/model/documentImport.ts`                                        | Contratos de revisão, divisão/união e contagens/páginas.                      |
| `src/features/books/components/ImportBookModal.tsx` e `.module.css`                 | Revisão, avisos, progresso, cancelamento, retentativa e layout responsivo.    |
| `src/features/books/components/ImportChapterReview.tsx` e `PdfPagePreview.tsx`      | Conteúdo completo e página original sob demanda.                              |
| `src/features/books/tests/`                                                         | Regressões do parser/modal e novos testes de layout, serviço e revisão.       |
| `e2e/visual/import-campaigns.visual.ts`                                             | PDF sintético e verificação opcional do arquivo real.                         |
| `docs/document-import.md`, `architecture.md`, `testing.md`, `styleguide.md` e plano | Contratos, uso, verificações e limites.                                       |

## Testes

| Teste                                                        | Tipo       | Cobertura                                                                                                       |
| ------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `pdfLayoutExtraction.test.ts`                                | Unidade    | Colunas/faixas, seções, sumário, caixas, atributos, tabelas, margens e avisos.                                  |
| `pdfDocumentService.test.ts`                                 | Serviço    | Worker/fontes/transformações, cancelamento e liberação de recursos.                                             |
| `documentImport.test.ts`                                     | Unidade    | Divisão/união, identidade, seleção, páginas, contagem e preservação de títulos.                                 |
| `ImportBookReview.test.tsx`                                  | Componente | Páginas, revisão, progresso, cancelamento, troca e falha parcial.                                               |
| `documentParserService.test.ts` e `ImportBookModal.test.tsx` | Regressão  | Formatos existentes e fluxos de importação.                                                                     |
| `import-campaigns.visual.ts` e `import-documents.visual.ts`  | Chromium   | Phandelver real, aventura sintética, PDF de nove capítulos e Markdown, em seis combinações de tema/dispositivo. |

Saída real da validação final:

```text
Test Files  101 passed (101)
     Tests  709 passed (709)
All files          |   93.01 |    86.36 |    91.5 |   95.01 |
ℹ tests 69
ℹ pass 69
ℹ fail 0
ℹ tests 63
ℹ pass 63
ℹ fail 0
Smoke test do bundle OK.
```

Suíte visual completa desta entrega:

```text
24 passed (3.2m)
```

Após o ajuste final de união/foco, os seis cenários sintéticos foram repetidos:

```text
6 passed (52.5s)
```

## Validações executadas

| Comando                                                                                                                                | Resultado                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm ci` e `npm ci --prefix functions`                                                                                                 | Dependências instaladas na worktree; nenhum pacote novo.                                  |
| `npm run validate`                                                                                                                     | Verde na execução final, incluindo lint, tipos, cobertura, backend, build e smoke.        |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/import-campaigns.visual.ts e2e/visual/import-documents.visual.ts` | 24 cenários passaram, com `WRITER_IMPORT_PDF` apontando para o arquivo real e porta 4189. |
| Cenários sintéticos finais de revisão                                                                                                  | Seis combinações de tema/dispositivo passaram novamente, incluindo 320 px.                |
| `git diff --check`                                                                                                                     | Sem erros de whitespace.                                                                  |

Uma execução completa concorrente com testes visuais falhou em dois testes
inalterados de `PersonaManager`: timeout e digitação incompleta no teste seguinte.
Os cinco testes desse arquivo passaram isoladamente; a validação final sem a
suíte visual em paralelo passou integralmente. Nenhum teste ou limite foi reduzido.
O build passou com avisos de tamanho de chunks e importação dinâmica de `exportDocx`.

Logs locais, não versionados: `test-results/pdf-validate-final.log`,
`test-results/pdf-browser.log` e `test-results/pdf-review-final.log`.

## Fora do escopo

OCR, importação de mapas/imagens, reprodução fiel da diagramação, lore por IA,
criação automática de atos e publicação/deploy. O PDF do usuário não foi
versionado nem enviado a servidores.

## Limitações e pendências conhecidas

- A reconstrução usa heurísticas. Três ou mais colunas e texto rotacionado são
  sinalizados, sem garantia de reconstrução; caixas/tabelas dependem da geometria.
- A prévia preserva o original para conferência; nomes com espaçamento incorreto
  já presente na camada de texto podem precisar de ajuste no manuscrito.
- A importação inteira não é transacional. Retentativa controla gravações já
  confirmadas apenas enquanto a revisão permanece aberta; fechamento/reload ou
  uma resposta de gravação perdida exigem conferir o destino antes de repetir.
- O teste do arquivo real exige `WRITER_IMPORT_PDF`; sem essa variável apenas
  esse teste é pulado, mantendo o cenário sintético no CI.
- CI remoto/PR não foram executados nesta entrega local. Sem push ou deploy.

## Como verificar manualmente

1. Rode `npm run dev` nesta worktree e abra Importar Documento na biblioteca.
2. Selecione o PDF de Phandelver e confira as sete seções, seus títulos e páginas.
3. Abra os avisos das páginas 5, 13 e 43 e compare os mapas no original.
4. Expanda a Parte 1 e o Apêndice B, conferindo abertura, caixas e atributos.
5. Divida antes de um trecho e una novamente. Selecione/renomeie antes de confirmar.
6. Troque os temas e reduza a largura para 320 px; confira revisão e controles.

## Integração na principal — 2026-10-12

Integração sem conflitos com `master`, incluindo o chat de capítulos e sua
correção `02dd187`. O avanço posterior `033244b` acrescentou apenas o registro
de deploy do chat; o código validado permaneceu igual. Revisão do diff contra
essa base mantém os 21 arquivos do importador e sua documentação.

- `npm run validate`: verde; 106 arquivos e 743 testes da aplicação, 69 de
  infraestrutura e 73 de backend. Build e smoke passaram.
- Cobertura: 92,54% statements, 85,9% branches, 91,04% functions, 94,64% lines.
- Os quatro cenários de importação no projeto `desktop-light` passaram em
  19,5 s, com Phandelver real habilitado e revisão em 320 px.
- A primeira execução visual falhou no carregamento dinâmico de `pdfjs-dist`
  pelo Vite. A repetição passou sem mudanças ou redução das verificações.
- Logs locais: `test-results/pdf-main-validate.log`,
  `test-results/pdf-main-browser.log` e `test-results/pdf-main-browser-final.log`.

O envio de `master` foi autorizado na conversa. O estado anterior sem push
refere-se à entrega isolada; os resultados de CI remoto desta integração ainda
não estavam disponíveis ao registrar esta seção.
