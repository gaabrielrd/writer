# Barras de rolagem por tema

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Pedido**: todas as barras de rolagem do site devem usar as cores do tema.

## Entrega

`src/styles/globals.css` aplica `scrollbar-color` globalmente: controle em
`--muted-foreground` e trilho em `--background`. Páginas, editor, campos,
painéis e diálogos em portal acompanham Claro, Escuro e Sépia sem recarregar.
Largura e interação nativas permanecem; a visibilidade das barras sobrepostas
continua seguindo navegador/sistema.

Navegadores sem a propriedade padrão recebem fallback WebKit para controle,
trilho, cantos e botões; hover usa `--foreground`. Cores forçadas preservam a
paleta de acessibilidade do sistema. Não foram adicionadas dependências ou cores
literais. O [styleguide](../styleguide.md) documenta a regra.

## Verificações

- `npm run validate`: verde, 79 arquivos/550 testes da aplicação, 66 testes de infraestrutura e 46 do backend; cobertura, tipos, lint, build e smoke passaram.
- `scrollbars.visual.ts`: 6 testes Chromium passaram em 27,3 s, desktop/mobile nos três temas.
- Valores computados conferidos em página, textarea, diálogo em portal e contêineres de rolagem do editor; em mobile, também na rolagem do documento.
- Troca de tema sem reload, largura `auto` e modo de cores forçadas verificados no navegador.
- Captura do editor Escuro inspecionada; capturas nos demais temas/dispositivos foram geradas. A exibição de barras sobrepostas permanece nativa.
- Tipo, lint e formatação do teste final passaram após os ajustes de leitura de cores e identificação da rolagem mobile.
- Diff revisado e sem mudanças de layout, funções ou regras. Permanecem os avisos conhecidos de chunks e importação DOCX.

Logs locais: `test-results/scrollbars-validate.log` e
`test-results/scrollbars-browser.log`; capturas em `visual-test-results`.
O fallback legado WebKit não foi exercitado em um segundo motor de navegador.

## Implantação

`firebase deploy --only hosting --project writer-44cd5 --non-interactive`
concluído. Os 11 arquivos publicados retornaram HTTP 200 com SHA-256 idêntico ao
build local, incluindo o CSS. Evidência:
`test-results/scrollbars-hosting-verification.json`.
SHA-256 de `index.html`:
`dcd2b9f5577d9ff5ddcc7278d9e05447b9527b7a99c53124ace7a11570867181`.

Sem push, PR ou CI remoto nesta etapa; a aplicação não foi alterada por chamadas
pagas de IA ou mutações de dados de produção durante as verificações.
