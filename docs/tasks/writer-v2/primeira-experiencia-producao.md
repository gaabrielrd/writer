# Primeiro acesso e preparação de produção

Plano aprovado na conversa em 2026-11-02. Execução autorizada em nova worktree
a partir de master, sem executar testes. Base da worktree: b9fc03c.
Branch: codex/primeira-experiencia. Sem alteração no checkout principal.

## Objetivo e escopo

Entender interesses por questionário breve, adaptar prioridades da interface,
oferecer guia retomável e manter assistente flutuante no centro inferior nas
superfícies de criação/consulta. Livros, aventuras e campanhas permanecem
acessíveis; nenhuma operação comercial integra este ciclo.

## Estado inicial em 2026-11-02

| Incremento              | Implementação local                              | Aceite                                       |
| ----------------------- | ------------------------------------------------ | -------------------------------------------- |
| Inventário e contrato   | Cobertura por composição e contrato em first-use | Revisão estática; jornadas pendentes         |
| Perfil e persistência   | Questionário, pular, Preferências e CAS/Rules    | Testes escritos, não executados              |
| Interface por perfil    | Home, atalhos, navegação e tipos na criação      | Conferência visual pendente                  |
| Assistente persistente  | Três modos, movimento, viewport e rascunho       | Testes escritos, não executados              |
| Contexto por superfície | Escopo original, prova atual e actions nativas   | Regras e jornadas pendentes                  |
| Guia                    | Dicas por perfil, links, pausa e retomada        | Piloto e acessibilidade prática pendentes    |
| Qualidade de produção   | Análise estática e documentação                  | Testes/validate dispensados nesta execução   |
| Piloto e lançamento     | Não executados                                   | Exigem participantes reais e rollout próprio |

O guia informa ferramentas básicas; não comprova que o usuário escreveu ou criou
conteúdo. Não foram criados projetos de demonstração, sessões de teste, pesquisas
humanas nem coleta de telemetria. Não se declara conclusão da fase 5 ou das
pendências anteriores do Writer V2.

## Critérios para o fechamento futuro

- Conta nova e conta com perfil salvo completam/pulam/retomam o fluxo.
- Livros, campanhas e múltiplos interesses encontram sua primeira ação útil.
- Troca de conta, conflito de revisão e falha de rede preservam isolamento.
- Rascunho e resposta tardia não se perdem nem mudam o destino de uma ação.
- Revogação oculta derivados; perguntas próprias são preservadas.
- Todas as superfícies da matriz passam em desktop/mobile, teclado, toque e temas.
- Nenhum controle final, campo ou caret fica inacessível pela barra.
- Checks completos, snapshots afetados e piloto humano são aprovados antes de produção.

Contrato: [primeiro acesso](../../first-use.md).
Decisão: [ADR 0273](../../decisions/0273-profile-onboarding-and-persistent-assistant.md).
Evidência parcial: [implementação](../../entregas/2026-11-02-primeira-experiencia-e-assistente-persistente.md).

## Validação autorizada em 2026-11-03

Os testes afetados foram autorizados, com commit e integração local na master.
As falhas da primeira rodada dirigida foram corrigidas; a repetição passou
(35 testes), assim como oito testes do serviço e seis testes de Rules locais.
As 66 jornadas Chromium afetadas passaram em desktop/mobile e claro/escuro/
sépia, com serviços fictícios e bloqueio de rede externa. Os resultados do
portão integral constam na evidência. Piloto humano e rollout continuam abertos.

O fechamento de 2026-11-03 teve npm run validate verde: 5.215 testes frontend,
116 testes de scripts e 4.944 testes Functions, sintaxe de 497 módulos,
typecheck, build e smoke aprovados. Cobertura de funções: 90,10%, sem mudar os
limites. Além do portão, passaram seis testes de Rules e 66 jornadas Chromium.
