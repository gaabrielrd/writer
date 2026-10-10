# Livros verticais na biblioteca

- **Data**: 2026-10-10
- **Branch**: `codex/vertical-book-list`
- **Plano de origem**: plano apresentado na conversa, dentro da solicitação de manter a listagem em formato vertical de livro.

## Objetivo

Manter os livros da biblioteca em formato vertical, inclusive quando há apenas uma obra ou nenhuma imagem de capa.

## Funcionalidades entregues

- **Capas verticais** — proporção 2:3 para imagens e para o estado “Sem capa”, com recorte proporcional sem distorção.
- **Largura limitada** — livros com no máximo 300 px, sem expansão de uma única obra por toda a linha.
- **Responsividade** — cards respeitam a largura disponível e os metadados podem quebrar linhas.

## Critérios de aceite

- [x] Uma única obra permanece vertical em desktop e celular.
- [x] Várias obras mantêm capas 2:3, com e sem imagem.
- [x] Temas claro, escuro e sépia preservados.
- [x] Viewport de 320 px sem transbordamento horizontal.
- [x] Validação local completa aprovada.

## Arquivos alterados

| Arquivo                                             | Mudança                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `src/features/books/components/BookList.module.css` | Grade mantém colunas vazias sem expandir os livros.        |
| `src/features/books/components/BookCard.module.css` | Limite de largura, capas verticais e quebra dos metadados. |
| `e2e/visual/writer.visual.ts`                       | Verificação geométrica de uma e várias obras.              |
| `e2e/visual/README.md`                              | Descrição da cobertura e da captura adicional.             |
| `docs/styleguide.md`                                | Documentação das dimensões da biblioteca.                  |
| `docs/entregas/2026-10-10-livros-verticais.md`      | Evidências desta entrega.                                  |

## Testes

| Teste               | Tipo     | O que cobre                                                                                                |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| Biblioteca populada | Chromium | Três cards verticais de até 300 px, capas 2:3 com e sem imagem, títulos e gêneros longos, modal e teclado. |
| Um único livro      | Chromium | Criação pela interface, largura limitada, capa 2:3, desktop/mobile e redimensionamento para 320 px.        |

Comando executado:

```sh
npx playwright test -c playwright.visual.config.ts e2e/visual/writer.visual.ts --grep 'biblioteca populada|um único livro'
```

Saída real:

```text
12 passed (43.1s)
```

Os dois cenários foram executados nos seis projetos de desktop/mobile e claro/escuro/sépia. Capturas de desktop e celular foram inspecionadas visualmente. Os dados são fictícios; nenhuma integração de produção foi acessada.

## Validações executadas

| Comando            | Resultado                    |
| ------------------ | ---------------------------- |
| `npm run validate` | Aprovado, código de saída 0. |
| `git diff --check` | Aprovado.                    |

Trechos reais da validação:

```text
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Test Files  63 passed (63)
Tests  406 passed (406)
Statements   : 93.65% ( 3099/3309 )
Branches     : 82.69% ( 2117/2560 )
Functions    : 91.41% ( 756/827 )
Lines        : 95.51% ( 2835/2968 )
ℹ tests 66
ℹ pass 66
ℹ fail 0
Smoke test do bundle OK.
```

Na primeira tentativa, o gate de skills identificou cópias geradas divergentes; `npm run sync:skills` corrigiu o ambiente local. O Chromium exigido pelo Playwright estava ausente e foi instalado com `npx playwright install chromium` antes da execução aprovada. Nenhuma dependência do projeto foi adicionada.

## Fora do escopo

Alteração dos dados dos livros, upload de capas, editor e publicação.

## Limitações e pendências conhecidas

- CI em Pull Request ainda não executado; esta evidência cobre a validação local.
- O build mantém avisos sobre tamanho dos chunks e importação estática/dinâmica de `exportDocx.ts`, fora desta mudança de CSS.
- A proporção 2:3 pode recortar imagens com outras dimensões, mantendo a imagem sem distorção.

## Como verificar manualmente

1. Abra a biblioteca com uma única obra: o card deve permanecer vertical e limitado a 300 px.
2. Confira obras com imagem e sem capa: ambas devem ocupar uma área de capa 2:3.
3. Alterne entre claro, escuro e sépia e reduza a janela até 320 px; a página deve continuar sem transbordamento horizontal.
