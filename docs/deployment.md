# Deploy do Writer no Firebase

## Estado desta entrega

Os workflows estão **preparados, desabilitados por padrão e sem acesso Google
provisionado por esta entrega**. Não houve deploy, criação de identidade,
concessão IAM, configuração de variables/secrets/environments nem merge nessa
entrega original de preparação. A implantação local autorizada do wizard em
2026-10-10 é registrada em [criação de livros](book-creation.md); ela não ativa
os gates dos workflows.
A aprovação para preparar estes arquivos não autoriza sua ativação.

- `deploy-hosting.yml`: após push na `master`, valida o commit e publica somente
  Hosting, quando `FIREBASE_HOSTING_DEPLOY_ENABLED` for exatamente `true`.
- `deploy-firestore.yml`: execução manual, quando
  `FIREBASE_FIRESTORE_DEPLOY_ENABLED` for exatamente `true`, com escolha `rules`,
  `indexes` ou `both`, confirmação digitada `writer-44cd5` e revisão do rollout.
- Variável ausente, vazia ou `false` mantém os respectivos jobs desabilitados.
  A ativação exige autorização separada e a lista abaixo concluída.

O destino de projeto foi confirmado em `.firebaserc`: `writer-44cd5`. O site
Hosting efetivo não foi consultado no Firebase; não presumir que um site ou
ambiente de staging já exista. `FIREBASE_HOSTING_SITE_ID` deve ser preenchido
somente após verificar o site correto. O workflow gera configuração com esse
site explícito; não publica todos os sites por acidente.

## Como funciona o portão de qualidade

Hosting executa `npm run validate` em Node 22 e 24, auditoria de dependências,
`npm run test:rules` no emulador, E2E Chromium e cenários visuais. O job de deploy
aguarda **ambos** os jobs e toda a matriz. Isso repete os checks do CI existente
intencionalmente: não depende de um workflow separado terminar antes do deploy.
Todos os checkouts usam `github.sha`, sem credencial Git persistida.

O bundle de produção do `validate` Node 22 recebe um marcador público do SHA,
passa novamente pelo smoke e é guardado com inventário SHA-256. O deploy baixa
esse artefato da **mesma execução**, valida SHA, conteúdo e lista de arquivos,
sem rodar build novamente. Reexecutar todos os jobs substitui o artefato do mesmo
SHA; reexecutar somente um deploy que falhou reutiliza o artefato validado
daquela execução. O E2E usa o mesmo SHA e lockfile, mas seu próprio
build local; não é uma prova byte a byte do artefato guardado. Após publicar,
o workflow consulta o marcador servido para verificar a versão live.

Firestore manual executa validação da aplicação, auditoria, regras reais no
emulador e parse JSON dos índices antes de autenticar. O parse não substitui
validação semântica do Firebase, inspeção de alterações destrutivas ou espera
pela construção dos índices. `both` não representa transação atômica entre
regras e índices: pode haver sucesso parcial.

Os dois workflows compartilham um grupo de concorrência de produção, sem
cancelar execução em andamento. Antes de obter credenciais e imediatamente
antes do comando de deploy, o guard verifica que o SHA ainda é HEAD da master.
Uma execução antiga falha e deve ser substituída por uma execução atual.
A consulta de HEAD usa a API GitHub no endpoint fixo do repositório e o token
efêmero do job com `contents: read`. Erro de rede, resposta inesperada ou acesso
negado impedem o deploy; nenhuma credencial Git é salva no checkout.
Concorrência não garante FIFO; GitHub pode substituir uma execução pendente
por outra mais recente. Confira execuções manuais que ficaram pendentes.
Também existe uma pequena janela entre conferir HEAD e concluir a publicação;
o lock evita sobreposição entre estes workflows, não bloqueia pushes Git nem
deploys externos. Durante um rollout coordenado, interrompa novos merges e
não faça deploy externo em paralelo.

## Preparação e ativação, somente após aprovação

1. Revisar e aprovar o rollout descrito abaixo; manter ambos os gates desligados.
2. Verificar projeto, site Hosting, APIs necessárias e permissões atuais sem
   presumir que a configuração em Git corresponde ao estado live.
