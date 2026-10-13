# W2-F2-01 — Contrato executável do Estúdio

**Base:** `079d4e9`, 2026-10-13. **Estado:** concluído tecnicamente em `15cd417`; CI e regras verdes.
**Autorização:** operador escolheu “Implementar o Estúdio; manter as condições
humanas e comerciais pendentes”. Ver [registro do portão](06-contratos-e-replanejamento.md).
**Tarefa:** [F2-01](../fase-02-criar-e-preparar/01-projetos-e-navegacao.md).

## Objetivo e critérios

Um autor retoma seu livro existente; um mestre cria uma campanha particular sem
criar um livro fictício. Livros, aventuras e campanhas ficam no Estúdio e podem
ser independentes de universo. A gravação deve ser real antes da confirmação;
retry preserva formulário e identidade, sem duplicar projetos, vínculos ou custos.
Uma conta não encontra recursos de outra na lista nem por acesso direto.

Preservar identidade/URLs, capítulos, atos, capas, lore, publicação e contagem dos
livros. A primeira entrega de aventura/campanha abre seus metadados persistidos;
estrutura narrativa, variantes e sessões continuam nas tarefas F2-06 a F2-08.

## Domínio e criação

- `adventures/{id}`: `ownerId`, `schemaVersion: 1`, `revision: 1`, título obrigatório
  até 300 caracteres, `synopsis` opcional até 4.000, idioma inicial `pt-BR`, estado
  `draft`, origem autoral, universo opcional e datas UTC em milissegundos do servidor.
- `campaigns/{id}`: mesmos campos comuns; título até 300, `description` privada até
  4.000, estado `planning`, procedência `independent`, universo opcional. Não criar
  aventura-base, lore copiado, sessão, convite ou compra implicitamente.
- As coleções conservam identidades distintas. Livro continua com `authorId` e
  seu fluxo manual/assistido/importação atual. Não transferir autoria por payload.
- `operationId` opaco é gerado uma vez no formulário. Servidor valida campos
  permitidos, normaliza e calcula fingerprint; grava projeto, recibo e vínculo
  juntos. Retry idêntico devolve o recurso atualmente autorizado; payload distinto
  com a mesma operação falha. Recurso removido não é recriado pelo recibo.
- Recibos em `users/{uid}/studioOperations/{operationId}`; metadados mínimos,
  inacessíveis ao cliente. Sem TTL arbitrário, chave, crédito ou dinheiro.

Callables: `createAdventure`, `createCampaign`, `getAdventure`, `getCampaign`,
`prepareStudioBooks`, `listStudioProjects`. Autoria vem de Auth, mantendo opções
de região/App Check e tradução de erros existentes. Get indisponível não devolve
conteúdo privado; UI informa indisponibilidade sem revelar dados de outra conta.

## Listagem e legado

`listStudioProjects({kind, status?, cursor?, limit?})` trata um domínio por chamada.
Tipos `book/adventure/campaign`; estados válidos do domínio ou `all`. Página padrão
25, máximo 50; ler no máximo limite + 1. Ordenação `updatedAt DESC, documentId DESC`.
Cursor valida versão, UID, tipo, filtro, data e ID; não exige formato de ID novo
para livros legados. Mudança de conta/filtro invalida cursores e respostas antigas.
Não usar offset, busca completa ou ordenar somente a página para fingir ordenação global.

“Todos” exibe três seções, com páginas/cursores/estados separados. Cada seção usa
“Carregar mais”; falha de uma não esconde as outras. Sem total global inventado.
O filtro de estado aplica-se à consulta, com os estados específicos do tipo.

Livros antigos sem data/estado precisam de preparação antes da consulta ordenada.
`prepareStudioBooks` lê, em transação, progresso e lote de livros do autor por
documentId (25/50). Cursor interno em `users/{uid}/studioPreparation/books-v1`,
sem cursor escolhido pelo browser. Corrige apenas `updatedAt` ausente/inválido
com `snapshot.updateTime`, `createdAt` com `snapshot.createTime` e estado ausente
com `draft`; conserva valores válidos e todo o conteúdo. Timestamp de Firestore
é origem real, não a hora de abrir o Estúdio. Sem metadado utilizável, falha
preservando progresso, em vez de inventar data ou omitir o livro.

A UI anuncia preparação, quantidade verificada e erro retomável; não apresenta
uma biblioteca vazia antes de concluir. Listagem de livros exige preparação
concluída. Consultas e patches transacionais protegem alteração concorrente.
Criação de livro exige datas válidas; atualização não remove/inutiliza datas já
válidas. Legado sem data pode permanecer assim até a preparação. Mutações Admin
conservam a mesma invariant. Isso evita reabrir omissão após marcar conclusão.

