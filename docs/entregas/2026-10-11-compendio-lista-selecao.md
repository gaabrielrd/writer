# Compêndio compacto, lista e ações por seleção

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Plano de origem**: plano aprovado na conversa, seguido de “pode implementar”

## Objetivo

Compactar a aba Compêndio dos detalhes do livro e permitir seleção de entidades
para ajustar visibilidade ou excluir, com confirmação explícita e preservação
das regras de privacidade existentes.

## Funcionalidades entregues

- **Cabeçalho compacto** — Lista/Grid e Nova Entidade aparecem ao lado das abas
  quando há largura. O portal mantém as ações fora do `tablist`; páginas
  independentes usam os controles locais.
- **Busca e filtros** — busca sem label visual, com nome acessível, alinhada às
  categorias em desktop. Os controles quebram linhas em telas menores.
- **Lista/Grid** — Grid permanece padrão. Lista mostra nome, resumo, categoria,
  visibilidade, ficha, edição, exclusão individual e seleção por checkbox.
- **Seleção** — uma ou várias entidades, selecionar todas as exibidas e estado
  intermediário. Mudança de filtros, modo, escopo, livro ou saída da aba limpa a
  seleção. Remoções sincronizadas também retiram itens da seleção.
- **Barra flutuante** — quantidade, alterar visibilidade, excluir e limpar
  seleção. O conteúdo reserva espaço para manter a última linha acessível.
- **Confirmações** — visibilidade exige escolha explícita Público/Privado,
  inclusive em seleção mista. Exclusão informa que é definitiva. Os modais
  identificam entidades e alcance local/global e avisam sobre revogação de
  publicação. Cancelar não grava e preserva seleção; o foco retorna ao controle.
- **Execução e falhas** — operações sequenciais pelos serviços existentes,
  progresso, bloqueio de envios duplicados e de troca de filtros/escopo/abas
  durante a execução. Sucessos saem da seleção; falhas permanecem para retentativa.
  Após mutações locais, o status nos detalhes do livro é atualizado.
- **Temas e responsividade** — tokens semânticos, avisos com texto legível nos
  três temas, lista e modais verificados até 320 px.

## Critérios de aceite

- [x] Nova Entidade e Lista/Grid alinhados às abas no desktop.
- [x] Busca acessível e categorias na mesma linha quando há espaço.
- [x] Lista permite selecionar uma ou várias entidades.
- [x] Seleção mostra barra fixa no rodapé e pode ser limpa.
- [x] Visibilidade e exclusão em lote só gravam após confirmação.
- [x] Cancelamento, progresso, falhas parciais e foco cobertos por testes.
- [x] Alcance global e revogação de publicação preservados.
- [x] Sem transbordamento horizontal nos três temas e em 320 px.
- [x] Validação local completa verde, documentação atualizada e diff revisado.

## Arquivos alterados

| Arquivo                                             | Mudança                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/features/books/components/BookPage.tsx`        | Espaço de ações, bloqueio das abas durante lote e atualização do livro. |
| `src/features/books/components/BookPage.module.css` | Alinhamento e quebra responsiva do cabeçalho.                           |
| `src/features/books/tests/BookPage.test.tsx`        | Atualização de status e remoção de controles ao sair da aba.            |
| `src/features/lore/components/LoreTab.tsx`          | Composição de controles, visualização, seleção e resultados.            |
| `src/features/lore/components/LorePage.module.css`  | Filtros compactos, lista, barra, modais e responsividade.               |
| `src/features/lore/components/LoreEntityList.tsx`   | Lista selecionável com ações individuais.                               |
| `src/features/lore/components/LoreBulkActions.tsx`  | Barra, confirmações e aplicação com falhas por entidade.                |
| `src/features/lore/tests/LoreCollection.test.tsx`   | Doze cenários de interação, erros, escopos e foco.                      |
| `e2e/visual/compendium.visual.ts`                   | Fluxos reais e medições de layout, incluindo 320 px.                    |
| `docs/styleguide.md`                                | Composição e interação do Compêndio.                                    |
| `docs/shared-lore.md`                               | Seleção, alcance e limites das ações em lote.                           |
| `docs/testing.md`                                   | Cobertura e comando dos testes visuais.                                 |

## Testes

| Teste                                  | Tipo       | O que cobre                                                                                                                                                         |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoreCollection.test.tsx`              | Componente | Grid/lista, ficha/edição, seleção e filtros, cancelamento, visibilidade pública/privada, exclusão, falhas parciais, progresso, foco, sincronização global e portal. |
| `BookPage.test.tsx`                    | Componente | Status após ação de lore e ciclo de vida dos controles.                                                                                                             |
| Testes existentes de lore local/global | Serviço    | Revogação transacional e mutações globais pelo servidor, sem alterar esses contratos.                                                                               |
| `compendium.visual.ts`                 | Playwright | Alinhamento medido, seleção por teclado, confirmação/cancelamento, efeitos de ações, barra e modais em desktop/mobile nos três temas, incluindo 320 px.             |
| Fluxos existentes de livro e universo  | Playwright | Capítulos, compêndio, edição, wizard e compartilhamento entre livros.                                                                                               |

