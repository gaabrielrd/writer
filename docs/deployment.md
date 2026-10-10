# Deploy do Writer no Firebase

## Estado desta entrega

Os workflows estão **preparados, desabilitados por padrão e sem acesso Google
provisionado por esta entrega**. Não houve deploy, criação de identidade,
concessão IAM, configuração de variables/secrets/environments nem merge.
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
4. Aprovar e configurar OIDC/Workload Identity Federation e contas dedicadas
   distintas para Hosting e Firestore, sem chave JSON permanente. A confiança
   deve restringir `repository_id=1339469949`, `repository_owner_id=7004438`,
   `ref=refs/heads/master`, workflow correto e evento (`push` para Hosting;
   `workflow_dispatch` para Firestore). Mapear os claims usados nas condições.
   A permissão `roles/iam.workloadIdentityUser` deve abranger somente a conta
   correspondente. Não confiar apenas no nome reutilizável do repositório.
5. Configurar as variables não secretas abaixo; não inserir chaves, tokens ou
   senhas nelas. Os gates precisam estar no nível do repositório, pois são
   consultados antes de entrar no environment. As demais podem ficar nos
   environments correspondentes.
6. Testar identidade e permissões no contexto aprovado, com rollout inicial
   supervisionado. Este PR não comprova autenticação real nem sucesso de deploy.
7. Só então ativar o gate necessário. Ativar Hosting não publica imediatamente
   por si só: requer novo push da master ou reexecução apropriada do workflow
   dessa revisão, sujeita ao guard de HEAD e a todas as validações.

Variables Hosting:

- `FIREBASE_HOSTING_DEPLOY_ENABLED`: `false` até ativação autorizada
- `FIREBASE_HOSTING_WIF_PROVIDER`: nome completo do provider OIDC verificado
- `FIREBASE_HOSTING_SERVICE_ACCOUNT`: conta dedicada no projeto `writer-44cd5`
- `FIREBASE_HOSTING_SITE_ID`: ID do site verificado

Variables Firestore:

- `FIREBASE_FIRESTORE_DEPLOY_ENABLED`: `false` até ativação autorizada
- `FIREBASE_FIRESTORE_WIF_PROVIDER`: provider com confiança específica manual
- `FIREBASE_FIRESTORE_SERVICE_ACCOUNT`: conta dedicada Firestore

As Actions estão fixadas por SHA; atualizar exige revisar o novo código. O
Firebase CLI também tem versão explícita nos dois workflows (`15.33.0`).
A auditoria automática acima cobre o lockfile da aplicação, não o grafo
transitivo dessa CLI instalada separadamente no runner. Revisar também os
advisories da versão da CLI antes da ativação; não interpretar CI verde como
auditoria de todas as ferramentas de deploy. Não adicionamos a CLI às
dependências da aplicação. A instalação e
os testes acontecem antes de obter credenciais Google. Somente o job `deploy`
recebe `id-token: write`; os jobs que executam dependências/testes não recebem
identidade Google. Não há execução privilegiada de PR, fork, `workflow_run`
ou `pull_request_target`. O guard de código é defesa adicional, não substitui
as condições OIDC e proteção dos environments.

### Permissões separadas

Para Hosting estático, a documentação lista `roles/firebasehosting.admin` e
`roles/serviceusage.apiKeysViewer` para CLI. Não conceder Owner, Editor,
Firebase Admin, Firestore, Functions ou administração Auth a essa conta.

Para a conta Firestore, revisar permissões de publicação de rulesets/releases
(`roles/firebaserules.admin` como papel de produto a avaliar) e administração
de índices (`roles/datastore.indexAdmin`). A escolha `rules/indexes/both`
restringe o comando, **não altera os privilégios IAM da conta**. Esses papéis
são mais amplos que uma única operação; um papel customizado pode reduzir o
escopo. Revisar também permissões de leitura de metadados exigidas pela versão
da CLI. Não conceder acesso a documentos nem ampliar permissões automaticamente
para contornar um erro. Validar a combinação efetiva na ativação aprovada.

A alternativa `firebase init hosting:github` usa chave JSON duradoura e pode
conceder papéis adicionais para previews/Auth/Functions/Run; não é utilizada.
Não usar `FIREBASE_TOKEN`. Configuração pública Firebase/Vite (project ID,
app ID, API key de cliente e site key App Check) acaba no navegador e não é
credencial de deploy. Nunca colocar chave privada Google ou segredo de IA em
`VITE_*`. Credenciais temporárias são criadas depois do artefato; somente
`dist/` é publicado, sem arquivos `gha-creds-*.json`.

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
- [Federação para pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Papéis Hosting](https://firebase.google.com/docs/projects/iam/roles-predefined-product#firebase-hosting-roles)
- [Papéis Security Rules](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)
- [Índices Firestore](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Concorrência GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Versões e rollback Hosting](https://firebase.google.com/docs/hosting/manage-hosting-resources)
