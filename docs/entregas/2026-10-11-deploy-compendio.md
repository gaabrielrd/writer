# Deploy do compêndio

- **Data**: 2026-10-11
- **Projeto Firebase**: `writer-44cd5`
- **Origem**: commit local `3e75946`, branch `codex/editor-compendio`
- **Autorização**: deploy das três functions do compêndio e das regras do Firestore, solicitado na conversa.

## Recursos publicados

| Function             | Região        | Runtime                     | Estado verificado |
| -------------------- | ------------- | --------------------------- | ----------------- |
| `analyzeChapterLore` | `us-central1` | Node.js 22, segunda geração | `ACTIVE`          |
| `prepareBYOKLore`    | `us-central1` | Node.js 22, segunda geração | `ACTIVE`          |
| `applyLoreAnalysis`  | `us-central1` | Node.js 22, segunda geração | `ACTIVE`          |

O deploy utilizou o codebase `book-generation`, com seleção explícita:

```powershell
firebase deploy --only 'functions:book-generation:analyzeChapterLore,functions:book-generation:prepareBYOKLore,functions:book-generation:applyLoreAnalysis,firestore:rules' --project writer-44cd5 --non-interactive
```

Resultado: `Deploy complete!`, com as três operações de criação concluídas.
As regras passaram na compilação e foram liberadas em `cloud.firestore`.
Hosting, Storage, índices e outras functions não integraram o deploy.

## Verificações após publicação

- Listagem autenticada confirmou as três functions `ACTIVE` no projeto e região esperados.
- Os hashes e estados das outras functions permaneceram iguais aos da listagem anterior.
- O conteúdo das regras ativas foi comparado integralmente com `firestore.rules`: correspondência exata.
- Ruleset ativo: `projects/writer-44cd5/rulesets/24f4e88b-2d8a-4657-aac7-995af762d6b3`.
- SHA-256 das regras locais e remotas: `fea0eebdaf349260ce50e3ba8f13f9c947f376d5be61ce0265415f8da4f576ce`.
- Ruleset anterior preservado como referência: `projects/writer-44cd5/rulesets/003bd21d-bb9d-4c84-b4fe-c49cf28f0322`.

Evidências locais ignoradas pelo Git: `test-results/lore-functions-before.json`,
`test-results/lore-functions-after.json`, `test-results/lore-rules-before.json` e
`test-results/lore-deploy-verification.json`.

## Validação e limites

O código publicado já havia passado em `npm run validate`, 37 testes de regras no
emulador e 12 testes visuais, conforme as entregas do editor e dos controles.
Esta implantação não alterou código. Nenhuma análise de manuscrito, chamada real
de IA ou aplicação de lote com débito foi executada em produção durante a verificação.

O frontend não foi publicado nesta etapa. O novo registro de implantação permanece
local; o deploy não incluiu push de Git.

## Publicação posterior do Hosting

Na mesma data, o usuário autorizou também a publicação do frontend.
`firebase hosting:sites:list --project writer-44cd5 --json` confirmou o único site
`writer-44cd5`, com URL `https://writer-44cd5.web.app`.

- `npm run build`: tipos, bundle e smoke passaram; permaneceram os avisos conhecidos de tamanho de chunks e importação DOCX.
- `firebase deploy --only hosting --project writer-44cd5 --non-interactive`: `Deploy complete!`, com 11 arquivos publicados.
- Verificação HTTP após deploy: os 11 arquivos retornaram HTTP 200, e todos os hashes SHA-256 remotos corresponderam aos arquivos locais de `dist`.
- Evidência local: `test-results/editor-hosting-verification.json`.
- SHA-256 de `index.html`: `219b662ee1a015a2a1bcefee4c490ba930344dbb026edb237e0b360479b4414c`.

Esta publicação selecionou somente Hosting. O registro atualizado permanece local,
sem novo commit ou push.
