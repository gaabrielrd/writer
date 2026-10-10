# Universos e lore compartilhado

- **Data**: 2026-10-10
- **Branch**: `codex/image-library-header`
- **Plano de origem**: plano aprovado na conversa, incluindo vínculo e desvínculo
  de livros existentes e integração aos recursos atuais do livro.

## Objetivo

Permitir que um autor reutilize um universo em vários livros, mantendo o lore
local separado do lore global e editando fichas em etapas curtas.

## Funcionalidades entregues

- **Gestão de universos** — página Lore compartilhado no dropdown do header,
  criação, edição, exclusão protegida e compêndio de cada universo.
- **Vínculo de livros** — seleção opcional na primeira etapa de criação e
  vínculo, troca ou desvínculo nas configurações de livros existentes.
- **Dois escopos de lore** — compêndio e painel do editor permitem consultar,
  criar e editar fichas locais e globais separadamente.
- **Formulários por etapas** — identificação, características, história/notas e
  relações/visibilidade; voltar e retentar preservam os valores.
- **Integração ao manuscrito** — reconhecimento, menções e contexto da IA usam
  ambos os escopos, com prioridade determinística para termos locais.
- **Publicação protegida** — projeções incluem apenas campos públicos;
  exclusão ou revogação de lore global público bloqueia imediatamente as
  versões anteriores dos livros afetados, inclusive acesso por URL direta.
- **Backup privado** — JSON versão 2 separa lore local e cópia do universo;
  livros independentes mantêm o formato versão 1.

## Critérios de aceite

- [x] Universos pertencem ao autor e podem ser compartilhados entre seus livros.
- [x] Lore compartilhado é acessível pelo dropdown e cobre carregamento,
      vazio, erro e sucesso.
- [x] Selecionar um universo permite gerenciar suas entidades de lore.
- [x] O primeiro passo da criação oferece universos existentes sem criar
      uma etapa adicional.
- [x] Livros vinculados apresentam lore local e global editáveis separadamente.
- [x] Vincular, trocar ou desvincular preserva capítulos, capas e lore local.
- [x] Criação e edição de lore usam grupos de campos em quatro etapas.
- [x] Menções, reconhecimento, IA, leitura pública e backups consideram o universo.
- [x] Originais privados e mutações globais ficam protegidos por autoria e servidor.
- [x] Retentativas e concorrência não duplicam vínculos ou entidades.
- [x] Livros e publicações legados continuam funcionando sem migração.

## Arquivos alterados

