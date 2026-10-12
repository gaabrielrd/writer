# Estúdio de escrita: formulários diretos e continuidade

## Objetivo

Amadurecer as jornadas do Writer preservando papel, carvão quente, bronze/âmbar,
manuscrito editorial e temas claro/escuro/sépia. Implementação validada na worktree
c448 e integrada ao checkout principal por autorização explícita, com commit
local, sem push, PR ou deploy e sem mutações em dados reais.

## Auditoria e prioridades

Auditoria inicial com componentes reais, serviços fictícios e rede externa
bloqueada: 120 cenários desktop/celular nos três temas; 119 passaram. Uma falha
de seleção do editor móvel apareceu antes da implementação. Capturas foram
guardadas antes das mudanças; capítulos, atos, minimapa, personas e header
recentes foram conferidos para preservar seus padrões.

| Achado concreto                                                                  | Frequência          | Impacto | Esforço | Prioridade e resolução                                    |
| -------------------------------------------------------------------------------- | ------------------- | ------- | ------- | --------------------------------------------------------- |
| Lore exige quatro etapas para editar um campo                                    | Toda criação/edição | Alto    | Médio   | P1: salvar diretamente e abrir seções independentes       |
| Livro exige passar por sinopse/capa opcionais                                    | Toda criação manual | Alto    | Médio   | P1: dados essenciais e criação imediata                   |
| Campo de capa na edição sem prévia e URL em destaque                             | Toda edição de capa | Médio   | Baixo   | P1: prévia 2:3, biblioteca primeiro e URL secundária      |
| Rótulos em caixa alta e alerts informativos azuis competem com a escrita         | Todas as jornadas   | Médio   | Baixo   | P2: tipografia regular e superfícies semânticas discretas |
| Metadados opcionais tomam o corpo da importação móvel antes dos capítulos        | Importações         | Médio   | Baixo   | P2: seção Sobre a obra, arquivo/análise/revisão contínuos |
| Badges assistidos se esticam por todo o card e progresso tem excesso de destaque | Revisão assistida   | Médio   | Baixo   | P2: badges contidos e progresso discreto                  |
| Tooltip consome Escape na barra de IA                                            | Uso por teclado     | Alto    | Baixo   | P1: captura de Escape e retorno ao manuscrito             |
| Ações de biblioteca/universos competem visualmente                               | Navegação frequente | Médio   | Baixo   | P2: ação principal primeiro; gestão secundária discreta   |

## Funcionalidades entregues

- Compêndio: identificação e visibilidade acessíveis imediatamente. Nome e
  resumo válidos permitem cadastrar; qualquer campo pode ser alterado e salvo
  diretamente. Características, história/notas e relações abrem sob demanda,
  preservando preenchimento. Relação incompleta abre para correção. Alcance
  local/global, aliases, campos privados e aviso de revogação permanecem claros.
- O mesmo `LoreEntityForm` atende livro, universo, sidebar, menções e revisão da
  criação assistida, inclusive privacidade fixa nessa última jornada.
- Livro: título e gênero continuam obrigatórios na criação, com os mesmos
  limites de 300/120 caracteres do contrato de geração. Sinopse/capa são
  opcionais. Edição preserva compatibilidade de gênero opcional dos livros
  legados. Prévia vertical, biblioteca, remoção de capa e alternativa por URL
  compartilham o padrão. Retry mantém ID; busy impede duplicação/fechamento.
- IA mantém preço, prévia, aceite explícito, invalidação de contexto e créditos.
  Entrevista e dependências reais permanecem; criação manual continua disponível.
- Biblioteca: ação Novo Livro prioritária, capas/cards 2:3 preservados, inclusive
  livro único, título longo e ausência de capa. Detalhes mantêm sinopse em duas
  linhas, Mais/Menos, opções em dropdown e capítulos compactos com atos.
- Importação: arquivo e revisão permanecem no contexto; gênero/sinopse opcionais
  abrem em Sobre a obra. Melhor adaptação de controles e rodapé em telas estreitas.
- Universos: gestão secundária mais discreta e contagem neutra; confirmações e
  regras de vínculo/revogação permanecem intactas. Imagens deixam explícita a
  reutilização sem novos créditos e mantêm seletor público e proporção vertical.
- Design system: `FormSection`, altura de campo compartilhada, raios consistentes,
  rótulos legíveis, IDs únicos, hints/erros associados por ARIA e alerts semânticos.
  `/styleguide` demonstra o padrão; guia documenta página, painel e modal.
