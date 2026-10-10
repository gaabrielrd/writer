# Criação de livros em etapas com IA e créditos

- **Data**: 2026-10-10
- **Branch**: `codex/book-creation-wizard`
- **Plano de origem**: plano aprovado na conversa; custos confirmados de 1 crédito por sinopse e 5 por capa aceita.

## Objetivo

Criar livros em três etapas, com sugestões de sinopse e capa por IA, mantendo a criação manual disponível e as capas no formato vertical da listagem.

## Funcionalidades entregues

- **Modal em etapas** — título/gênero, sinopse e capa; voltar preserva os campos e a gravação ocorre na última etapa.
- **Sinopse por IA** — título e gênero contextualizam uma sugestão que o usuário pode aceitar e editar.
- **Capa por IA** — título, gênero e sinopse contextualizam arte vertical, normalizada em PNG de 1200 × 1800, com prévia 2:3.
- **Créditos** — aceite explícito cobra 1 ou 5 créditos no servidor, com retentativas sem débito duplicado.
- **Resiliência** — erros e saldo insuficiente permitem preenchimento manual; criação usa ID estável para evitar livros duplicados.
- **Backend** — autenticação, App Check, segredo no servidor, limites de geração, associação da capa e limpeza de arquivos expirados/excluídos.

## Critérios de aceite

- [x] Criação dividida nas três etapas solicitadas.
- [x] Sugestão de sinopse baseada em título e gênero.
- [x] Sugestão de capa baseada em título, gênero e sinopse.
- [x] Imagem normalizada para a proporção 2:3 da listagem.
- [x] Cobrança somente no aceite, com valores definidos pelo backend.
- [x] Edição/importação preservam seus fluxos e criação manual permanece disponível.
- [x] Testes e validação local aprovados.
- [ ] Ativação e teste com provedor real no destino de produção.
- [ ] CI verde no pull request.

## Arquivos alterados

| Arquivos                                                                           | Mudança                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/features/books`                                                               | Wizard, integração ao modal, gravação idempotente, serviço para capa gerada e testes. |
| `src/features/ai-assistant`                                                        | Contratos, serviço callable, controle de sugestões e testes.                          |
| `functions`                                                                        | Backend isolado, lockfile, transações, integração Gemini, Storage e testes Node.      |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`      | Configuração de implantação e proteção dos registros/arquivos.                        |
| `package.json`, `vitest.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml` | Validação do backend e separação das suítes Node/Vitest.                              |
| `e2e/visual`, `vite.visual.config.ts`                                              | Serviços fictícios e verificações do fluxo nos três temas e em desktop/mobile.        |
| `README.md`, `AGENTS.md`, `docs`                                                   | Setup, regras do backend, arquitetura, decisão e ativação da integração.              |

## Testes

| Testes                                                                | Tipo       | O que cobre                                                                                                    |
| --------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `BookCreationWizard.test.tsx`                                         | Componente | Etapas, preservação de dados, aceite, falhas, saldo, cancelamento, resultados tardios e retentativas.          |
| `bookGenerationService.test.ts`, `generatedBookService.test.ts`       | Serviço    | Contratos callable e erros.                                                                                    |
| `BookFormDialog.test.tsx`, `BookList.test.tsx`, `bookService.test.ts` | Regressão  | Criação em etapas, edição e gravação idempotente.                                                              |
| `functions/test`                                                      | Backend    | Autenticação, propriedade, débito concorrente, idempotência, limites, expiração e normalização real via sharp. |
| `tests/firestore/book-generation.rules.test.mjs`                      | Emulador   | Criação concorrente, privacidade e bloqueio de registros internos.                                             |
| `e2e/visual/writer.visual.ts`                                         | Navegador  | Modal/listagem, criação com IA fictícia, saldo e proporção da capa nos seis projetos visuais.                  |

Saída real da validação local:

```text
Test Files  66 passed (66)
     Tests  426 passed (426)
All files | 93.54 | 82.71 | 90.96 | 95.52

ℹ tests 66
ℹ pass 66
ℹ fail 0

> writer-assistant@0.0.0 test:book-generation
> npm --prefix functions test && npm --prefix functions run check
ℹ tests 12
ℹ pass 12
ℹ fail 0

> writer-assistant@0.0.0 smoke:build
> node scripts/smoke-build.mjs
Smoke test do bundle OK.
```

## Validações executadas

| Comando                                                                                           | Resultado                                                                                                  |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run validate`                                                                                | Verde: skills, arquitetura, documentação, styleguide, formatação, lint, testes, TypeScript, build e smoke. |
| `npm run test:rules`                                                                              | 28 testes aprovados no emulador Firestore.                                                                 |
| `npx playwright test -c playwright.visual.config.ts --grep "wizard gera"`                         | 6 testes aprovados: desktop/mobile, claro/escuro/sépia.                                                    |
| `npx playwright test -c playwright.visual.config.ts --grep "um único livro\|biblioteca populada"` | 12 testes aprovados para listagem e modal.                                                                 |
| `git diff --check`                                                                                | Sem erros de whitespace.                                                                                   |

As capturas de sinopse e capa foram inspecionadas visualmente. O build mantém avisos de tamanho de chunks e de importação dinâmica já presentes; não impedem a execução.

## Fora do escopo

Upload manual, galeria de capas, tipografia incorporada pela IA, edição avançada, BYOK no wizard, alterações do editor e implantação automática.

## Limitações e pendências conhecidas

A integração real requer Functions, Storage, regras/índices, App Check e `BOOK_GENERATION_GEMINI_KEY` no servidor. Modelos e cotas devem ser confirmados na conta de destino, conforme [ativação](../book-creation.md). Não foi consumida uma chave real nem efetuada implantação de produção. Testes visuais usam respostas fictícias; testes do domínio usam transações simuladas e os testes de regras usam Firestore real emulado. Storage e provedor remoto não foram validados em produção.

Capas aceitas usam URLs com token: quem possui o link pode acessar. Aceitar e depois cancelar/remover não reembolsa créditos. Limite de dez gerações por usuário/hora inclui falhas e descartes. Capas aceitas sem livro expiram após sete dias.

As alterações são registradas em commit local, sem push ou pull request nesta entrega; o portão de CI da definição de concluído permanece pendente.

## Como verificar manualmente

1. Abra **Meus Livros → Novo Livro**, informe título/gênero e avance.
2. Escreva uma sinopse ou gere uma sugestão; confirme **Usar sinopse** e confira o débito de 1 crédito.
3. Avance, gere uma capa e confirme **Usar capa**; confira o débito de 5 créditos e a prévia vertical.
4. Crie o livro e confira a capa na listagem. Repita com criação manual e use **Voltar** para conferir a preservação dos campos.
5. Para IA real, conclua primeiro a configuração de [criação de livros](../book-creation.md). Para revisão sem serviços remotos, use a suíte visual.
