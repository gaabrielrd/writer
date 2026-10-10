# Biblioteca de imagens e header compacto

- **Data**: 2026-10-10
- **Branch**: `codex/image-library-header`
- **Plano de origem**: plano aprovado na conversa; biblioteca somente de imagens

## Objetivo

Guardar e reutilizar as imagens aceitas da IA, permitindo gerenciamento pessoal
e navegação compacta entre obras e biblioteca.

## Funcionalidades entregues

- Capas aceitas entram na biblioteca junto com o débito idempotente de cinco créditos.
- Imagens permanecem após cancelar a criação ou excluir um livro; reutilização é gratuita.
- Página privada com prévia, nome, data, quantidade de usos, renomeação e exclusão confirmada.
- Exclusão bloqueada para imagens em uso; falhas no Storage ficam pendentes e podem ser repetidas ao reabrir a biblioteca.
- Seletor da biblioteca no wizard e na edição da obra, com capas em 2:3 e opção de URL externa preservada.
- Recuperação incremental de imagens aceitas antigas ainda existentes, sem débito.
- Header com navegação à esquerda, título da obra, conta em dropdown com email/saída e saldo somente com ícone/número e tooltip.
- Catálogo `/styleguide` com exemplos de menu e tooltip dentro do modal de demonstração.

## Critérios de aceite

- [x] Toda capa aceita é inserida uma única vez; textos não entram na biblioteca.
- [x] Uma imagem pode ser associada a vários livros sem novos créditos.
- [x] Cancelar o wizard e excluir o livro preservam a imagem aceita.
- [x] Vínculos e exclusão são verificados no servidor, incluindo concorrência e retentativas.
- [x] Usuários não podem ler a biblioteca alheia nem forjar referências pelo navegador.
- [x] Ambos os seletores de capa oferecem a biblioteca.
- [x] Header atende teclado, foco, Escape, três temas e largura de 320 px.
- [x] Título privado não aparece em conta diferente ou em rota pública de leitura.

## Arquivos alterados

| Área                                                      | Mudança                                             |
| --------------------------------------------------------- | --------------------------------------------------- |
| `functions/src/imageLibrary.mjs`                          | Gerenciamento, referências, migração e paginação    |
| `functions/src/generation.mjs`, `functions/src/index.mjs` | Aceite atômico, callables e retenção                |
| `firestore.rules`, `firestore.indexes.json`               | Proteção e índice de listagem                       |
| `src/features/image-library`                              | Modelo, serviço, página, seletor e testes           |
| `src/features/books`                                      | Associação de capa, formulários, navegação e testes |
| `src/features/auth`, `src/app`                            | Saldo, menu da conta e composição do header         |
| `src/shared/ui`                                           | Dropdown/Tooltip acessíveis e exemplos no catálogo  |
| `e2e`, `vite.visual.config.ts`                            | Contratos de navegador e serviços fictícios         |
| `AGENTS.md`, `docs/`                                      | Regra de seleção, arquitetura, operação e ADR 0017  |

## Testes

| Teste                                                                                    | Tipo                 | Cobertura                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `ImageLibrary.test.tsx`, `imageLibraryService.test.ts`                                   | Componente/serviço   | Gerenciamento, seleção, páginas, erros, exclusão pendente e troca de conta          |
| `BookCreationWizard.test.tsx`, `BookFormDialog.test.tsx`, `generatedBookService.test.ts` | Componente/serviço   | Reutilização, remoção de vínculo e erros de gravação                                |
| `BookNavigation.test.tsx`, `bookNavigationService.test.ts`                               | Componente/serviço   | Menu por teclado, breadcrumb, atualização e privacidade                             |
| `AuthButton.test.tsx`, `CreditsBadge.test.tsx`                                           | Componente           | Dropdown, saída bloqueada, tooltip por foco/toque                                   |
| `functions/test/generation.test.mjs`                                                     | Backend              | Idempotência, propriedade, vários livros, concorrência, exclusão, migração e cursor |
| `tests/firestore/book-generation.rules.test.mjs`                                         | Emulador             | Biblioteca privada e impossibilidade de forjar vínculos                             |
| `e2e/visual/image-library.visual.ts`                                                     | Chromium             | Biblioteca/header nos três temas, desktop/mobile e 320 px                           |
| `e2e/visual/writer.visual.ts`                                                            | Chromium             | Regressão de criação por IA e biblioteca de livros                                  |
| `e2e/styleguide.spec.ts`                                                                 | Chromium/bundle real | Temas e menu/tooltip no catálogo                                                    |

