# Suporte a atos e seleção de capítulos

- **Data**: 2026-10-11
- **Branch**: `codex/suporte-atos`
- **Base**: `22fc630e30dcf06317c5b4d70a07b3ef62f64bb0`
- **Plano de origem**: plano aprovado na conversa
- **Ambiente**: worktree separada `suporte-atos/writer`

## Objetivo

Permitir organizar o manuscrito em atos, filtrar e selecionar capítulos para
movimentação ou exclusão, mantendo a estrutura no leitor público e exportações.

## Funcionalidades entregues

- **Atos** — criação em modal com nome opcional; numerais romanos pela posição,
  incluindo atos nomeados. Atos vazios são visíveis ao autor.
- **Organização** — capítulo pode nascer em um ato; Sem ato vem por último.
  Numeração de capítulos segue a sequência inteira de leitura. Reordenação atua
  no grupo completo, mesmo com busca ativa.
- **Busca e seleção** — filtro discreto ao lado de Novo capítulo, sem distinção
  de caixa ou acentos; seleção individual ou dos resultados exibidos, com
  checkbox intermediário. Busca, livro e saída da aba limpam a seleção.
- **Confirmações** — movimentação e exclusão usam modais com quantidade e títulos.
  Cancelamento conserva seleção; falhas permitem nova tentativa. Operações são
  atômicas, preservam conteúdo ao mover e atualizam palavras ao excluir.
  Dados alterados desde a seleção recusam a operação inteira.
- **Leitura pública** — sumário agrupado, identificação do ato atual e navegação
  entre atos sem mudar IDs ou links de capítulos. Alterações exigem republicação.
- **Exportações** — PDF, DOCX e Markdown incluem cabeçalhos de atos preenchidos,
  com a mesma sequência. DOCX e Markdown conservam hierarquia de capítulos e
  títulos internos. Backup JSON com atos usa versão 4 e inclui atos vazios.
- **Compatibilidade e segurança** — livros e publicações antigos continuam
  funcionando; vínculos entre livros são recusados e revisões públicas são
  imutáveis. Exclusão de livro limpa atos privados e públicos.

## Critérios de aceite

- [x] Criar atos nomeados e sem nome, com numerais superiores a IX.
- [x] Agrupar capítulos sem alterar seu conteúdo ou identificadores.
- [x] Filtrar por nome e selecionar somente resultados visíveis.
- [x] Confirmar e cancelar movimentação e exclusão em modais acessíveis.
- [x] Bloquear envio duplicado, falhas parciais e exclusão de dados modificados.
- [x] Preservar contagens e ordem comum na lista, editor, leitor e exportações.
- [x] Suportar teclado, foco, três temas e largura de 320 px.
- [x] Executar validação local completa e regras reais no emulador.
- [x] Revisar o diff e documentar decisões e evidências.

## Arquivos alterados

| Área                  | Arquivos e mudança                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo e persistência | `books/model/act.ts`, modelos de capítulo/publicação, `chapterOrganizationService.ts` e `bookService.ts`: atos, vínculos, transações, contagens e versões monotônicas. |
| Organização do autor  | `ChapterList.tsx`, CSS, `useActs.ts` e `useChapters.ts`: grupos, filtro, seleção, modais, estados e reordenação.                                                       |
| Publicação e leitura  | `publicationService.ts`, `publicBookService.ts`, `ReaderView.tsx` e CSS, `firestore.rules`: projeções mínimas, leitura e validação dos vínculos.                       |
| Exportação            | Modelo de documento e serviços de Markdown, DOCX, PDF e manuscrito: cabeçalhos, hierarquia e backup 4.                                                                 |
| Verificação           | Testes de books/editor; `acts.rules.test.mjs`; `acts.visual.ts`, fixtures e configuração de porta da suíte visual.                                                     |
| Documentação          | [Atos](../book-acts.md), [ADR 0021](../decisions/0021-book-acts.md), arquitetura, styleguide, testes e segurança de publicação.                                        |

## Testes

| Teste                                                      | Tipo             | Cobertura                                                                                            |
| ---------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `act.test.ts`                                              | Unidade          | Numerais, nomes, ordem estável e filtro sem acentos.                                                 |
| `chapterOrganizationService.test.ts`                       | Serviço          | Criação, movimentação, exclusão, contagens, conflitos, limites e destino inválido.                   |
| `ChapterList.test.tsx`                                     | Componente       | Grupos, busca, seleção, cancelamento, confirmação, falhas, foco e impacto na publicação.             |
| `bookService.test.ts`                                      | Serviço          | Transações, sequência para consumidores e duas edições no mesmo milissegundo.                        |
| `publicationService.test.ts` / `publicBookService.test.ts` | Serviço          | Projeção mínima, ordenação, atos vazios, vínculos órfãos e compatibilidade.                          |
| `ReaderView.test.tsx`                                      | Componente       | Sumário e navegação entre atos com links diretos.                                                    |
| `actExports.test.ts` / `exportManuscript.test.ts`          | Artefato/serviço | Markdown, OOXML, HTML de impressão e backup 4.                                                       |
| `acts.rules.test.mjs`                                      | Emulador         | Autoria, vínculo local, atos imutáveis, projeções sem campos extras e revogação.                     |
| `acts.visual.ts` e cenários existentes                     | Chromium         | Três temas, desktop/celular, 320 px, modais, foco, busca alinhada, leitor e arquivos DOCX/PDF reais. |

Saída real da validação e cobertura:

```text
Test Files  84 passed (84)
Tests  619 passed (619)
All files          |   93.12 |    86.22 |   91.48 |   95.08 |
ℹ tests 66
ℹ pass 66
ℹ fail 0
ℹ tests 46
ℹ pass 46
ℹ fail 0
Smoke test do bundle OK.
```

