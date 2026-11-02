# Temas personalizados com prévia navegável

- **Data**: 2026-11-02
- **Branch**: `codex/custom-themes`
- **Plano de origem**: plano aprovado na conversa
- **Worktree**: `C:/Users/gaabr/.codex/worktrees/custom-themes/writer`

## Objetivo

Permitir que cada usuário crie até cinco temas privados, compare sugestões e
ajuste as cores enquanto navega nas telas reais do Writer.

## Funcionalidades entregues

- Seletor com Claro, Escuro, Sépia e lista de temas personalizados.
- Criação por base e destaque, com sugestões Neutra, Tonal e Expressiva.
- Painel não modal, movível por ponteiro/teclado, recolhível e persistente na navegação.
- Painel inferior em celular, incluindo operação em 320 px.
- Modo avançado com 24 cores, overrides preservados, restauração e contraste.
- Seção avançada reabre e foca uma cor inválida ao tentar salvar.
- Comparação com o tema anterior, salvar, cancelar e confirmação de alterações.
- Edição e remoção pelo menu de ações, sem consumir vagas na edição.
- Biblioteca privada na conta, quota de cinco imposta nas regras, revisão e transações.
- Preferência ativa e cache separados por usuário e restauração após reload.
- Limpeza na troca de conta; cores aplicadas também em portais, scrollbar e minimapa.

## Critérios de aceite

- [x] Criar, aplicar, editar e remover temas pela lista do seletor.
- [x] Impedir a sexta criação, inclusive em duas transações concorrentes.
- [x] Navegar com a prévia até o editor sem alterar seu manuscrito.
- [x] Preservar ajustes manuais ao trocar a sugestão e ao recolher o accordion.
- [x] Restaurar o tema anterior ao cancelar e bloquear cores inválidas/contraste insuficiente.
- [x] Suspender o painel durante modais; salvar pela confirmação de fechamento.
- [x] Operar arraste, movimento por teclado, resize e layout de 320 px.
- [x] Preservar temas nativos, preferência do sistema e funcionamento de /styleguide.

## Arquivos alterados

| Grupo                                     | Mudança                                                     |
| ----------------------------------------- | ----------------------------------------------------------- |
| src/features/custom-themes                | Modelo, gerador, catálogo, serviços e interface             |
| src/shared/theme                          | Aplicação neutra de aparência, prévia e requisição de troca |
| src/shared/ui                             | FloatingPanel, AnchoredPanel e sucesso por tokens           |
| src/app/App.tsx                           | Composição persistente com UID e novo seletor               |
| src/styles/globals.css                    | Base selecionada para variantes dark e cores de sucesso     |
| firestore.rules                           | Documento privado, quota, revisão e validação por diff      |
| e2e/visual e vite.visual.config.ts        | Fixtures isoladas e cenários de temas                       |
| e2e/styleguide.spec.ts e referência Linux | Espera por contraste estável e novo cabeçalho               |
| docs e AGENTS.md                          | Contrato, arquitetura, testes e regras                      |

O catálogo usa um mapa indexado por ID no documento privado e permite alterar
uma entrada por transação. A validação inicial de todas as cinco paletas excedeu
o orçamento de expressões do Firestore. A solução final valida a entrada
alterada e congela todas as demais por diff, preservando a quota e a validação
estrita de formatos e campos.

## Testes

| Teste                                            | Tipo          | O que cobre                                                        |
| ------------------------------------------------ | ------------- | ------------------------------------------------------------------ |
| customTheme.test.ts                              | Modelo        | Geração nas duas bases, cores extremas, contraste e validação      |
| customThemeService.test.ts                       | Serviço       | Quota, revisão, idempotência, assinatura e cache                   |
| CustomThemesProvider.test.tsx                    | Interface     | Prévia, ajustes, salvar/cancelar, falhas, ações e troca de conta   |
| ThemeAppearance.test.tsx                         | Integração    | Aplicação, restauração e limpeza dos tokens                        |
| custom-themes.rules.test.mjs                     | Emulador real | Privacidade, formatos, diff, quota e concorrência                  |
| custom-themes.visual.ts                          | Chromium      | Fluxo real, navegação, reload, drag, mobile, portais e confirmação |
| scrollbars.visual.ts e chapter-minimap.visual.ts | Regressão     | Coerência com os tokens e integridade da escrita                   |

## Validações executadas

| Verificação                             | Resultado real                                  |
| --------------------------------------- | ----------------------------------------------- |
| npm run validate                        | Verde                                           |
| Suíte Vitest com cobertura              | 120 arquivos, 905 testes aprovados              |
| Scripts do projeto                      | 77 testes aprovados                             |
| Backend de functions                    | 87 testes aprovados                             |
| npm run test:rules                      | 51 testes aprovados, zero falhas                |
| Cenários finais de temas                | 18 aprovados, três temas × desktop/celular      |
| Regressões de scrollbar/minimapa        | 18 cenários aprovados na execução combinada     |
| Foco de cor inválida em seção recolhida | 2 cenários Chromium aprovados (desktop/celular) |
| E2E de produção em Linux                | 7 aprovados, incluindo screenshot de referência |
| git diff --check                        | Sem erros                                       |

Saída final da validação:

```text
Test Files  120 passed (120)
Tests  905 passed (905)
All files | 92.52 | 86.29 | 90.86 | 94.53
Smoke test do bundle OK.
```

A execução visual combinada inicial teve 34 aprovações e duas falhas de arraste
durante o reposicionamento inicial do painel. O ajuste passou a ocorrer antes
da pintura e a verificação aguarda a geometria renderizada; a nova execução dos
18 cenários de temas passou integralmente. As 18 regressões de scrollbar e
minimapa já haviam passado nessa execução combinada.

