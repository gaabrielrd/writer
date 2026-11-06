# Legibilidade dos presets literários

- **Data**: 2026-11-06
- **Branch**: `codex/typography-legibility`
- **Código conferido**: `18102f84` (`feat: ajusta escala e legibilidade da tipografia`).
- **Plano de origem**: revisão Impeccable typeset e implementação aprovadas na conversa.

## Objetivo

Melhorar a leitura dos cinco presets existentes, preservando suas famílias,
os controles compactos, as preferências por conta e o conteúdo do manuscrito.

## Funcionalidades entregues

- Prosa independente da densidade dos controles: 18 px como base; EB Garamond e
  Crimson Pro usam 20 px, considerando raiz de 16 px. A calibração também segue
  a família da prosa nas combinações personalizadas.
- Colunas equilibradas de 38 rem, ou 36 rem para EB Garamond/Crimson Pro.
  Pequeno e Grande mantêm a escolha de largura por fatores de 85% e 115%.
- Entrelinha calibrada em 1,7 ou 1,65, respectivamente; títulos do editor
  acompanham a prosa com proporções de 1,4 e 1,2 em.
- Prévia com título de 24 px/peso 600 e amostra de diálogo, acentos, números,
  itálico e negrito. Cancelar a prévia também reverte as métricas.
- Títulos compactos de `SidePanelHeader` usam a família da interface.

## Critérios de aceite

- [x] Preservar as dez famílias e os cinco presets, incluindo o padrão Clássico.
- [x] Manter o manuscrito ao trocar fontes e ampliar o texto.
- [x] Preservar salvar/cancelar, recarga, personalização e isolamento por conta.
- [x] Conferir editor e leitor nos três temas de desktop.
- [x] Preservar opções de largura e tela cheia.
- [x] Verificar ampliação de texto a 200%, inclusive combinação personalizada.

## Arquivos alterados

| Arquivos                                                                                      | Mudança                                                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/shared/typography/typography.ts`, `TypographyProvider.tsx`                               | Métricas por família e aplicação/reversão junto das fontes. |
| `src/styles/globals.css`                                                                      | Base dos três tokens de leitura antes do provider.          |
| `src/app/components/AuthenticatedWorkspace.module.css`                                        | Larguras proporcionais à calibração da prosa.               |
| `src/features/editor/components/RichEditor.module.css`                                        | Prosa e hierarquia independentes dos controles compactos.   |
| `src/features/books/components/ReaderView.module.css`                                         | Leitor com tamanho, entrelinha e medida calibrados.         |
| `src/shared/ui/TypographyPreferences.tsx`, `TypographyPreferences.module.css`                 | Amostra representativa e hierarquia mais clara.             |
| `src/shared/ui/SidePanelHeader.module.css`                                                    | Fonte operacional nos títulos compactos.                    |
| `src/shared/typography/tests/TypographyPreferences.test.tsx`                                  | Reversão, persistência e isolamento das métricas.           |
| `e2e/visual/typography.visual.ts`, `typography-scaling.visual.ts`, `chapter-layout.visual.ts` | Legibilidade real, ampliação, conteúdo e larguras.          |
| `docs/typography.md`, `docs/styleguide.md`, `docs/architecture.md`                            | Contrato e valores atualizados.                             |

## Testes e validações executados

A validação foi concluída **por etapas sobre o mesmo código**, preservando os
limites existentes. A chamada agregada de `npm run validate` passou por skills,
arquitetura, documentação, styleguide, formatação e lint; interrompeu-se com um
timeout de 5 segundos em um teste de lore, fora dos arquivos alterados.
Não se afirma que essa chamada agregada terminou verde.

O arquivo foi repetido sem alteração de código ou timeout e passou com 8/8
testes. Depois, a **suíte inteira de frontend com cobertura** foi repetida e
passou, incluindo esse arquivo. Infraestrutura, Functions, typecheck, build e
smoke também foram executados integralmente e passaram.

Durante a validação, outro fluxo registrou esse mesmo código em `18102f84` e o
integrou em `master`. A validação aqui registrada é do worktree de tipografia
nesse commit; não certifica os commits editoriais posteriores observados em
`master` ao encerrar a conferência.

| Comando                                                                                    | Resultado observado                                                                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run validate`                                                                         | Checks iniciais e lint aprovados; frontend: 5.310 passaram e 1 timeout em `bookLoreVisibilitySelectionReview.test.mjs`. |
| `npx vitest run src/features/lore/tests/bookLoreVisibilitySelectionReview.test.mjs`        | 8/8 aprovados, sem alterar o teste.                                                                                     |
| `npm run test:coverage` — reexecução integral                                              | 400 arquivos e 5.311 testes aprovados; recibo local do frontend registrado.                                             |
| `npm run test:setup`                                                                       | 121 testes de infraestrutura, 4.976 de Functions e sintaxe de 498 módulos aprovados.                                    |
| `npm run build`                                                                            | Typecheck, bundle e smoke aprovados.                                                                                    |
| `npx vitest run src/features/editor/tests/RichEditor.test.tsx src/shared/typography/tests` | 39 testes aprovados.                                                                                                    |
| Playwright: `typography.visual.ts` e `chapter-layout.visual.ts`                            | 15 cenários aprovados nos três temas.                                                                                   |
| Playwright: `typography-scaling.visual.ts`                                                 | 3 cenários aprovados nos três temas.                                                                                    |
| Impeccable detect, escopo type                                                             | Saída `[]`, sem achados determinísticos.                                                                                |