## Validações executadas

| Comando                                                                                    | Resultado                                                                                                            |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions --no-audit --no-fund`                                           | Dependências do backend instaladas antes de validar.                                                                 |
| `npm run validate`                                                                         | Verde: skills, arquitetura, docs, styleguide, formatação, lint, cobertura, setup, backend, typecheck, build e smoke. |
| `npm run test:rules`                                                                       | 42 passaram; emulador local e identidades fictícias.                                                                 |
| `npx playwright test --config playwright.visual.config.ts` com os seis arquivos relevantes | 174 passaram, nos três temas e desktop/celular.                                                                      |
| `git diff --check`                                                                         | Sem erros.                                                                                                           |

A suíte visual foi executada com `WRITER_VISUAL_PORT=4457`, usando fixtures
isoladas e bloqueio de rede externa, para os arquivos `acts.visual.ts`,
`writer.visual.ts`, `exports.visual.ts`, `reader.publication.visual.ts`,
`import-documents.visual.ts` e `dialog-layout.visual.ts`.

```text
174 passed (7.7m)
ℹ tests 42
ℹ pass 42
ℹ fail 0
```

A regressão detectou um transbordamento de 2 px após criar capítulo e reduzir a
tela para 320 px. A barra foi corrigida e o cenário, incluindo alinhamento
vertical das linhas, passou novamente. Capturas da lista, modais, leitor e
impressão foram inspecionadas visualmente. PDF e DOCX reais estão anexados no
relatório Playwright local.

Os finais de linha CRLF da worktree foram normalizados para a formatação exigida.
O diff Git final contém somente os arquivos da feature; as cópias locais de
skills foram sincronizadas novamente.

## Fora do escopo

Renomear, excluir e reordenar atos manualmente; atos aninhados; arrastar e soltar;
reconhecimento automático de atos na importação; restauração de backup JSON.

## Limitações e pendências conhecidas

- Máximo de 3999 atos e 200 capítulos por ação em lote/reordenação.
- Persistência estrutural e leitura pública exigem conexão.
- Alterar/excluir capítulos do rascunho não modifica uma revisão publicada;
  atualizar ou retirar a publicação é uma ação explícita.
- O diálogo final de salvar/imprimir PDF pertence ao navegador.
- Build conserva avisos de tamanho de bundle e importação dinâmica ineficaz,
  sem falha dos gates; otimização de bundle fica fora do escopo.
- Pull request e CI remoto permanecem pendentes desta entrega local.
- Aplicação e regras novas devem ser implantadas juntas antes de uso real.
  Nenhuma regra ou dado de produção foi alterado nesta execução.

## Como verificar manualmente

1. Na aba Capítulos, criar um ato sem nome e outro nomeado.
2. Filtrar capítulos, selecionar resultados e abrir Mover para ato.
3. Cancelar e confirmar; verificar conteúdo preservado, agrupamento e ordem.
4. Selecionar capítulos e confirmar exclusão; conferir contagens.
5. Publicar explicitamente e conferir sumário e navegação entre atos.
6. Exportar PDF, DOCX e Markdown; conferir cabeçalhos e sequência.
7. Conferir o backup JSON e repetir a interface em 320 px e nos três temas.

## Compatibilidade com o checkout ativo

A preparação da integração recebeu o estado 237b63d do checkout ativo,
preservando personas e a limpeza de fontes/skills. Criação de capítulos
valida a persona complementar na API pública e persiste seu vínculo junto do ato.
O backup v4 mantém atos, sequência, personas utilizadas e seus vínculos;
livros sem atos conservam a seleção das versões anteriores.

- `npm run validate`: passou, 91 arquivos / 649 testes de frontend,
  68 testes de setup e 46 testes de backend.
- Cobertura: 93,05% statements, 86,39% branches, 91,49% functions,
  95,02% lines, acima dos limites.
- Regras combinadas com personas: 45 testes passaram no emulador local.
- Navegador: 36 cenários de atos/personas passaram nos três temas,
  desktop/celular, incluindo 320 px, publicação, PDF e DOCX.
- Novos testes verificam criação com persona e ato, rejeição de persona
  inválida antes da persistência e backup v4 com ambos os recursos.
- Mocks de organização nos testes de interface foram isolados para evitar
  carregar serviços reais durante a preparação do mock.

A validação foi repetida após corrigir a tipagem de um teste e o isolamento
dos mocks. Os logs anteriores não representam o estado final.

## Integração na master

O estado final combina atos/personas com a master 79f498e, que já contém
o checkout ativo e a criação assistida. O único conflito desta combinação,
na fixture de livros do navegador, preserva tanto atos quanto o seed da
criação assistida. A transferência para master usa avanço direto do estado
já combinado e validado na worktree de atos.

- `npm run validate`: passou, 93 arquivos / 660 testes de frontend,
  68 testes de setup e 63 testes de backend.
- Cobertura: 93,04% statements, 86,21% branches, 91,51% functions,
  95,06% lines.
- Regras finais: 46 testes passaram no emulador local.
- Navegador final: 30 cenários de atos/criação assistida passaram nos três
  temas e em desktop/celular; a validação anterior de atos/personas permanece
  registrada acima.
- Revisão do diff e `git diff --check`: sem problemas.
- Os commits locais preservam o trabalho de personas, a criação assistida,
  a limpeza de fontes/skills e a implementação original de atos.
- Nenhum push, pull request ou deploy foi realizado nesta integração.

## Implantação autorizada posterior

Após a integração, o usuário autorizou o deploy de functions, rules e Hosting.
A versão 6ddddfb foi implantada em writer-44cd5, com backend, regras, índices
e arquivos publicados verificados. Veja o
[registro do deploy](2026-10-11-deploy-atos-servicos.md).