- Editor: Escape funciona mesmo com tooltip aberto; teste móvel de escrita
  aguarda a posição observável do cursor antes de digitar, sem atraso arbitrário.
- Git/Windows: `.gitattributes` aplica LF. Checkout normalizado sem mudanças de
  conteúdo nos arquivos fora do escopo; metadados equivalentes foram renovados
  sem deixar conteúdo no stage. A configuração `core.autocrlf` permaneceu
  restrita à worktree c448; no principal, a política vem de `.gitattributes`.

## Testes e validações

- Formulários/componentes: criação essencial, edição direta, seções recolhidas,
  relações, campos privados, retry estável, URL inválida, busy e IDs/ARIA.
- Suíte visual completa: 348 cenários; 347 passaram e um revelou o Escape com
  tooltip. Após corrigir, os seis cenários desse fluxo passaram nos três temas
  em desktop/celular. Nenhum teste foi desativado nem tolerância ampliada.
- Novos cenários visuais cobrem formulários diretos, preservação, teclado,
  retorno do foco, alcance, aviso de publicação e 320 px.
- E2E de produção no Chromium Linux: 7 passaram, incluindo contrato dos três
  temas, navegação e regressão do catálogo. A referência Linux foi renovada
  somente depois de inspecionar a captura real das mudanças intencionais.
- `npm run validate`: passou. Frontend: 97 arquivos/680 testes; scripts: 69 testes; backend: 63 testes. Lint, typecheck, build e smoke passaram. Cobertura: 93,16% de instruções, 86,4% de ramos, 91,5% de funções e 95,19% de linhas, sem reduzir limites.
- Revisão visual final das jornadas principais: 42 cenários passaram; duas capturas adicionais de identificação/edição passaram. `git diff --check` passou e o stage permanece vazio.
- Build passou com avisos de tamanho do bundle e importação dinâmica/estática de `exportDocx`, registrados no log; otimização do bundle fica fora desta entrega.

## Documentação e evidências

Atualizados README, guia de estilo, criação manual/assistida, lore compartilhado,
testes e catálogo. Capturas e logs fictícios ficam no diretório solicitado
`C:/Users/gaabr/Documents/Codex/2026-10-12/realtime-voice-chat/outputs` e em `work`
para intermediários. Nenhum segredo nem conteúdo pessoal integra as fixtures.

## Integração e commit local

Origem e principal estavam em `cb140408fbf6453d625509b66cc266abdc4e3595`.
O checkout `E:/Mega/dev/writer`, branch `master`, estava limpo: nenhum arquivo
staged, unstaged ou não rastreado para reconciliar. Antes de escrever, foram
salvos status, patches, índice, SHA-256 dos 571 arquivos rastreados e backup
compactado em `work/integracao-local`.

Transferidos 51 arquivos da entrega com comparação de hashes. Outros 15 arquivos
receberam somente CRLF → LF, sem mudança de conteúdo versionado; nenhuma
alteração paralela foi incluída. A revisão alinhou três referências obsoletas
a etapas em criação de livros, PRD e ADR 0018; são 53 arquivos na entrega final.

`npm run validate` passou também no principal: 97 arquivos/680 testes de
frontend, 69 de scripts e 63 de backend, com os mesmos índices de cobertura.
Lint, typecheck, build e smoke passaram. A revisão final não encontrou bloqueios;
`git diff --check` passou. Documentação revista foi conferida novamente após o
gate. O commit usa stage seletivo e hooks ativos. Capturas anteriores continuam
válidas porque a integração preserva o código da versão verificada. Logs e
manifestos antes/depois ficam em `work/integracao-local`; o hash do commit está
no relatório em `outputs/relatorio.md`.

## Limites da entrega

Sem publicação automática, migração de dados, alteração de preços/contratos de
backend ou novas dependências. CI remoto não executado: o escopo autorizado
permite o commit local e exclui push, PR e deploy. Os testes locais usam serviços fictícios; não avaliam
qualidade literária da IA nem serviços reais de produção.

## Verificação manual

1. Crie um livro com título/gênero sem abrir sinopse ou capa.
2. Edite/cadastre lore com nome/resumo, abra/recolha seções e salve diretamente.
3. Altere visibilidade pública e confira o aviso antes de salvar, local/global.
4. Confira capa selecionada, retry, foco por teclado e layout a 320 px nos temas.
5. No editor, selecione texto, abra ações por Alt+Enter e feche por Escape.
