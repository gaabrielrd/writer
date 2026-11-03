# Primeiro acesso e assistente persistente

- **Data:** 2026-11-02.
- **Branch:** codex/primeira-experiencia.
- **Base:** master b9fc03c, nova worktree writer-onboarding/writer.
- **Plano:** [primeira experiência](../tasks/writer-v2/primeira-experiencia-producao.md), aprovado na conversa.
- **Estado:** implementação local; não certificada para produção.

O registro inicial abaixo corresponde a 2026-11-02. O fechamento de testes de
2026-11-03 será registrado em seção própria, preservando o histórico real.

## Objetivo

Organizar a experiência inicial para escritores e mestres, com perfil explícito,
guia curto e assistência contínua, sem acrescentar monetização.

## Funcionalidades implementadas

- Questionário com múltiplos interesses, ponto de partida e intensidade do guia;
  salvar, pular, fechar e personalizar novamente pelas Preferências.
- Perfil privado por conta com validação fechada, revisão e transação; Rules
  próprias sem acesso a saldo, identidade ou permissões do usuário.
- Home personalizada, atalhos por tipo, navegação complementar recolhível e
  priorização das opções de criação, conservando Todos os projetos.
- Guia de seis/quatro dicas com conteúdo por interesse, destaque de alvo,
  links, voltar/avançar, pausa, retomada e conclusão persistida.
- Assistente único com barra compacta inferior central, expandir/minimizar,
  arrastar/setas, restaurar posição e preferências locais por UID.
- Adaptação ao viewport/teclado virtual e recolhimento temporário ao sobrepor
  campo/caret; escopo de foco dos modais e prioridade do questionário.
- Rascunho e mensagens em RAM preservados entre telas. Respostas ficam no escopo
  original e exigem inspeção nativa atual para reaparecer; ações antigas são
  descartadas. A inspeção não gera texto nem consome a cota do provedor.
- Barra nas rotas privadas, inclusive criação. Leitor público só tem ajuda geral;
  visitantes recebem login. Concepção permanece inline.

## Arquivos e fronteiras

| Área                                    | Alterações                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| src/features/onboarding                 | Modelo, persistência, provider, questionário, guia, preferências e boas-vindas |
| src/features/page-assistant             | Dock, preferências locais, conversas por escopo e inspeção                     |
| src/app                                 | Provider por conta, shell e navegação                                          |
| studio, project-creation, work-progress | Integrações pelas APIs públicas                                                |
| functions/src/pageAssistant.mjs         | Inspeção de origem sem geração                                                 |
| firestore.rules                         | Documento onboarding fechado, privado e versionado                             |
| docs e styleguide                       | Contratos, decisão e referência visual                                         |

## Testes preparados na implementação inicial de 2026-11-02

- profile.test.ts: formato fechado, múltiplos interesses e roteiros.
- Onboarding.test.tsx: primeiro acesso, salvar, pular, retomada, conflito e troca de conta.
- dockPreferences.test.ts: posição padrão, isolamento e falha de armazenamento.
- AssistantDock.test.tsx: ponteiro/teclado, foco, cancelamento, resize e modais.
- profileService.test.ts: ausência, falha de leitura, revisão e escrita incerta.
- PageAssistant.test.tsx: compatibilidade das interações e preservação do rascunho.
- functions/test/pageAssistant.test.mjs: inspeção reautoriza sem provider/quota.
- tests/firestore/onboarding.rules.test.mjs: dono, revisão, campos e enums.

Na implementação inicial de 2026-11-02, nenhuma suíte foi executada, por solicitação explícita. Não foram
executados validate, build com smoke, Playwright, emuladores ou piloto humano.

## Validações estáticas

| Verificação                                  | Resultado observado                          |
| -------------------------------------------- | -------------------------------------------- |
| npm run typecheck                            | Exit 0; TypeScript sem erros                 |
| ESLint dos arquivos TS/TSX/MJS alterados     | Exit 0; sem mensagens                        |
| npm run check:architecture                   | Verificação arquitetural OK.                 |
| npm run check:styleguide                     | Verificação do styleguide OK.                |
| npm run check:docs                           | Validação da documentação OK.                |
| git diff --check                             | Exit 0; sem mensagens                        |
| node --check functions/src/pageAssistant.mjs | Exit 0; sem mensagens                        |
| Checkout principal                           | master b9fc03c; git status --porcelain vazio |

