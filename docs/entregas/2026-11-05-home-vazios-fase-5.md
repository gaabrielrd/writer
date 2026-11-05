# Home, vazios e textos, fase 5 — 2026-11-05

Parte do plano de [anatomia de página](../decisions/0275-page-anatomy.md).

## Entregue

- Home: o cartão de boas-vindas ganhou hierarquia. "Começar um projeto" é a ação
  principal, "Todos os projetos" é secundária e "Personalizar meu espaço" virou
  controle com ícone. Os atalhos por tipo viraram chips com seta e só aparecem com
  mais de um interesse; o guia ficou como link discreto.
- O resumo de interesses passou de "Livros e Aventuras e Campanhas" para
  "Livros, aventuras e campanhas".
- "Continuar meu trabalho": "Ver todos os projetos" subiu para o cabeçalho do painel
  e, na Home, o vazio virou uma linha discreta em vez de um cartão centralizado.
- Estados vazios: o ícone padrão deixou de ser uma interrogação e passou a ser uma
  caixa vazia; Universos usa o ícone de globo.
- Personas: o cartão "Você ainda não criou personas" acima da lista de modelos virou
  uma nota que explica que os modelos já estão prontos para usar.
- Em andamento: grupos sem painéis pendentes mostram "Nada pendente no momento." em
  vez de um título solto.

## Testes e validações

- `profile.test.ts`: novo texto do resumo de interesses.
- `npx vitest run src/shared/ui src/features/onboarding src/features/work-progress
src/features/studio src/features/ai-assistant src/features/universes`: aprovados;
  `tsc`, `eslint`, `prettier`; prévia 1440 × 900 da Home, de Em andamento e de
  Universos.

## Limitações

- A mensagem "Nada pendente no momento." é conteúdo de CSS e pode não ser lida por
  todos os leitores de tela.
- Home mantém "Novo projeto" no cabeçalho e "Começar um projeto" no cartão; o
  segundo leva ao fluxo já filtrado pelo interesse escolhido.
- `npm run validate` completo fica para o fim do plano.
