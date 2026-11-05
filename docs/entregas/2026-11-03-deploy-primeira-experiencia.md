# Deploy da primeira experiência — 2026-11-03

Publicado em https://writer-44cd5.web.app após autorização do mantenedor.
Origem: commit local `1bc6ba8b89eef425886fa50674b68977b6c24129`, integrado à
`master`, com checkout limpo no início da publicação.

## Escopo e ordem

1. `generationApi`: suporte a `pageAssistant` com `action: inspect` para
   reautorizar o contexto do assistente persistente.
2. Firestore Rules: preferências privadas e versionadas do onboarding.
3. Hosting: perfil inicial, interface personalizada, tour e chat flutuante.

Publicação direcionada ao projeto/site `writer-44cd5`. Não houve push Git.
As outras 29 Functions foram comparadas antes/depois e preservadas; índices e
Storage não foram publicados. Configuração de ambiente e vínculo do segredo
existentes da Function foram preservados.

## Validação e conferência remota

- Reutilizado o bundle da worktree do mesmo commit, aprovado por `npm run validate`:
  5.215 testes frontend, 116 de scripts e 4.944 de Functions; typecheck, build e
  smoke passaram. As 66 jornadas dirigidas e seis testes de Rules também haviam
  passado antes do commit. A suíte completa não foi repetida no deploy.
- Código e Rules extraídos do commit para snapshot isolado; configuração e
  inventário SHA-256 congelados. Dependências das Functions instaladas pelo lock.
- Rules remotas anteriores iguais à base do commit; Rules finais iguais ao
  snapshot publicado.
- `generationApi` ACTIVE, runtime `nodejs24`, revisão `generationapi-00003-hip`.
- Requisição anônima ao endpoint retornou HTTP 401 antes e depois da publicação,
  sem geração ou débito.
- Hosting FINALIZED; os 16 arquivos servidos coincidem por SHA-256 com o bundle.
- Seis rotas SPA verificadas com HTTP 200 e o mesmo index: `/studio`,
  `/studio/projects`, `/studio/import`, `/studio/operations`,
  `/books/new/assisted` e `/styleguide`.
- Chromium anônimo carregou a página pública sem `pageerror`; captura visual
  inspecionada após as animações de entrada.

## Identificadores e limites

- Release Hosting: `sites/writer-44cd5/releases/1793702715729000`.
- Versão Hosting: `sites/writer-44cd5/versions/dea6e62f8c9cd9ee`.
- Ruleset: `projects/writer-44cd5/rulesets/d9d519de-6b7c-4c43-9962-6ab56c8093b7`.
- Release Hosting anterior: `sites/writer-44cd5/releases/1793655419732000`;
  versão `5c71ce0f241e2992`.

O login, o primeiro acesso autenticado real e a geração real não foram exercitados
nesta publicação. O piloto humano permanece pendente; esta evidência não certifica
integralmente o Writer V2. Em rollback de cliente, preservar as preferências.

Snapshot, manifestos, estados remotos, logs e captura ficam em
`.firebase/onboarding-release-1bc6ba8/`, ignorado pelo Git. A documentação desta
publicação é posterior ao commit implantado.
