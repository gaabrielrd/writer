# Writer V2 — Estúdio e projetos privados

- **Data**: 2026-10-13
- **Branch**: `codex/writer-v2`, checkout isolado; base `079d4e9`
- **Plano de origem**: [F2-01 executável](../tasks/writer-v2/execucao/07-estudio-projetos.md)
- **PR**: [21, em rascunho para master](https://github.com/gaabrielrd/writer/pull/21)

## Objetivo

Permitir que autores retomem seus livros e mestres criem projetos particulares
no mesmo Estúdio, com aventura e campanha próprias, independentes de um livro
auxiliar. A autorização conserva as condições humanas e comerciais pendentes.

## Funcionalidades entregues

- **Estúdio** — entrada autenticada em `/studio`, com livros, aventuras e campanhas,
  filtro por tipo/estado, páginas independentes e carregamento/erro/retry por seção.
- **Projetos privados** — criar aventura autoral ou campanha independente, com
  título, sinopse/descrição e universo opcional; detalhes retomam os metadados salvos.
- **Criação recuperável** — operação estável, payload normalizado e recibo no servidor;
  resposta incerta preserva pedido, bloqueia alterações e oferece verificar a criação.
  Troca de conta descarta a sessão e suas respostas atrasadas.
- **Compatibilidade dos livros** — fluxos manual, importação e IA reutilizados,
  mantendo IDs, editor, capítulos, atos, capas, lore, publicação e contagem.
  Preparação legada em lotes corrige somente datas/estado a partir de metadados reais.
- **Universos** — vínculos e contadores por tipo entram na transação da criação;
  exclusão confere contadores e referências dos três tipos.
- **Navegação** — cinco espaços aprovados, título privado do livro e biblioteca de
  imagens em `/library`. Publicações, Catálogo e Biblioteca informam disponibilidade
  futura; não exibem obras ou compras fictícias.

## Critérios de aceite

- [x] Retomar livro existente e criar campanha sem livro fictício.
- [x] Aventura/campanha independente ou vinculada a universo próprio.
- [x] Autoria derivada de Auth; terceiros/anônimos não leem por lista ou URL direta.
- [x] Retry idêntico não duplica recurso, recibo ou contador; payload alterado é recusado.
- [x] Resposta incerta e falha parcial têm recuperação; troca de conta ignora resposta antiga.
- [x] Datas reais, lotes limitados, cursores validados e conteúdo legado preservado.
- [x] Regressões dos livros, três temas, teclado e 320 px verificados.
- [x] Validate local verde e revisão independente sem bloqueadores.

A definição de concluído também exige CI verde no head do PR. O SHA e os checks
remotos são acompanhados no PR 21; este registro de validação local não antecipa
aprovação remota e não usa o CI da base anterior como aprovação deste incremento.

## Arquivos alterados

| Área                                                               | Mudança                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/app`, `home`, `books/BookNavigation`                          | Navegação global, rotas e entrada autenticada; contexto privado do livro. |
| `src/features/studio`, `adventures`, `campaigns`                   | Listagem, criação, detalhes privados, serviços e testes.                  |
| `books/studioBookService`, `BookCard`, `universes`                 | APIs públicas, resumo tipado, seletores e contadores por tipo.            |
| `functions/src/studio.mjs`, `index.mjs`, `universes.mjs`           | Seis callables, transações, preparação e exclusão protegida.              |
| `functions/src/chapterChat.mjs`                                    | Recusar data fora do intervalo antes de escrita/débito Admin.             |
| `firestore.rules`, `firestore.indexes.json`, testes backend/regras | Isolamento, datas, limites, cursores, concorrência e regressões.          |
| `e2e/visual`, `vite.visual.config.ts`                              | Fixtures isoladas e cenários novos/existentes adaptados à navegação.      |
| README, PRD, arquitetura, ADR 0025, AGENTS, testes e plano V2      | Contratos implementados, autorização, limites e evidência.                |

## Testes

| Rede                        | Resultado e comportamento                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Frontend completo           | 127 arquivos/928 testes: lista, criação, retry, conta, detalhes, datas e regressões.             |
| Scripts                     | 77: arquitetura, documentação, toolchain, fixtures e contratos de CI, entre os existentes.       |
| Backend completo            | 99: autoria, recibos, universo, preparação, paginação e serviços existentes.                     |
| Firestore real              | 58: regras, dados/tempos reais do snapshot, concorrência e Admin SDK no emulador.                |
| Estúdio no Chromium         | 48: oito cenários nos seis projetos, com teclado/320 px nos três temas.                          |
| Regressão visual pertinente | 129 passaram; três skips previstos da prévia exclusiva de desktop no celular.                    |
| Bundle de produção          | Seis passaram; um skip preexistente da imagem de referência de styleguide ausente na plataforma. |

O teste Admin de aceite recusa datas inválidas conservando dados e `updateTime`
dos documentos, créditos e ausência de recibo. Após corrigir a data, o mesmo pedido
aplica uma vez; retry não debita novamente. Os testes de datas não relaxam regras.
As fixtures visuais simulam persistência; servidor/regras são verificados separadamente
no emulador fictício, sem projeto Firebase produtivo ou pagamento real.

Saídas observadas na execução final:

```text
Test Files  127 passed (127)
Tests  928 passed (928)
All files | 92.94 | 86.5 | 91.46 | 95
scripts: tests 77, pass 77, fail 0
backend: tests 99, pass 99, fail 0
regras: tests 58, pass 58, fail 0
48 passed (2.0m)
3 skipped, 129 passed (7.5m)
1 skipped, 6 passed (16.7s)
Smoke test do bundle OK.
```

## Validações executadas

| Comando                                                                                | Resultado                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions`                                                            | Código 0; zero vulnerabilidades.                                                                  |
| `npm run validate`                                                                     | Código 0; skills/arquitetura/docs/styleguide/formato/lint/testes/tipos/syntax/build/smoke verdes. |
| `npm run test:rules`                                                                   | Código 0, emulador local 1.22.0, 58 testes.                                                       |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/studio.visual.ts` | Código 0, 48 cenários.                                                                            |
| Cinco arquivos visuais de regressão                                                    | Código 0; writer, studio-forms, book-creation-preview, image-library e universes.                 |
| `npm run test:e2e`                                                                     | Código 0, bundle produtivo.                                                                       |
| Revisão independente                                                                   | Sem bloqueadores após ajustes; frontend e backend revisados por agentes diferentes.               |
| Inspeção de capturas                                                                   | Três temas em 320 px e formulários desktop/celular; sem transbordamento ou ações cortadas.        |

A primeira execução das regras encontrou uma fixture de criação de livro sem datas.
As fixtures positiva e negativa receberam datas válidas; as regras foram preservadas
e a suíte integral passou. O primeiro validate passou nos testes e falhou em sete
acessos possivelmente indefinidos de chamadas mockadas. Extração tipada com falha
explícita resolveu o problema; o validate integral foi repetido e passou.

Os avisos existentes de engine Node 22 nas functions sob Node 24.21.0/npm 10.6.0,
dependências deprecated, chunks grandes e importação de `exportDocx` permanecem.
Nenhum limite de cobertura, timeout, asserção ou snapshot foi relaxado para passar.

## Fora do escopo

Cenas, arcos, metas, histórico, estrutura narrativa de aventura, variantes, sessões,
convites, marketplace, checkout, repasses e deploy. Não adicionar dependências.

## Limitações e pendências conhecidas

- Piloto humano e habilitação/contratos comerciais permanecem pendentes nos aceites
  respectivos; F2-01 não encerra integralmente a fase 1 nem a fase 2.
- Os metadados novos não são um editor de aventura ou sessão jogável. F2-02 e
  seguintes continuam no plano, sem alegação de implementação.
- Produção exige implantação autorizada de functions, regras e índices. Não foi
  executado deploy, merge ou operação comercial live.
- Preparação é alteração explícita de metadados legados. Erro de estado/datas sem
  metadado utilizável interrompe o lote sem inventar valores ou ocultar o livro.
- Paginação observa o estado atual, sem snapshot global congelado. Mudanças
  concorrentes podem mover itens; a UI deduplica e permite atualizar.
- Checkout original `E:/Mega/dev/writer` foi conferido limpo e preservado.

## Como verificar manualmente

1. Em ambiente com functions/regras/índices correspondentes, autenticar e abrir `/studio`.
2. Aguardar preparação de livros; abrir livro existente e navegar por editor/lore.
3. Em Novo projeto, criar campanha sem universo; conferir descrição nos detalhes e
   retomada após recarga. Criar aventura com universo e conferir sua contagem.
4. Filtrar tipo/estado, carregar mais e atualizar a lista. Simular falha parcial ou
   resposta perdida e verificar preservação do pedido e retry sem duplicação.
5. Trocar de conta durante resposta pendente; o projeto privado anterior não aparece.
6. Usar teclado e os três temas em 320 px; abrir os cinco espaços e a biblioteca de imagens.

As capturas locais do Estúdio foram preservadas fora do checkout em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-estudio-qa`.
Esse diretório é evidência visual local com dados fictícios, sem conteúdo real de usuários.

## Confirmação de CI — 2026-10-13

O incremento F2-01 foi registrado em `15cd4173172aaae6dea92388977a8f0df0babe39`.
O [CI completo](https://github.com/gaabrielrd/writer/actions/runs/38411066845)
e as [regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/38411067039)
passaram nesse SHA. A suíte visual remota teve 540 testes aprovados, 12 skips
preexistentes e nenhum retry. Isso confirma a conclusão técnica; o PR continua
em rascunho e os aceites humanos/comerciais continuam pendentes.