Saída da reexecução integral:

```text
Test Files  400 passed (400)
     Tests  5311 passed (5311)
Statements : 89.43%
Branches   : 85.75%
Functions  : 90.25%
Lines      : 92.57%
Validação local do frontend registrada para o pre-push.
```

Na conferência adicional em notebook de 1366 × 768, os primeiros parágrafos da
fixture produziram linhas completas de 65–72 caracteres, em lugar dos 92–116
observados no editor de 1440 px na revisão inicial. Os números descrevem essa
amostra real, não uma garantia para qualquer texto. Os cinco presets foram
conferidos nos três temas, sem transbordamento horizontal no tamanho normal.

## Ambiente e achados fora do escopo

- O checkout compartilhado recebeu alterações simultâneas da Home. A tipografia
  foi isolada em `.firebase/typography-legibility-worktree`; a Home não integra
  este diff.
- A primeira instalação por junction impediu o Vitest de carregar o worker PDF
  (`Denied ID`). `npm ci --prefer-offline` instalou dependências físicas e o
  editor voltou a passar. Um lock obsoleto da rodada interrompida foi conferido
  e removido antes da nova coleta. Nenhum limite de cobertura foi reduzido.
- O build emitiu avisos de chunks grandes e imports dinâmicos também importados
  estaticamente. A instalação informou 11 vulnerabilidades moderadas. Esses
  itens ficaram fora das alterações de tipografia.

## Limitações e pendências conhecidas

As jornadas usam rotas/componentes reais com serviços fictícios e rede externa
bloqueada. Não comprovam login ou dados de produção. A ampliação verificada é
de tamanho de texto a 200%, não certificação de zoom nativo do navegador.
Mobile, leitores de tela, fallback com rede lenta e paletas personalizadas não
foram certificados. Esta execução não realizou push, CI, merge ou implantação;
a presença do commit de código em `master` foi conferida somente por leitura.

## Como verificar manualmente

1. Abrir Preferências e comparar os cinco presets na amostra.
2. Personalizar a fonte do editor e cancelar; conferir a reversão completa.
3. Salvar, recarregar e conferir a preferência; trocar conta deve isolar a escolha.
4. Abrir um capítulo e comparar Pequeno/Médio/Grande, incluindo tela cheia.
5. Conferir o leitor e os painéis nos temas Claro, Escuro e Sépia, preservando o texto.

## Fechamento posterior: detector e publicação autorizada

Após a validação acima, o detector apontou `side-tab` em `.richText blockquote`
de `RichEditor.module.css`. A borda identifica citações semânticas do manuscrito,
e não um destaque decorativo em card. O tratamento visual foi preservado e o
falso positivo recebeu uma exceção limitada a essa regra nesse arquivo, em
`.impeccable/config.json`.

Na preparação do commit solicitado posteriormente pelo usuário, passaram
`check:docs`, a conferência de formatação dos dois arquivos pendentes e
`git diff --check`. Uma nova leitura do arquivo pelo detector retornou `[]`.
O registro anterior continua descrevendo a validação no worktree de tipografia;
este fechamento não acrescenta mudanças ao código da interface.