Fundamentos oficiais: [ordenação e campos ausentes](https://firebase.google.com/docs/firestore/query-data/order-limit-data),
[metadados do snapshot](https://docs.cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/documentsnapshot)
e [transações](https://firebase.google.com/docs/firestore/manage-data/transactions).
Testar o comportamento com o SDK instalado e emulador, além das fontes.

## Universo, privacidade e exclusão

Vínculos novos usam `universes/{id}/adventures/{projectId}` e `/campaigns/{projectId}`;
campos tipados e contadores `adventureCount/campaignCount`. Ausência legada equivale
a zero. Preservar `/books` e assinatura pública de `prepareUniverseLink`.
Projeto, referência, contador e recibo entram na mesma transação; retry não incrementa.
Universo deve existir, pertencer ao dono e não estar em exclusão.

Exclusão de universo confere os três contadores e referências com consultas limitadas
em transação. Criação/exclusão disputam o mesmo documento para impedir vínculo órfão.
Contagens novas aparecem na interface pertinente; erro não sugere universo vazio.
Associação de campanha organiza o projeto, sem ligar sua base ao lore vivo.

Regras: recursos novos privados do dono, novas listas diretas limitadas a 50;
mutações, recibos, preparação e referências somente servidor. Filhos futuros
continuam fechados. Testar dono, terceiro e anônimo por documentos, queries e
escritas diretas, além das callables. Índices incluem dono/estado/data/desempate.

## Interface e rotas

`app` compõe Universos `/universes`, Estúdio `/studio`, Publicações `/publications`,
Catálogo `/catalog` e Biblioteca `/biblioteca`. Os três últimos mostram disponibilidade
futura sem produtos, checkout ou direitos fictícios. `/library` continua imagens.
`/` mantém landing anônima; conta autenticada entra no Estúdio. Preservar rotas
antigas de livros/editor/leitor, universos, imagens e IA; curinga por último.

`features/studio` consome APIs públicas de books/adventures/campaigns/universes.
Novas features expõem modelos, serviços e detalhes `/adventures/:id`, `/campaigns/:id`.
Navegação global sai do contexto de livro, cujo título continua via API pública.
Manter créditos, tema, autenticação, skip link e editor expandido.

“Novo projeto” oferece os três tipos. Livros reutilizam `BookFormDialog`,
`ImportBookModal`, `BookCard` e `/books/new/assisted`; criação manual abre o livro
gravado. Aventura/campanha usam título, sinopse/descrição opcional e `UniverseSelect`
com texto contextual. Falha preserva dados/operação e recebe foco; envio duplicado
fica bloqueado. Sucesso fecha/navega só após resposta persistida. Troca de conta
descarta formulário e ignora respostas atrasadas.

Usar shared/ui, tokens e Lucide; PT-BR, teclado, três temas, desktop/mobile/320 px.
Cards mostram tipo, título, estado e atualização; não inventam próxima sessão.

## Arquivos e sequência

1. Registrar autorização/contratos: AGENTS, ADR 0025, portão/execução e F2-01.
2. Backend: novo `functions/src/studio.mjs`, index/package, universes, regras/índices;
   testes de serviço, emulador e regressões dos livros/universos. Fechar invariantes.
3. Frontend: novas features studio/adventures/campaigns, serviço paginado público
   de books e UniverseSelect; app/routes/header/Home e testes de comportamento.
4. Integrar fixtures isoladas e cenário visual F2-01; verificar fluxos antigos,
   erros, retry, conta trocada, teclado, temas, 320 px e servidor real no emulador.
5. `npm ci --prefix functions`, `npm run validate`, `npm run test:rules`, E2E e
   visuais pertinentes; revisão independente, docs/entrega, commit, PR e CI do head.

Backend e componentes frontend podem ser implementados por subagentes com este
contrato fixo e arquivos separados. Integração, alterações dependentes, validações
de cobertura e aceites permanecem sequenciais no checkout isolado.

## Riscos e limites

Preparação é uma alteração de metadados, não migração do manuscrito; publicação
concorrente pode exigir retry existente e não é reativada implicitamente. Paginação
navega o estado atual: atualização concorrente pode mover item entre páginas; deduplicar
por ID e oferecer recarga, sem prometer snapshot congelado de catálogo privado.
Índices/regras/functions devem acompanhar a futura implantação explícita.

Sem dependências novas, editor genérico, cena/sessão/variante, revisão compartilhada,
marketplace, cobrança ou deploy nesta tarefa. O aceite de F2-01 não comprova as
demais tarefas nem encerra condições humanas/comerciais do Writer V2.

## Resultado do incremento

Backend, regras/índices, Estúdio e navegação implementados conforme o contrato.
`npm run validate` verde: 127 arquivos/928 testes frontend, 77 scripts, 99 backend;
cobertura 92,94/86,50/91,46/95,00. As 58 verificações das regras reais passaram.
Chromium: 48 cenários do Estúdio e 129 regressões dos fluxos existentes passaram;
três skips preexistentes de prévia desktop nos projetos móveis. Revisão independente
sem bloqueadores e inspeção das capturas dos três temas/320 px.

Evidência: [entrega do Estúdio](../../../entregas/2026-10-13-writer-v2-estudio.md).
O [PR 21](https://github.com/gaabrielrd/writer/pull/21) identifica o head e seus
checks; o CI de `079d4e9` é somente a base anterior. Este registro local não
antecipa aprovação remota, merge, deploy, participação humana ou comércio live.

### Confirmação posterior do portão remoto

O SHA `15cd4173172aaae6dea92388977a8f0df0babe39` passou no
[CI completo](https://github.com/gaabrielrd/writer/actions/runs/38411066845)
e nas [regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/38411067039).
Foram 540 testes visuais aprovados, 12 skips preexistentes e nenhum retry. F2-01
está concluído tecnicamente; PR em rascunho e condições humanas/comerciais continuam.