3. Configurar proteção da `master` com checks e revisão das mudanças em
   workflows, scripts de deploy e dependências. Configurar os environments
   `firebase-hosting-production` e `firebase-firestore-production`, permitindo
   somente a master. No Firestore, exigir revisor de produção; durante a
   primeira liberação Hosting também deve exigir revisão. Criar/configurar
   esses controles é uma ação separada desta preparação.
4. Aprovar contas de serviço dedicadas e **distintas** no projeto `writer-44cd5`,
   uma para Hosting e outra para Firestore, com os papéis mínimos revisados
   abaixo. O usuário cria e baixa uma chave JSON de cada conta diretamente no
   Google Cloud, confere o `project_id` e o `client_email` e cadastra cada chave
   diretamente no environment correto do GitHub. Não enviar a chave ao chat,
   anexá-la a uma conversa, comitá-la ou colocá-la em variables. Se a política da
   organização proibir chaves, parar; não relaxar a política para esta integração.
5. No repositório GitHub, acessar **Settings → Environments**, abrir/criar cada
   environment protegido e adicionar seu **Environment secret**:
   - `firebase-hosting-production`: `FIREBASE_HOSTING_SERVICE_ACCOUNT_JSON`
   - `firebase-firestore-production`: `FIREBASE_FIRESTORE_SERVICE_ACCOUNT_JSON`
     Colar o JSON completo da conta correspondente. Não definir esses mesmos
     nomes como repository/organization secrets: o GitHub permite fallback para
     escopos mais amplos, e o workflow não consegue provar a origem do secret.
     Verificar que as duas chaves pertencem às contas corretas e não trocar ou
     reutilizar uma chave entre environments. Somente o usuário manipula esses
     arquivos reais; esta entrega não cria, recebe, lê, armazena ou testa chaves.
6. Configurar as variables não secretas abaixo. Os gates precisam estar no nível
   do repositório, pois são consultados antes de entrar no environment; o site
   fica no environment Hosting. Deixar ambos os gates em `false`.
7. Revisar os advisories da CLI de deploy, testar identidade/permissões no
   contexto aprovado e realizar rollout inicial supervisionado. Este PR não
   comprova autenticação real nem sucesso de deploy.
8. Só então ativar o gate necessário. Ativar Hosting não publica imediatamente
   por si só: requer novo push da master ou reexecução apropriada do workflow
   dessa revisão, sujeita ao guard de HEAD e a todas as validações.

Variables do repositório:

- `FIREBASE_HOSTING_DEPLOY_ENABLED`: `false` até ativação autorizada
- `FIREBASE_FIRESTORE_DEPLOY_ENABLED`: `false` até ativação autorizada

Variable do environment `firebase-hosting-production`:

- `FIREBASE_HOSTING_SITE_ID`: ID do site verificado

Não são necessários provider/pool OIDC, `id-token: write`, nem variables com
nomes de contas. A autenticação usa a action Google fixada por SHA, passando o
secret somente ao input `credentials_json`, depois da validação e instalação
das ferramentas. A action gera um arquivo ADC local ao runner e o remove no
post-step (`cleanup_credentials: true`). Esse arquivo contém uma chave
**duradoura**, mesmo sendo apagado ao final do job; a exclusão do arquivo não
revoga a chave Google. Não publicar o workspace nem adicionar uploads de
artefatos depois da autenticação.

O projeto retornado pela action é derivado da chave, sem um input `project_id`
que sobrescreva essa informação. Antes de publicar, o guard exige que esse
output seja `writer-44cd5`; a CLI também recebe `--project writer-44cd5` de forma
explícita. Nosso script não abre a chave, não extrai `private_key`, não registra
secrets nem tenta validar uma chave real nos testes. A verificação de projeto
não distingue duas contas do mesmo projeto: conferir o e-mail da conta e seus
papéis na criação de cada secret continua obrigatório. A separação de
privilégios IAM impede que uma conta Hosting publique regras, e vice-versa.