| Arquivos                                                                                                                           | Mudança                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/features/universes/`                                                                                                          | Modelos, serviços, seletor, páginas e testes da nova feature.               |
| `src/app/routes/index.tsx`, `src/features/books/components/BookNavigation.tsx`                                                     | Rotas e navegação Lore compartilhado.                                       |
| `src/features/books/components/BookCreationWizard.tsx`, `BookFormDialog.tsx`, `model/book.ts`, `services/bookService.ts`           | Seleção e persistência do vínculo opcional.                                 |
| `src/features/lore/model/`, `services/loreService.ts`, `hooks/useLore.ts`, `index.ts`                                              | Escopos, IDs globais, prioridade de termos, persistência e sincronização.   |
| `src/features/lore/components/LoreTab.tsx`, `LoreEntityForm.tsx`, `LoreEntityForm.module.css`                                      | Compêndios separados e formulário por etapas.                               |
| `src/features/editor/components/EditorPage.tsx`, `EditorLoreSidebar.tsx`, `MentionMenu.tsx`                                        | Entidades globais no editor, identificação de escopo e edição separada.     |
| `src/features/books/model/publicBook.ts`, `services/publicationService.ts`, `publicBookService.ts`                                 | Projeção pública versão 2, consentimento e revogação observada pelo leitor. |
| `src/features/editor/services/exportManuscript.ts`                                                                                 | Backup versão 2 com snapshot do universo.                                   |
| `functions/src/universes.mjs`, `imageLibrary.mjs`, `index.mjs`, `functions/package.json`                                           | Callables, validação, vínculos atômicos e limpeza segura.                   |
| `firestore.rules`, `tests/firestore/universes.rules.test.mjs`                                                                      | Autoria, isolamento de originais e proteção das projeções públicas.         |
| `src/features/{books,editor,lore,universes}/tests/`, `functions/test/universes.test.mjs`                                           | Testes dos comportamentos novos e compatibilidade.                          |
| `e2e/visual/universes.visual.ts`, `fixtures/universeService.ts`, `fixtures/loreService.ts`, `vite.visual.config.ts`                | Fluxo integrado de interface com fixtures isoladas.                         |
| `AGENTS.md`, `README.md`, `docs/{architecture,prd,book-creation,publication-security,styleguide,testing,shared-lore}.md`, ADR 0018 | Regras do servidor, comportamento, decisões e implantação.                  |

O checkout recebeu também alterações paralelas de interface em BookPage,
ChapterList, header e exportações. Elas foram preservadas e não são atribuídas
a esta entrega. O diff foi revisado sem remover o trabalho paralelo.

## Testes

| Testes                                                                                                                  | Tipo               | Cobertura                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `UniversePage.test.tsx`, `universeService.test.ts`                                                                      | Interface/serviços | Gestão, autenticação, estados de erro, seleção, retentativa e lore global.                     |
| `LoreEntityForm.test.tsx`, `LorePage.test.tsx`, `loreService.test.ts`, `globalLoreService.test.ts`, `loreScope.test.ts` | Interface/unidade  | Etapas, preservação de dados, separação de escopos, IDs e criações idempotentes.               |
| `BookCreationWizard.test.tsx`, `BookFormDialog.test.tsx`, `BookNavigation.test.tsx`                                     | Interface          | Seleção na criação, vínculos existentes e navegação.                                           |
| `EditorPage.test.tsx`, `EditorLoreSidebar.test.tsx`, `exportManuscript.test.ts`                                         | Integração/unidade | Lore global no manuscrito, edição separada, menções e backup completo.                         |
| `publicationService.test.ts`, `publicBookService.test.ts`                                                               | Serviços           | Consentimento, conflitos de termos, versões, revogação e compatibilidade.                      |
| `functions/test/universes.test.mjs`                                                                                     | Servidor           | Autoria, vínculo atômico, retentativas, concorrência, relações e exclusão segura.              |
| `tests/firestore/universes.rules.test.mjs`                                                                              | Emulador           | Isolamento, escrita forjada, campos privados, procedência e revogação em URLs diretas.         |
| `e2e/visual/universes.visual.ts`                                                                                        | Navegador          | Universo, ficha por etapas, dois livros vinculados e editor em desktop/celular nos três temas. |

Trechos reais das saídas finais:

```text
Test Files  74 passed (74)
     Tests  483 passed (483)
All files          |   93.48 |    84.08 |   91.23 |   95.59 |

# Testes dos scripts de setup
ℹ tests 66
ℹ pass 66
ℹ fail 0

# Testes de functions
ℹ tests 28
ℹ pass 28
ℹ fail 0

# Regras do Firestore
ℹ tests 35
ℹ suites 2
ℹ pass 35
ℹ fail 0

# Fluxo visual de universos
6 passed (32.3s)