Saída real da última validação:

```text
Test Files  80 passed (80)
     Tests  563 passed (563)
  Duration  152.02s

All files | Statements 93.53 | Branches 85.59 | Functions 91.38 | Lines 95.61

Testes de infraestrutura: tests 68, pass 68, fail 0
Testes de functions: tests 46, pass 46, fail 0
```

## Validações executadas

| Comando                                                      | Resultado                                       |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `npm ci --prefix functions`                                  | Concluído; auditoria com zero vulnerabilidades. |
| `npm run validate`                                           | Verde; saída 0.                                 |
| `npm run check:styleguide`                                   | Verde, incluído no validate.                    |
| `git diff --check`                                           | Sem erros.                                      |
| Playwright: compêndio, universo e detalhes do livro          | 24 cenários verdes, 1,9 minuto.                 |
| Playwright: Compêndio após ajuste final de contraste/medição | 12 cenários verdes, 57,0 segundos.              |

```text
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
✓ built in 1.65s
Smoke test do bundle OK.

24 passed (1.9m)
12 passed (57.0s)
```

Comandos visuais executados:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/compendium.visual.ts e2e/visual/universes.visual.ts e2e/visual/writer.visual.ts --grep 'compêndio compacto|lista e barra|universo, lore|obra, capítulos longos'
npx playwright test --config playwright.visual.config.ts e2e/visual/compendium.visual.ts
```

As capturas foram inspecionadas em desktop, celular e 320 px. Os testes medem
centros verticais com diferença inferior a 1 px no desktop e confirmam que a
última linha fica acima da barra ao rolar até o fim. A medição espera a barra
estar renderizada; não depende de atraso fixo. As fixtures bloqueiam rede externa.

## Fora do escopo

- Persistência da preferência Lista/Grid e seleção no Grid.
- Novas APIs de lote, dependências ou mudanças nas regras de publicação.
- Confirmação nova para a exclusão individual local preexistente.
- Deploy, republicação automática, push ou criação de PR.

## Limitações e pendências conhecidas

- O lote não é atômico como um todo: cada mutação mantém a transação/regra
  existente. Falhas parciais são informadas e podem ser retomadas.
- A exploração da suíte visual geral encontrou percursos anteriores que ainda
  procuram o botão removido de configurações de IA, retorno direto à biblioteca
  e o antigo nome do botão de importação. Uma investigação do percurso atual
  também identificou falha preexistente de retorno de foco do diálogo de IA.
  Essas correções são separadas do Compêndio; `writer.visual.ts` foi preservado.
  Não se afirma que a suíte visual geral inteira esteja verde.
- O build mantém avisos de tamanho de chunks e de import dinâmico ineficaz de
  `exportDocx.ts`, sem falha de build ou smoke test.
- Validação feita na árvore local inteira, preservando alterações paralelas de
  skills/documentação. O registro local no Git foi solicitado após a validação.
  CI em PR permanece pendente para a definição de concluído do projeto.
- A reindexação MCP foi bloqueada pela revisão automática durante o
  planejamento; trechos desatualizados foram conferidos por leitura local.

## Como verificar manualmente

1. Abrir um livro e selecionar Compêndio. Conferir Lista/Grid e Nova Entidade
   junto às abas no desktop, e a busca sem label visual.
2. Alternar para Lista e selecionar uma entidade ou todas as exibidas. Conferir
   o estado intermediário e a barra no rodapé.
3. Abrir Alterar visibilidade, escolher Público ou Privado e cancelar. Conferir
   que a seleção e os dados permanecem. Repetir e confirmar.
4. Selecionar entidades, abrir Excluir e conferir nomes, alcance e aviso de
   publicação; cancelar ou confirmar conscientemente.
5. Filtrar ou trocar modo/escopo/aba para conferir limpeza da seleção. Em lore
   global, verificar o aviso de alteração compartilhada entre livros.
6. Repetir em claro, escuro e sépia e com 320 px. Rolar até a última entidade e
   verificar que a barra não impede acessar suas ações.
