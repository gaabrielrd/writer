# Tipografia literária no Writer

## Objetivo e resultado

Integrar os cinco presets aprovados no estudo, com Clássico editorial como
padrão, e permitir combinar as dez fontes por papel. A seção fica em
Preferências → Tipografia literária e também está disponível em `/styleguide`.

Os presets são Clássico editorial, Romance humanista, Contemporâneo acolhedor,
Leitura digital e Poético. Personalizado permite escolher títulos, interface e
editor independentemente; alterar um papel parte das fontes exibidas.

Prévia altera a aplicação sem persistir. Salvar fontes confirma a gravação no
navegador por UID; cancelar ou sair da página restaura a escolha salva. Falhas
de gravação conservam os ajustes e mostram erro. Logout/troca de conta carregam
somente a escolha da nova sessão. Fontes e paletas de cores são independentes.

## Implementação

- Catálogo fechado, parser, provider e hook em `src/shared/typography`.
- Armazenamento em `src/shared/services/typographyStorage.ts`, sem SDK ou novas
  regras de Firestore. A composição em app fornece o UID.
- Seletores e amostra em `src/shared/ui/TypographyPreferences.tsx`, pelos
  componentes compartilhados.
- Tokens `--font-display`, `--font-sans` e `--font-reading` aplicados a títulos,
  interface e prosa. Consumidores que fixavam Georgia passam ao token de prosa;
  títulos que usavam o token de leitura passam ao token de títulos.
- Dez famílias hospedadas localmente, com 40 WOFF2, licenças OFL e manifesto de
  procedência/hashes em `public/fonts/literary`. Download sob demanda pelo
  navegador, sem dependência de Google Fonts em tempo de uso.
- Contrato e instruções em [tipografia](../typography.md), arquitetura,
  styleguide, temas personalizados e documentação dos testes.

## Verificações executadas

- `npx vitest run src/shared/typography/tests src/shared/theme/tests src/app/tests/App.test.tsx src/features/custom-themes/tests --maxWorkers=2`:
  **9 arquivos, 152 testes passaram**. Inclui defaults, dados inválidos, isolamento
  por UID, falha de armazenamento, prévia/cancelamento, recuperação e preservação
  da instância e do rascunho do editor durante troca de fontes.
- `npm run typecheck`: passou.
- `npm run check:architecture`: passou.
- `npm run check:styleguide`: styleguide e anatomia passaram.
- ESLint direcionado aos arquivos TypeScript da entrega: passou.
- `npm run check:docs`, Prettier direcionado e `git diff --check`: passaram.
- `WRITER_VISUAL_PORT=4193` e
  `npx playwright test --config playwright.visual.config.ts e2e/visual/typography.visual.ts`:
  **6 cenários Chromium passaram**, nos três temas de desktop. Componentes e
  rotas reais, autenticação/serviços fictícios e rede externa bloqueada. Conferiu
  famílias computadas, carregamento real das dez fontes normais/itálicas,
  personalização, salvar/cancelar, recarga, styleguide, editor e troca de conta.
- Capturas dos três temas inspecionadas visualmente, em
  `visual-test-results/typography.visual.ts-cinco-*`.
- `npm run build:bundle -- --outDir verified-build/typography`: passou. Emitiu
  avisos de tamanho de chunks e imports dinâmicos compartilhados, sem impedir o
  build ou alterar limites.
- Conferência de SHA-256 dos **40 arquivos** locais e de suas cópias no build:
  todos coincidiram com o manifesto. As dez licenças foram conferidas; o CSS de
  fontes não contém URLs externas.
- Smoke HTTP do build isolado: **47 recursos** responderam 200 com corpo não
  vazio, incluindo as 40 fontes.

O sandbox bloqueou gravações de arquivos/cache e o lançamento do Chromium em
algumas tentativas; as operações necessárias foram concluídas com execução
ampliada. A primeira jornada visual usava um nome acessível incorreto para o
editor; o seletor foi corrigido antes da execução dos seis cenários verdes.

## Limites e estado de publicação

A escolha é local por conta/navegador; não sincroniza entre dispositivos nem
integra fontes aos documentos de paletas personalizados. O manuscrito e os
formatos de exportação permanecem inalterados. A evidência visual usa serviços
fictícios e não certifica uma sessão autenticada de produção.

`npm run validate` não foi executado: a instrução vigente do `AGENTS.md` reserva
esse comando para antes de commit/merge ou pedido explícito. Sem commit, push,
CI remota ou deploy nesta entrega. Alterações preexistentes de outras tarefas
foram preservadas.

## Conferência manual

1. Abra Preferências e encontre Tipografia literária.
2. Compare os cinco presets e altere cada papel para testar Personalizado.
3. Cancele para retornar à escolha anterior ou salve e recarregue.
4. Abra um capítulo e confira a fonte da prosa e dos títulos.
5. Troque a paleta de cores: a escolha das fontes continua independente.

## Triagem do hook de design

Os dois apontamentos `side-tab` já existem em `HEAD` e não foram introduzidos
pela tipografia. No leitor, a borda pertence ao `blockquote`, marca semântica de
citação literária, e foi preservada. O falso positivo recebeu exceção somente
para `side-tab` em `src/features/books/components/ReaderView.module.css`, pelo
comando oficial `hooks ignore-value`, com justificativa em `.impeccable/config.json`.

A borda do painel `.instructions` em Personas continua como pendência visual
preexistente, separada desta entrega. Não recebeu exceção nem alteração visual;
ajustá-la ampliaria o escopo da tipografia.

## Correção visual autorizada após a triagem

Após autorização explícita do usuário, `.instructions` em Personas passou da
faixa lateral primária de 3 px para um contorno uniforme de 1 px com o token
semântico `--border`. Conteúdo, fundo, espaçamento e funcionamento foram
preservados. A pendência visual descrita acima está resolvida.

A borda de `blockquote` do leitor permanece como tratamento de citação
semântica. Sua exceção restrita continua válida; nenhuma nova supressão foi
adicionada para Personas.

Verificações desta correção:

- Detector Impeccable nos dois arquivos: nenhum apontamento com a configuração
  vigente. O detector CSS é estático e não equivale à auditoria completa da tela.
- `npm run check:styleguide`, Prettier do CSS alterado e `git diff --check`:
  passaram.
- Conferência direta no Chromium com serviços fictícios e rede externa
  bloqueada: abertura da biblioteca, painel lateral e diálogo de detalhes nos
  temas Claro, Escuro e Sépia. Contorno computado de 1 px nos quatro lados,
  sem transbordamento em 1440 × 1000 e 1024 × 768, sem erros JavaScript.
  Capturas `personas-instrucoes-{light,dark,sepia}.png` inspecionadas no diretório
  do artefato deste chat.
- O cenário existente `personaliza uma persona com slider próprio` de
  `e2e/visual/personas.visual.ts` falhou nos três temas ao buscar a progressbar
  `Concisão` por nome exato, antes de chegar ao diálogo. O painel atual usa nomes
  contextualizados por persona. A atualização desse cenário fica registrada
  separadamente; a jornada direta acima conferiu o alvo corrigido.

Sem mudança de comportamento, novos testes, commit ou deploy. `npm run validate`
não foi executado, conforme a fronteira vigente do projeto.