Não há resultado de teste a inferir dessas análises estáticas. Dependências
existentes foram instaladas com npm ci --ignore-scripts; nenhuma biblioteca nova
foi adicionada e scripts de instalação não foram executados.

## Limitações e pendências

- Validar comportamento, foco, toque, três temas e viewports a partir de 320 px;
  revisar snapshots visuais afetados. Não há prova de navegador nesta execução.
- Conversas globais estão limitadas às últimas 100 mensagens em RAM; reload/
  logout não substitui histórico ou recuperação dos chats nativos.
- Autorização é conferida ao consultar/enviar/retornar/focar; não há assinatura
  contínua de revogação enquanto uma página permanece parada em primeiro plano.
- Perfil remoto é atualizado por leitura explícita; conflito exige recarregar.
- Piloto humano, métricas de uso e publicação permanecem pendentes.
- Publicar servidor com inspect e Rules antes do cliente; não houve deploy.
- Não houve commit, push, merge ou alteração do checkout principal.

## Roteiro futuro de verificação manual

1. Em conta sem perfil, escolher Livros, Campanhas e múltiplos interesses.
2. Pular/recarregar, editar Preferências e retomar o guia em outra sessão.
3. Navegar com pergunta em elaboração e com resposta pendente entre dois projetos.
4. Retornar após mudar/revogar a origem; conferir perguntas e propostas inválidas.
5. Mover por ponteiro/setas, minimizar, restaurar e abrir teclado virtual.
6. Abrir seleção de mídia e outros modais; conferir foco e acesso aos controles.
7. Conferir leitor público com visitante e conta autenticada.
8. Executar o portão de produção somente quando testes estiverem autorizados.

## Fechamento local — 2026-11-03

O operador autorizou executar testes dos arquivos afetados, fazer commit e
integrar localmente na master, sem push ou implantação.

A rodada dirigida inicial encontrou quatro falhas em 254 testes frontend.
Foram corrigidas a ordem inicial de Tab, a cobertura da navegação complementar,
a conversa de concepção dentro dos modais e a preparação de um mock assíncrono.
A conversa da concepção retoma o modal nativo; a barra global fica suspensa nesse
período para impedir duas superfícies concorrentes. O rascunho global é mantido.
A amostra genérica adicional do styleguide foi retirada do diff: a interface nova
tem jornada visual própria sem alterar o snapshot do catálogo compartilhado.

- Repetição dirigida: cinco arquivos, 35 testes aprovados.
- Serviço de assistência: oito testes aprovados.
- Rules de onboarding e regressão de temas: seis testes aprovados no emulador.
- Chromium: 66 jornadas aprovadas em desktop/mobile, claro/escuro/sépia,
  com serviços fictícios, sem chamadas externas e sem exceções de runtime.
- Primeira execução do portão integral: 390 arquivos/5.203 testes frontend
  aprovados; bloqueio por cobertura de funções em 89,83%, abaixo de 90%.
- Acrescentados testes de comportamento para arrasto/cancelamento, teclado,
  ocultação temporária sem alterar preferências, foco, transição de concepção,
  repasse do modal e CAS do serviço de perfil. Os nove casos novos passaram.
- Acrescentados três casos de guia: voltar/concluir, Escape e erro de leitura com
  retry e interesses combinados. Os oito casos do arquivo passaram.
- Repetição do portão integral: npm run validate com exit 0. Foram 392 arquivos/
  5.215 testes frontend, 116 testes de scripts e 4.944 testes de Functions
  aprovados; sintaxe de 497 módulos, typecheck, build e smoke aprovados.
- Cobertura final: statements 89,39%, branches 85,65%, functions 90,10% e
  lines 92,55%. Todos os limites originais foram preservados.
- O build mantém avisos de tamanho de chunks e imports dinâmicos ineficazes;
  não são falhas do portão e não foram tratados neste incremento.

O estado acima é anterior ao commit/integração. Hash e conclusão são conferidos
após os portões; não há declaração de piloto humano ou lançamento.

A documentação foi reconciliada após o portão e conferida novamente por
check:docs, formatação dos arquivos alterados e git diff --check antes do
commit. Não houve push, execução de CI remota ou implantação.
