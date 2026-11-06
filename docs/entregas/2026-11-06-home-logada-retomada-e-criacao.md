# Home logada: equilíbrio entre retomada e criação

## Objetivo e resultado

Melhorar a Home do Estúdio, com prioridade igual para continuar um trabalho e
começar um projeto, conforme escolha do operador. A Home pública e o shell
autenticado mantêm sua implementação anterior.

- Projetos recentes e criação personalizada dividem a composição principal,
  sem a segunda ação de criar no cabeçalho.
- Retomadas compactas viram linhas: ícone do tipo, título, data e ação. O
  primeiro item recebe destaque e os demais usam botão contornado.
- A ação fica ao lado do título em painéis largos e abaixo dele quando a largura
  útil é de até 480 px. Títulos continuam completos, com quebra de palavras.
- A coleção geral tem um acesso junto da retomada. Os destinos por tipo,
  personalização e guia permanecem no painel de criação.
- Importação e operações ficam em uma faixa inferior de acesso rápido.
- Abaixo de 960 px, os painéis passam para uma coluna, na mesma ordem do DOM.
- Estados de carregamento, vazio, erro, indisponibilidade e verificação de
  autorização antes de navegar foram preservados. Não há novas consultas,
  capas, conteúdo de projetos no histórico, métricas ou dependências.

## Arquivos alterados

- Studio: `StudioPage.tsx` e `StudioPage.module.css`.
- Onboarding: `Onboarding.tsx`, `Onboarding.module.css` e
  `tests/Onboarding.test.tsx`.
- Work progress: `ContinueWorkPanel.tsx` e `WorkProgress.module.css`.
- Visuais: `studio-home.visual.ts` e `onboarding.visual.ts`.
- `docs/styleguide.md` e este registro.

## Evidências

- **49 testes aprovados** em `StudioPage.test.tsx`, `Onboarding.test.tsx` e
  `ContinueWorkPanel.test.tsx`.
- **12 percursos Chromium aprovados**, nos temas claro, escuro e sépia, incluindo
  retomada, criação por teclado, importação, operações com abas/URL/histórico,
  personalização, fechamento com retorno de foco e estado sem retomadas.
- O cenário da Home confere que a primeira ação de retomada e a criação ficam
  dentro da janela em 1440 × 1000, 1280 × 720 e 1024 × 768, sem overflow horizontal.
- Capturas inspecionadas nos três temas, em desktop e notebook. Antes/depois
  ficam no diretório ignorado `visual-test-results`; capturas iniciais desta
  entrega têm prefixo `studio-home-`, e o relatório da execução fica em
  `studio-home-run`.
- Avaliação independente de layout sem bloqueadores, além do detector mecânico
  de layout sem achados. A revisão conferiu agrupamento, ordem visual/teclado,
  densidade, textos longos e preservação dos fluxos existentes.
- `npm run typecheck`, `npm run build:bundle`, `npm run smoke:build`, ESLint dos
  arquivos TS/TSX alterados, Prettier, `git diff --check` e verificações de
  styleguide, arquitetura e documentação: aprovados.

## Ambiente e limites

O sandbox bloqueou o Chromium, o cache do Vite e a escrita do cache do TypeScript
com `EPERM`; os comandos necessários foram repetidos fora do sandbox. Não houve
mudança de código para contornar esses erros. O servidor visual usou os aliases
de fixtures existentes, cache próprio, porta 4196 e relatórios separados, sem
alterar a configuração permanente.

As páginas e componentes são reais; autenticação, projetos e respostas dos
serviços são fictícios no teste visual, com chamadas externas bloqueadas pelo
fixture. Isso não comprova uma operação em conta real ou backend de produção.
O build mantém avisos de chunks grandes/imports dinâmicos ineficazes em outros
módulos, fora do escopo.

Na etapa de implementação houve validação direcionada; `npm run validate` não foi
executado. Commit e deploy ocorreram posteriormente, conforme o fechamento
abaixo. A publicação anterior da Home pública mantém seu próprio registro.

## Como conferir

Abra `/studio` com sessão. Confira que continuar e começar estão juntos no topo.
Retome um projeto, depois volte e comece outro; a escolha de tipo e método deve
acontecer na tela existente. Confira os atalhos de importação/operações e o
diálogo de personalização, inclusive Escape e retorno do foco. Sem histórico,
a explicação de retomada vazia deve aparecer com a criação disponível.

## Fechamento: commit local e Hosting

Em 2026-11-06, o operador pediu commit local e deploy do Hosting, pulando
verificações. As mudanças das duas Homes foram reunidas em um commit local na
branch `codex/home-publica-impacto`. Os hooks foram desativados somente para
esse comando, sem mudar sua configuração permanente.

Foi gerado o bundle com
`npm run build:bundle -- --outDir .firebase/homes-hosting/dist` e publicada uma
configuração temporária que conserva os rewrites do Hosting existente:

```powershell
firebase deploy --only hosting --project writer-44cd5 --config .firebase/homes-hosting/firebase.json --non-interactive
```

O Firebase CLI confirmou 68 arquivos, `release complete` e `Deploy complete!`,
com saída 0. Publicação: <https://writer-44cd5.web.app>.

Não foram executados testes, lint, typecheck, smoke ou `npm run validate` nessa
etapa. Não houve push, CI, implantação de Functions/Rules ou operação de uma
conta real. Este registro foi incorporado ao commit local após a publicação;
a alteração posterior ao bundle é somente documental.