As Actions estão fixadas por SHA; atualizar exige revisar o novo código. O
Firebase CLI também tem versão explícita nos dois workflows (`15.33.0`).
A auditoria automática acima cobre o lockfile da aplicação, não o grafo
transitivo dessa CLI instalada separadamente no runner. A auditoria isolada dessa CLI em 2026-10-10, com Node 22 e npm 10.6, confirmou
sete nós de dependências classificados como high e quatro moderate: são quatro
advisories únicos, dos quais dois high, não sete vulnerabilidades high distintas.
A versão 15.33.0 ainda era a última stable consultada. Os avisos high têm origem em
`basic-ftp` (GHSA-c475-qrg2-pj4r) e `braces` (GHSA-vfj7-8cjw-p6xm); os moderate em
OpenTelemetry core (GHSA-8988-4f7v-96qf) e `uuid` (GHSA-w5hq-g745-h8pq). Correções
transitivas disponíveis exigem atualizações major em dependências intermediárias;
o aviso de `braces` não tinha correção publicada. Não foram aplicados downgrade,
`audit fix --force` ou overrides especulativos.

A inspeção estática encontrou caminhos ligados principalmente a emuladores/proxy
não usados nestes comandos, e uso de UUID v4 no caminho de autenticação, em vez da
API afetada. Isso **não comprova** que todos os caminhos vulneráveis sejam
inalcançáveis. A CLI não é incluída em `dist/`; as ferramentas de teste usam o
emulador oficial diretamente. **A ativação do deploy fica pendente da resolução
ou revisão explícita desse risco, com nova auditoria antes da ativação.**
Não interpretar CI verde como auditoria de todas as ferramentas de deploy.
Não adicionamos a CLI às dependências da aplicação.

Os jobs que executam dependências/testes não recebem o secret Google. Não há
execução privilegiada de PR, fork, `workflow_run` ou `pull_request_target`.
O token GitHub continua com `contents: read`; não há permissão OIDC. O guard de
código é defesa adicional, não substitui proteção dos environments, revisão
dos workflows e papéis IAM. Quem puder alterar um workflow autorizado a ler
um environment pode tentar acessar seu secret; proteger a master é essencial.

### Permissões separadas

Para Hosting estático, a documentação lista `roles/firebasehosting.admin` e
`roles/serviceusage.apiKeysViewer` para CLI. Não conceder Owner, Editor,
Firebase Admin, Firestore, Functions ou administração Auth a essa conta.

Para a conta Firestore, revisar permissões de publicação de rulesets/releases
(`roles/firebaserules.admin` como papel de produto a avaliar) e administração
de índices (`roles/datastore.indexAdmin`). A escolha `rules/indexes/both`
restringe o comando, **não altera os privilégios IAM da conta**. Esses papéis
são mais amplos que uma única operação; um papel customizado pode reduzir o
escopo. As permissões de leitura de metadados/projeto exigidas pela versão da
CLI ainda não foram validadas em produção; os papéis citados são uma base para
revisão, não uma promessa de conjunto completo e mínimo. Não conceder acesso
a documentos nem ampliar permissões automaticamente para contornar um erro.
Validar a combinação efetiva na ativação aprovada. A autenticação usa a própria
conta da chave; não configurar impersonação, Domain-Wide Delegation nem
`roles/iam.serviceAccountTokenCreator` por conveniência.

O wizard `firebase init hosting:github` pode conceder papéis adicionais para
previews/Auth/Functions/Run; não é utilizado. Não usar `FIREBASE_TOKEN`.
Configuração pública Firebase/Vite (project ID, app ID, API key de cliente e
site key App Check) acaba no navegador e não é credencial de deploy. Nunca
colocar chave privada Google ou segredo de IA em `VITE_*`. Somente `dist/` é
publicado, sem arquivos `gha-creds-*.json`. O JSON bruto não é colocado em
comandos shell, logs, variáveis de build, caches ou artefatos. Manter a cópia
local da chave protegida somente pelo tempo necessário à configuração e
removê-la de Downloads conforme a política da organização.

### Rotação e revogação das chaves

Definir responsável e prazo de rotação para cada conta. O usuário cria a nova
chave, atualiza somente o environment secret correspondente, verifica a nova
configuração em execução aprovada e revoga a chave anterior no Google Cloud.
Nunca registrar os valores das chaves na documentação ou no Git. Se houver
suspeita de vazamento, revogar a chave afetada no Google Cloud, desligar o gate,
conferir jobs em andamento e substituir/remover o secret comprometido. Apagar
apenas o secret GitHub não invalida uma cópia da chave vazada. Desligar um gate
não revoga a chave nem interrompe necessariamente uma publicação iniciada.
Todas essas operações exigem autorização própria; não são executadas pelo PR.

## Executar a atualização manual, depois da ativação

