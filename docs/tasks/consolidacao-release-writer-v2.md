# Consolidação e publicação do Writer V2

Solicitação de 2026-11-02: consolidar Writer V2 e master, revisar PRs abertos,
atualizar dependências e publicar os recursos que necessitam atualização.
O usuário confirmou desenvolvimento, CI e Functions em Node 24.

## Requisitos e aceite

- Preservar os 307 commits de Writer V2 e a regra de testes exclusiva da master.
- Revisar PRs 21, 24, 25, 26, 27, 29 e 30 e incorporar atualizações compatíveis.
- Firebase/Rules Testing atualizados juntos; Vitest e cobertura na mesma versão.
- Corrigir advisories transitivos sem force ou redução dos gates.
- Node 24.12+ no desenvolvimento/CI e runtime 24 nas Functions.
- Validar a árvore final: tipos, lint, cobertura, scripts, backend, Rules/Storage e navegador.
- Congelar o artefato e inventariar regras, índices, Functions e Hosting ativos.
- Publicar backend/índices/regras antes do frontend; respeitar drain/compatibilidade.
- Verificar estado remoto, versões, rotas e hashes e registrar a evidência real.

## Sequência

1. Consolidar os históricos locais e resolver conflitos sem descartar regras.
2. Revisar dependências/PRs e adaptar configuração/APIs necessárias.
3. Atualizar os lockfiles, auditar e validar o conjunto final.
4. Revisar diff/commits e sincronizar a consolidação com o GitHub.
5. Fazer rollout coordenado dos recursos alterados, com snapshot do estado anterior.
6. Conferir artefato live e registrar resultados e limitações.

## Suposições, riscos e não escopo

Destino confirmado por configuração e consulta: writer-44cd5 e seu site padrão.
PRs de atualização são avaliados pela compatibilidade com os contratos atuais.
Troca de dependência principal pode exigir adaptação sem alterar o comportamento.
Não habilitar fluxos ainda incompletos do roadmap nem confundir testes com aceite humano.
Não executar migração global, exclusão de dados ou alteração de saldos reais.
Não relaxar Rules, App Check, IAM, limites de cobertura ou proteção de segredos.

## Migração do gatilho de conta

A primeira geração suporta até Node 22. O SDK 7.4 já oferece
`onUserDeleted` de segunda geração. Publicar `cleanupDeletedAccountChatV2`
em Node 24, verificar o gatilho e só então remover a função antiga
`cleanupDeletedAccountChat`. As duas podem coexistir: a limpeza é idempotente.
Preservar timeout de 540s, 512 MiB e novas tentativas em caso de falha.
Não excluir contas reais para validar a implantação.

## Validação em andamento — orientação de 2026-11-02

Após cada ajuste, repetir somente o caso alterado ou diretamente afetado,
sem reiniciar o pacote completo. As execuções amplas interrompidas ou que
atingiram timeout não constituem resultado verde. A suíte visual completa foi
interrompida após a orientação; as correções seguintes usam arquivo/linha ou
título exato. A suíte global de Rules atingiu 30 minutos; CI agora possui oito
partes disjuntas que cobrem todos os arquivos. Uma falha anterior de adoção de
lore foi corrigida para usar o protocolo atual de publicação pelo servidor,
conservando as recusas de publicação direta e de consentimento revogado.

Os índices corrigidos foram publicados em writer-44cd5. A atualização das
Functions existentes para Node 24 e a criação dos novos endpoints de leitura
estão em andamento. Push, merge remoto e Hosting ainda não foram realizados.
Os seis casos móveis corrigidos passaram em execução direcionada; o lote dos
outros temas terminou com 166 aprovações e oito skips, além desses seis casos
agora corrigidos. A validação final está em execução.

## Evidência de produção em andamento

- 66 índices compostos confirmados em estado READY.
- Regras do Firestore compiladas e publicadas.
- 25 Functions existentes atualizadas para Node 24.
- cleanupDeletedAccountChatV2 confirmado ACTIVE, com evento Auth v2 e retry.
- cleanupDeletedAccountChat de primeira geração removido após essa confirmação.
- Novas Functions em criação; quota exige lotes sequenciais de até 12.
- Hosting e consolidação remota ainda pendentes.

A concorrência de 40 da CLI também atingiu a quota regional de CPU no startup
de cinco serviços. As tentativas seguintes usam lotes de 12 e intervalo de
recuperação, preservando o healthcheck e repetindo somente serviços pendentes.
