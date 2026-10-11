# Editor e atualização revisada do compêndio

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`, alterações locais sem commit
- **Plano de origem**: [editor e atualização do compêndio](../tasks/editor-e-atualizacao-do-compendio.md), aprovado na conversa

## Objetivo

Corrigir a navegação do editor, reduzir o peso visual dos controles e permitir
atualizar lore a partir do capítulo mediante revisão explícita, com cobrança por lote.

## Funcionalidades entregues

- **Retorno ao livro** — a seta abre o livro atual mesmo ao entrar diretamente no capítulo.
- **Configurações de IA no usuário** — um diálogo global, aberto pelo dropdown do header; mudanças de provedor invalidam sugestões antigas.
- **Editor discreto** — divisória simples, superfícies opacas, controles compactos e estado do compêndio sem destaque primário concorrente.
- **Análise do capítulo atual** — inclui texto não salvo, percorre partes sem truncamento silencioso e apresenta evidências literais.
- **Revisão do lore** — entidades novas/existentes, conflitos, destino local/global, seleção por proposta/campo e valores editáveis; múltiplos apelidos podem ser digitados normalmente.
- **Aplicação segura** — fichas novas privadas; notas, visibilidade e relações existentes preservadas; escopos e versões validados no servidor.
- **Cobrança por lote** — 1 crédito da plataforma somente quando o lote é aplicado; BYOK não consome créditos da plataforma, inclusive com saldo zero. Transação e repetição idempotente impedem cobrança/aplicação duplicada.

## Critérios de aceite

- [x] Navegação retorna ao livro atual.
- [x] Configurar IA fica no menu do usuário e sai da barra de escrita.
- [x] Visual funciona nos três temas e em desktop/mobile, sem transbordamento horizontal.
- [x] Análise utiliza texto atual não salvo e não grava lore automaticamente.
- [x] Modal permite revisar campos e escolher destino local/global explicitamente.
- [x] Novas fichas privadas; dados fora do lote preservados.
- [x] Débito de 1 por lote da plataforma; BYOK com débito zero.
- [x] Lote atômico, idempotente e protegido contra versões desatualizadas.

## Arquivos alterados

| Arquivo/área                                                                           | Mudança                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/app/App.tsx`, `auth/components/AuthButton.tsx`                                    | Composição global e menu do usuário.                                    |
| `ai-assistant/components/AISettingsProvider.tsx`, hooks e `byokStorage.ts`             | Diálogo único e atualização reativa das configurações.                  |
| `ai-assistant/services/aiClient.ts`, `loreAnalysisClient.ts`                           | JSON validado, limite de saída e análise BYOK em partes.                |
| `lore/model/loreAnalysis.ts`, `services/loreAnalysisService.ts`, `index.ts`            | Contrato público, correspondência de entidades e chamadas autenticadas. |
| `lore/services/loreService.ts`                                                         | Versões estáveis para fichas antigas sem datas.                         |
| `editor/components/EditorPage`, `RichEditor`, `EditorLoreSidebar` e seus estilos       | Navegação, visual e integração do compêndio.                            |
| `editor/components/LoreAnalysisDialog.tsx` e CSS                                       | Análise, revisão de campos/destinos, aplicação e retry.                 |
| `functions/src/loreAnalysis.mjs`, `index.mjs`, `firestore.rules`                       | Registro protegido, validação e transação de lore/débito.               |
| Testes unitários/backend/regras, fixtures e `vite.visual.config.ts`                    | Verificações isoladas sem produção ou APIs reais.                       |
| `docs/lore-analysis.md`, arquitetura, styleguide, lore compartilhado, plano e ADR 0019 | Comportamento, limites e implantação.                                   |

Os ajustes anteriores do dropdown de capítulos e `skills/plan-feature.zip` foram
preservados; o arquivo ZIP não integra esta entrega.

## Testes

| Teste                                                                               | Tipo          | O que cobre                                                                                      |
| ----------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `LoreAnalysisDialog.test.tsx`                                                       | Unidade       | Texto não salvo, seleção, edição, apelidos, conflitos, escopos, BYOK, cancelamento e retry.      |
| `loreAnalysis.test.ts`, `loreAnalysisClient.test.ts`, `loreAnalysisService.test.ts` | Unidade       | Schema/evidência, partes completas, erros e contratos de API.                                    |
| `AuthButton`, `EditorPage`, `RichEditor`, `aiClient`, `byokStorage`, `loreService`  | Unidade       | Menu global, retorno ao livro, JSON/BYOK e versões/configuração.                                 |
| `functions/test/loreAnalysis.test.mjs`                                              | Backend       | Autoria, custo por lote, zero BYOK, preservação, concorrência, no-op, versões e limites.         |
| `tests/firestore/lore-analysis.rules.test.mjs`                                      | Emulador real | Registros/quota exclusivos do servidor e transação real local/global com retry concorrente.      |
| `editor-lore-analysis.visual.ts`                                                    | Chromium      | Revisão e aplicação com plataforma/BYOK, header, navegação, seis combinações de tema e viewport. |

Saída da validação final, incluindo o teste de digitação de apelidos:

```text
Test Files  79 passed (79)
Tests  543 passed (543)
All files | 93.43 | 85.07 | 91.18 | 95.53
tests 66 / pass 66 / fail 0
tests 42 / pass 42 / fail 0
Smoke test do bundle OK.
```

Teste adicional de digitação de apelidos:

```text
Test Files  1 passed (1)
Tests  11 passed (11)
```

## Validações executadas

| Comando                                                                                              | Resultado observado                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run validate`                                                                                   | Verde; tipos, lint, cobertura, infraestrutura, backend, build e smoke. |
| `npm run test:rules`                                                                                 | 37 testes passaram, incluindo transação real no emulador.              |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/editor-lore-analysis.visual.ts` | 12 passaram em 34,0 s; rede externa bloqueada.                         |
| `git diff --check`                                                                                   | Sem erros.                                                             |

Capturas de editor e revisão foram inspecionadas visualmente, incluindo desktop
escuro e mobile claro. Logs locais em `test-results/editor-final-validate.log` e
`test-results/editor-final-visual.log`; capturas em `visual-test-results`.
Avisos já existentes do build: tamanho de chunks e import dinâmico/estático de DOCX.

## Fora do escopo

Livro inteiro, publicação automática, alterações de relações/notas privadas e
migração das ferramentas antigas de escrita para o novo mecanismo de cobrança.

## Limitações e pendências conhecidas

- Functions e regras ainda precisam ser implantadas para disponibilizar o fluxo em produção; nenhum deploy foi executado.
- IA real e chaves reais não foram utilizadas nas verificações; interpretação dos fatos exige revisão do autor.
- Limites de tamanho/frequência e retenção operacional descritos em [atualização do compêndio](../lore-analysis.md).
- BYOK é registrado como conteúdo produzido no navegador, sem atestar criptograficamente a chamada externa.
- Commit, PR e CI remoto não foram executados nesta etapa local.

## Como verificar manualmente

1. Abra um capítulo pela URL e use a seta; deve abrir o livro atual.
2. Abra o menu do usuário e configure IA; a barra do editor não apresenta o botão de chave.
3. Escreva texto novo, abra o compêndio e analise antes de salvar manualmente.
4. Revise evidências, campos e destinos; cancele e confirme ausência de débito.
5. Aplique várias sugestões da plataforma: um crédito por lote, fichas novas privadas.
6. Repita com BYOK: nenhum crédito da plataforma consumido.
7. Com universo vinculado, escolha destino global explicitamente e confira o aviso de alcance.