No GitHub Actions, selecionar **Deploy Firestore manual**, **Run workflow**, a
branch **master**, recursos desejados, digitar `writer-44cd5` e marcar a revisão
do rollout. Uma branch diferente, projeto errado, confirmação ausente ou SHA
superado são recusados. Os inputs entram como variáveis de ambiente, nunca
como código shell interpolado. O alvo CLI vem de uma lista fechada no guard.

O comando publica exclusivamente `firestore:rules`, `firestore:indexes` ou
ambos. Não há `--force`, exclusão automática aprovada, publicação de manuscritos,
migração, concessão premium, Hosting ou Functions. Alterações de índices que
exijam remoções devem ser revisadas separadamente; não acrescentar `--force`
para fazer a execução passar. Conferir logs e o estado remoto depois: término
da CLI não significa que todos os índices estejam `READY` nem que todos os
clientes tenham recebido as novas regras.

## Rollout do roadmap: obrigatório antes do primeiro deploy

Consultar [publicação e segurança](publication-security.md). As novas regras
protegem originais e usam snapshots `publicBooks`, além de concessões premium
administrativas. Frontend novo contra regras antigas, ou regras novas contra
frontend antigo, pode quebrar publicação e créditos. Passar em testes locais
não autoriza uma troca incompatível em produção.

Antes do rollout: inventariar regras/índices live, preservar versões para
recuperação, revisar usuários premium e concessões necessárias, identificar
livros legados publicados, testar compatibilidade em projeto separado e
planejar a ordem/pausa de serviço. Não reabrir acesso público aos originais
como compatibilidade temporária. Publicações legadas não são migradas
automaticamente: cada autor deve revisar e publicar seu snapshot com nome
público. Não habilitar Hosting automático enquanto esse trabalho estiver aberto.

Um canal preview Hosting usa o backend real configurado no app. Uma URL preview
**não isola Firestore**: testar mudanças de regras exige projeto de staging
separado e configuração pública correspondente. Nenhum staging é criado aqui.

## Recuperação

Desligar o gate impede novos jobs, mas não revoga identidade nem garante parar
um deploy que já começou. Conferir a execução e o estado live antes de agir.
Hosting pode voltar a uma release conhecida pelo histórico do Firebase. Esse
rollback não restaura regras, índices, concessões ou dados. O marcador servido
mostra o SHA da versão escolhida; registrar SHA e release no incidente.

Reverter regras exige revisão de segurança e uma nova publicação autorizada;
não restaurar regras que exponham originais privados. Como o workflow exige
HEAD da master, uma recuperação via workflow passa por commit revisado na
master, não por reexecução arbitrária de SHA antigo. Índices podem demorar a
construir e sua exclusão pode afetar consultas. Recuperação de dados/migração
é outro procedimento, não coberto por estes workflows.

## Fontes oficiais

- [Firebase CLI e ADC em CI](https://firebase.google.com/docs/cli#cli-ci-systems)
- [Google GitHub auth](https://github.com/google-github-actions/auth)
- [Boas práticas para chaves de contas de serviço](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
- [Secrets por environment no GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Papéis Hosting](https://firebase.google.com/docs/projects/iam/roles-predefined-product#firebase-hosting-roles)
- [Papéis Security Rules](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)
- [Índices Firestore](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Concorrência GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Versões e rollback Hosting](https://firebase.google.com/docs/hosting/manage-hosting-resources)

## Biblioteca de imagens

Antes de liberar o frontend da biblioteca, publique as funções do codebase
`book-generation`, o índice composto de `imageLibrary` e as regras Firestore.
O índice deve estar pronto para a consulta paginada. A migração é privada,
incremental e inicia quando o usuário acessa a biblioteca; nenhum script global
altera dados automaticamente durante a implementação. Veja [biblioteca de imagens](image-library.md).

Em 2026-10-10, a implantação local da biblioteca e do header foi autorizada e
concluída em `writer-44cd5.web.app`: funções/índice primeiro, regras em seguida
e Hosting após o índice atingir `READY`. As doze funções estão `ACTIVE`, as
regras foram comparadas com a versão local e os dez arquivos publicados foram
verificados por SHA-256 contra o build validado do commit `a34d955`. Release
Hosting `a93c72d94e58c774`. Essa publicação não ativou os workflows de CI.
Evidência em [entrega da biblioteca](entregas/2026-10-10-image-library-header.md).