A referência Linux do styleguide foi gerada no container local
`mcr.microsoft.com/playwright:v1.63.0-noble`, conferida visualmente e comparada
novamente na suíte de produção. O contrato de contraste agora aguarda o fim
da transição; o mínimo de 4,5 foi preservado.

O build mantém os avisos de tamanho do bundle e de importação dinâmica do
exportador DOCX já presente no projeto. Nenhuma dependência foi adicionada.

## Fora do escopo

Compartilhamento, importação/exportação de temas, IA e ajustes de fontes/layout.

## Limitações e pendências conhecidas

- Rascunhos de temas sobrevivem à navegação interna, mas não ao reload.
- Salvar requer confirmação online da transação.
- Ajustes avançados conflitantes continuam identificados se a correção automática
  não resolver todos os pares; não é permitido salvar com erros.
- Validação executada localmente; push, PR, CI remoto e deploy não executados.
- Publicar as regras antes do frontend é necessário para liberar o catálogo em produção.
- O checkout original foi preservado.

## Como verificar manualmente

1. Entrar na conta e abrir Personalizados no seletor do header.
2. Criar um tema, escolher base/destaque e alternar as três sugestões.
3. Abrir Modo avançado, ajustar uma cor e trocar a sugestão; o ajuste deve permanecer.
4. Recolher o painel, navegar ao livro e ao editor e retomar os ajustes.
5. Comparar, cancelar ou salvar; recarregar após salvar deve restaurar o tema.
6. Editar/remover pelo menu de ações e conferir o limite de cinco temas.

Para uma prévia isolada, executar o servidor da configuração visual e os cenários
descritos em [temas personalizados](../custom-themes.md), usando somente fixtures.

## Incremento — 2026-11-02: pickers e controles de fundo

- [x] Todos os campos de cor oferecem picker nativo e edição hexadecimal.
- [x] Novos temas herdam Claro/Escuro do tema atual.
- [x] Nome usa placeholder; nome e base preservam nomes acessíveis sem labels visuais.
- [x] Intensidade e picker de matiz ficam na mesma linha abaixo da base.
      No Claro, o intervalo neutro vai do branco absoluto ao cinza-claro;
      no Escuro, do preto absoluto ao cinza-escuro.
- [x] Configurações persistem no salvamento; temas anteriores continuam legíveis.
- [x] Alterar intensidade ou matiz substitui somente o ajuste avançado do fundo.

Arquivos alterados: editor, provider, estilos e modelo de custom-themes,
regras Firestore, testes unitários/de regras/visuais e documentação de temas/styleguide.

| Verificação                            | Resultado real                                     |
| -------------------------------------- | -------------------------------------------------- |
| npm run validate                       | Verde                                              |
| Vitest com cobertura                   | 121 arquivos, 981 testes aprovados                 |
| Scripts / backend                      | 77 / 87 testes aprovados                           |
| npm run test:rules                     | 52 testes aprovados                                |
| Chromium, três temas × desktop/celular | 24 cenários aprovados                              |
| Capturas adicionais focadas            | 2 cenários aprovados; painel conferido visualmente |
| git diff --cached --check              | Sem erros                                          |

Saída real: cobertura global 92.56 / 86.39 / 90.94 / 94.57;
Smoke test do bundle OK.

A primeira validação encontrou timeout em um teste que reunia comparação e
salvamento. O teste foi separado por comportamento e o preenchimento
preparatório simplificado, sem ampliar timeout nem reduzir cobertura.
A execução completa posterior passou.

Nenhuma dependência adicionada. Permanecem os avisos preexistentes de tamanho
de bundle e importação dinâmica DOCX. Push, PR, CI remoto e deploy não
executados. Publicar as regras atualizadas antes do frontend em produção;
a prévia com fixtures não depende desse deploy.

## Incremento — 2026-11-02: seletor compacto e extremos visuais

O slider de fundo passa a exibir círculos com as cores dos extremos em vez
de título, valor e escala visíveis, preservando o nome acessível e o teclado.
O seletor remove o cartão vazio, reduz a tipografia e oferece Criar novo em
toda a largura.

Ajustes locais na mesma worktree. Por instrução expressa do usuário, não foram
executados testes após o ajuste do seletor. A validação anterior dos círculos
foi interrompida; seus seis cenários de navegador já haviam passado. Não se
declara validação completa deste incremento. Sem push ou deploy.

## Incremento — 2026-11-02: cores da prévia no painel

O próprio painel de edição acompanha os tokens da prévia em tempo real,
incluindo superfícies, campos, bordas e ações. Foi removida a declaração local
de tema base que substituía os tokens herdados. Comparar com o tema anterior
também acompanha a aparência exibida pela plataforma.

Alterados FloatingPanel e documentação de temas. Sem execução de testes ou
validação completa, conforme instrução expressa do usuário. Sem push ou deploy.

## Integração — 2026-11-02: Writer V2

Integrado à branch codex/writer-v2 preservando as regras e contratos já
existentes. O seletor de temas personalizados também foi conectado ao rodapé
da navegação da área logada, que substitui o cabeçalho legado no Writer V2.
Conflitos de documentação foram resolvidos mantendo ambas as capacidades.

Nenhum teste executado nesta integração, conforme instrução do usuário.

O catálogo ancorado é único mesmo com seletores na navegação desktop e mobile.
Abrir Personalizados fecha a gaveta modal antes da edição. O mock de navegação
acompanha a nova integração. Typecheck executado; testes não executados.
O hook pre-push, que executa testes, foi dispensado neste envio para respeitar
a instrução expressa do usuário; os hooks de commit foram preservados.
