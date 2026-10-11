# Controles e header do editor

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`, alterações locais sem commit
- **Plano de origem**: ajustes solicitados na conversa

## Objetivo e funcionalidades entregues

Centralizar o contador de créditos no header principal e alinhar os modos de
edição aos controles vizinhos. “Edição” e “Preview” formam um split button com
superfície, altura e tipografia dos botões secundários, uma divisória interna e
estado ativo acessível. A seta de voltar não tem borda e a divisória entre o
header do capítulo e o editor foi retirada.

## Critérios de aceite

- [x] Apenas um contador de créditos, no header principal, inclusive no editor.
- [x] Rótulos “Edição” e “Preview”, em um controle dividido.
- [x] Mesma altura e tamanho de fonte do botão Assistente IA, sem espaço entre os segmentos.
- [x] Troca de modos mantém formatação, lore e conteúdo do capítulo.
- [x] Seta de voltar sem borda.
- [x] Header do capítulo sem linha divisória inferior.
- [x] Três temas e desktop/mobile sem transbordamento horizontal.

## Arquivos alterados

- `src/app/App.tsx`: créditos no header principal em todas as rotas autenticadas.
- `src/features/editor/components/EditorPage.tsx` e CSS: contador removido do capítulo, seta sem borda e remoção da divisória.
- `src/features/editor/components/RichEditor.tsx` e CSS: modos agrupados com componentes Button compartilhados.
- `src/features/editor/tests/RichEditor.test.tsx`: seletores dos novos rótulos e troca dos modos.
- `e2e/visual/editor-lore-analysis.visual.ts`: posição/quantidade dos créditos, medidas reais, bordas e estados dos modos.
- `docs/styleguide.md`: regras visuais atualizadas.

## Testes e validações

`npm run validate` passou: tipos, lint, cobertura, arquitetura, documentação,
styleguide, testes de infraestrutura/backend, build e smoke. A remoção posterior
da divisória foi verificada no navegador e por build/checks de interface.

```text
Test Files 79 passed (79)
Tests 543 passed (543)
tests 66 / pass 66 / fail 0
tests 42 / pass 42 / fail 0
Smoke test do bundle OK.
```

Os testes Chromium percorrem seis combinações de tema/viewport e validam a
geometria e os estilos computados dos controles, além dos fluxos de lore e BYOK.
Captura desktop escuro inspecionada visualmente. Logs locais:
`test-results/editor-controls-validate.log` e `test-results/editor-controls-visual.log`.

```text
12 passed (29.9s)
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

## Fora do escopo e pendências

Nenhuma alteração nas regras de cobrança, persistência ou functions. Sem commit,
push, PR, CI remoto ou deploy. Os avisos preexistentes de chunks e import DOCX
continuam no build.

## Como verificar manualmente

1. Abra um capítulo: créditos devem aparecer junto aos controles da conta.
2. Alterne Edição/Preview: o controle dividido indica o segmento ativo e preserva o texto.
3. Confira seta sem borda e ausência de divisória entre o header do capítulo e o editor.