Saída real da validação final:

```text
Test Files  70 passed (70)
     Tests  444 passed (444)
All files: statements 93.65, branches 83.12, functions 91.38, lines 95.64
scripts: tests 66, pass 66, fail 0
backend: tests 20, pass 20, fail 0
Smoke test do bundle OK.
```

## Validações executadas

| Comando                                                                                                                     | Resultado                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run validate`                                                                                                          | Verde: arquitetura, documentação, styleguide, formato, lint, testes, tipos e build |
| `npm run test:rules`                                                                                                        | 30 passaram, zero falhas; somente emulador demo                                    |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/image-library.visual.ts`                               | 12 passaram                                                                        |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/writer.visual.ts --grep 'wizard\|biblioteca populada'` | 12 passaram                                                                        |
| `npm run test:e2e`                                                                                                          | 6 passaram; 1 pulado pela ausência de baseline Windows do styleguide               |
| `git diff --check`                                                                                                          | Sem erros                                                                          |

Evidências revisadas visualmente: [desktop](evidencias/2026-10-10-image-library-desktop.png)
e [celular](evidencias/2026-10-10-image-library-mobile.png). São dados fictícios;
a suíte visual bloqueia rede externa e não usa credenciais reais.

## Fora do escopo

Upload manual, biblioteca de textos, edição avançada de imagens, novo provedor
e mudanças na geração do editor.

## Limitações e pendências conhecidas

- Esta entrega não foi implantada nem enviada ao remoto. Produção precisa de funções, índice e regras antes do frontend.
- Não há PR/CI verificado nesta entrega local.
- Arquivos antigos já excluídos não podem ser recuperados.
- Liberação de uso após excluir um livro aguarda o trigger assíncrono.
- URLs com token continuam acessíveis a quem possui o link; metadados da biblioteca são privados.
- A comparação visual pixel a pixel do styleguide foi pulada no Windows por não haver baseline dessa plataforma; os contratos de cores/temas passaram.
- O build mantém os avisos anteriores sobre tamanho de chunk e import de exportação DOCX.
- O arquivo `skills/plan-feature.zip`, criado durante o trabalho e alheio à entrega, foi preservado fora do commit.

## Como verificar manualmente

1. Aceitar uma capa no wizard, cancelar e abrir **Meus Livros → Biblioteca de Imagens**.
2. Criar dois livros usando essa imagem; confirmar que a reutilização não altera o saldo.
3. Verificar exclusão bloqueada, retirar a capa dos livros e excluir a imagem com confirmação.
4. Abrir uma obra e verificar o título no header; abrir a conta para email/saída e focar/tocar o saldo para ver o plano.

Operação detalhada em [biblioteca de imagens](../image-library.md).

## Incremento em 2026-10-10: biblioteca selecionada no header

O dropdown passa a mostrar **Biblioteca de Imagens** quando essa página está
selecionada, com seu ícone correspondente. A barra fica entre **Writer Assistant**
e o dropdown. O nome da biblioteca deixa de ser repetido no breadcrumb; o título
da obra continua disponível nas rotas privadas de livros.

`BookNavigation.test.tsx` cobre o valor selecionado, a posição da barra e a troca
para Meus Livros. A suíte visual verifica o dropdown nos três temas, em desktop
e celular. O diff foi revisado e `git diff --check` passou.

Validações reais deste incremento:

```text
npm run validate
Resultado: verde
Test Files  70 passed (70)
     Tests  445 passed (445)
scripts: tests 66, pass 66, fail 0
backend: tests 20, pass 20, fail 0
Smoke test do bundle OK.
Chromium (header compacto): 6 passed (27.3s)
```

Evidências: [desktop](evidencias/2026-10-10-selected-library-header-desktop.png)
e [celular](evidencias/2026-10-10-selected-library-header-mobile.png).
Deploy permanece pendente.