# E2E do bundle de produção
1 skipped
6 passed (15.9s)
```

A cobertura corresponde, na ordem, a statements, branches, functions e lines.
Nenhum limite foi reduzido. O teste de snapshot do styleguide é ignorado no
Windows pelo condicionamento já existente; os três temas foram exercitados nos
fluxos de universos e do styleguide. As capturas do fluxo de universos também
foram inspecionadas visualmente.

## Validações executadas

| Comando                                                                                   | Resultado                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm ci --prefix functions`                                                               | Dependências instaladas; nenhuma dependência adicionada.                                               |
| `npm run validate`                                                                        | Verde: skills, arquitetura, documentação, styleguide, formato, lint, testes, typecheck, build e smoke. |
| `npm run test:rules`                                                                      | Verde: 35 testes no emulador com projeto fictício.                                                     |
| `npm run test:e2e`                                                                        | Verde: 6 passaram, 1 snapshot condicionado à plataforma ignorado.                                      |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/universes.visual.ts` | Verde: 6 combinações de viewport/tema.                                                                 |
| `git diff --check`                                                                        | Sem erros de whitespace.                                                                               |

```text
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
Smoke test do bundle OK.
```

## Fora do escopo

Colaboração entre autores, vários universos por livro, conversão automática de
lore local, importação/restauração de universos, migração e republicação em lote.

## Limitações e pendências conhecidas

- No encerramento da implementação, ainda não havia commit, push, PR ou CI.
  O pedido posterior de commit e sincronização está registrado abaixo; PR e
  execução de CI continuam pendentes.
- Não houve deploy. A liberação exige implantar functions, regras e frontend
  em conjunto, conforme [shared-lore.md](../shared-lore.md).
- O runtime local é Node 24; `functions` declara Node 22. A instalação emitiu o
  aviso de engine, mas os testes e verificações locais passaram.
- O build conserva avisos de tamanho de bundle e importação dinâmica de DOCX;
  otimização de chunks está fora do escopo desta funcionalidade.
- A exclusão de livros libera a contagem do universo por trigger, com pequeno
  atraso. Revogar lore global torna snapshots antigos indisponíveis; o status
  salvo dos livros pode continuar publicado até a próxima republicação.
- O teste integrado da interface usa fixtures. Regras e lógica de servidor
  foram verificadas separadamente; não houve escrita no Firebase de produção.

## Como verificar manualmente

1. Com o backend atualizado, entrar como autor e abrir **Lore compartilhado**
   no dropdown do header; criar um universo e abrir seu compêndio.
2. Criar uma ficha global, avançar pelas quatro etapas, voltar e conferir que
   os campos foram preservados; salvar somente na etapa final.
3. Criar dois livros selecionando esse universo na primeira etapa. Em cada
   compêndio alternar entre lore local e global; a ficha global é a mesma.
4. Nas configurações de um livro existente, vincular, trocar ou remover o
   universo; capítulos, capa e fichas locais permanecem.
5. No editor, mencionar uma entidade global, abrir sua ficha e editar no
   escopo global; conferir o contexto da IA e o reconhecimento no texto.
6. Publicar um livro com ficha global pública, depois torná-la privada; a
   publicação anterior fica indisponível, inclusive com URL direta.
7. Exportar um backup JSON do livro vinculado e conferir `version: 2`, lore
   local e snapshot separado do universo; o livro independente mantém versão 1.

Veja [a decisão arquitetural](../decisions/0018-shared-universes-and-lore.md).

## Atualização de 2026-10-10 — preparação do commit

O autor solicitou commit e sincronização, preservando alterações paralelas.
Foram selecionados somente os arquivos da funcionalidade e os trechos de lore
do header e do styleguide. Ajustes de layout, BookPage, ChapterList, exportações
e seus testes permaneceram fora do índice, assim como `skills/plan-feature.zip`.
A comparação de SHA-256 confirmou a preservação dos 14 arquivos com trabalho
paralelo, incluindo os dois arquivos selecionados parcialmente.

O conteúdo do índice foi extraído para uma cópia isolada, sem esses ajustes.
O teste visual de universos foi adaptado para acessar as configurações tanto
pela interface existente quanto pelo menu do trabalho paralelo. Nessa cópia,
`npm run validate` e os seis fluxos visuais passaram. Os cinco testes a menos
pertencem à interface paralela e não foram removidos do checkout original.

```text
Test Files  74 passed (74)
     Tests  478 passed (478)
All files          |   93.46 |    84.03 |   91.08 |   95.56 |
ℹ tests 66
ℹ pass 66
ℹ fail 0
ℹ tests 28
ℹ pass 28
ℹ fail 0
Smoke test do bundle OK.
6 passed (1.1m)
```

A sincronização usa a branch atual `codex/image-library-header`, sem integração
em `master` nem deploy. O fetch confirmou que a base remota já era ancestral
da branch, sem commits novos para integrar.
