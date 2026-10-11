# Autocomplete somente após digitação

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Pedido**: gerar sugestões apenas após o autor digitar e pausar; foco e seleção não iniciam geração.

## Comportamento entregue

O hook exige uma revisão explícita da digitação para iniciar o debounce de 600 ms.
O editor registra entrada textual e alterações de texto vindas de `beforeinput`.
Carregamento, foco, seleção, movimento de cursor, formatação e inserções de IA não
armam geração automática. Seleção e mudanças de contexto cancelam sugestões e
requisições pendentes. As ações manuais de IA e a cobrança por aceitação permanecem.

Arquivos: `useAIAutocomplete.ts`, `RichEditor.tsx`, teste unitário do hook,
`autocomplete-trigger.visual.ts`, fixture de IA opt-in e arquitetura.
A fixture conta chamadas somente no servidor isolado de testes; nenhuma API real
é utilizada e a configuração visual recusa build de produção.

## Verificações

- 19 testes do hook passaram, incluindo montagem sem geração, pausa após a última digitação, cancelamento por seleção e retomada após nova digitação.
- 6 testes Chromium passaram em 29,8 s: desktop/mobile nos temas Claro, Escuro e Sépia. Exercitam digitação real, foco, seleção, setas, cancelamento de debounce e aceitação sem geração em cadeia.
- O relógio do navegador controla as pausas para não confundir lentidão do executor com uma pausa real do autor.
- `npm run validate`: verde, 79 arquivos/550 testes da aplicação, 66 testes de infraestrutura e 46 de backend; tipos, lint, cobertura, build e smoke passaram.
- Cobertura global: 93.47 / 85.17 / 91.21 / 95.56.
- Diff revisado; sem dependências novas ou alteração de functions/regras.

Logs locais: `test-results/autocomplete-trigger-validate.log` e
`test-results/autocomplete-trigger-browser.log`.

## Implantação

`firebase deploy --only hosting --project writer-44cd5 --non-interactive`
concluído. Os 11 arquivos publicados responderam HTTP 200 e os hashes SHA-256
corresponderam ao build local. Evidência:
`test-results/autocomplete-hosting-verification.json`.
SHA-256 de `index.html`:
`7a0b6ddf98f8a301da4bd96fd9b17357c87ae69992e74dcbcf4ff1b2640a0ceb`.

Sem push, PR ou execução de IA paga em produção. Avisos conhecidos de chunks e
importação DOCX permanecem.
