# F2-04 — Estados editoriais, meta total e retomada

**Estado:** implementado em `7988fb7`; correção local validada, nova CI pendente.
**Base técnica:** F2-03 concluído em `3358c75`, CI e regras verdes.
**Origem:** [W2-F2-04](../fase-02-criar-e-preparar/04-estados-metas-e-retomada.md).

## Objetivo e decisões

O operador escolheu meta total do manuscrito atual, checklist privado de preparação
por projeto e fuso configurável por usuário, inicialmente o do dispositivo.
Reescrita, remoção, arquivo e restauração ajustam o total; nenhuma meta reinicia
à meia-noite. A execução sequencial do Writer V2 permanece autorizada; condições
humanas e comerciais continuam nas entregas próprias.

- Livro e aventura: estado editorial Rascunho / Em revisão / Pronto e meta total opcional.
- Aventura e campanha: checklist de preparação com criação, edição, conclusão, reabertura e remoção explícita.
- Todos: retomada particular por usuário e projeto, após nova verificação de autorização.
- Fuso IANA: inicialização única por CAS; outro dispositivo não sobrescreve a preferência já salva.

## Estado editorial e composição

`editorialState` privado e protegido é independente de `Book.status`, publicação
e oferta. Aventura legada sem esse campo usa `status=ready` como estado inicial
Pronto, demais como Rascunho; seu status legado permanece preservado. A UI usa
o estado editorial atual para draft/ready e apresenta Arquivada como condição
separada, evitando duas classificações editoriais contraditórias. Campanhas
conservam seu ciclo de preparação/atividade/conclusão/arquivo.

O total do livro inclui capítulos legados e cenas ativas com capítulo disponível
em modo cenas. A aventura inclui cenas ativas com parte disponível. Cenas sem
grupo, arquivadas, fontes preservadas, planejamento, sinopse, lore e backups
não entram no manuscrito composto. A contagem própria desses textos é preservada.

Meta aceita inteiro positivo seguro ou `null` para remover, sem quota inventada.
A barra termina em 100%, mantendo os números reais acima da meta. Campo inválido
tem feedback; nenhuma meta ou falha de progresso impede escrever.

## Contagem verificável e preparação do legado

O servidor interpreta a mesma prosa visível do frontend: Markdown, tags inline,
blocos, entidades nomeadas/numéricas, imagens pelo texto alternativo e placeholders
literais. Scripts, estilos, templates e embeds ficam fora; URLs de links não
inflacionam palavras. O texto armazenado nunca é reescrito para contar.

Declarar `parse5` explicitamente em Functions é necessário porque Node não tem
o parser DOM usado no navegador e os contadores regex atuais divergem em entidades
e HTML malformado. Uma implementação pequena no servidor segue o formato existente;
um corpus de paridade com `renderRichText`/`countWords` protege contra divergência.
Não trocar o editor, o sanitizer público nem criar um pacote de build compartilhado.

Persistência privada mínima por projeto:

- `workProgress/current`: revisão editorial/meta, checklist, versão do contador, total parcial, estado de verificação e checkpoint.
- `workWordSources`: contribuição por identidade de capítulo/cena; sem corpo, título ou histórico.
- `workWordGroups`: agregado derivado por capítulo/parte e indicação de inclusão na composição.

A preparação é explícita e retomável, com páginas de metadados padrão 25/máximo
50 e processamento transacional de um corpo por vez, dentro de um orçamento
de trabalho por chamada. Não baixar toda a prosa no navegador, criar quota de
documentos, truncar textos ou aplicar limites novos a documentos legados.
Enquanto incompleto, o DTO informa `wordCount: null`, progresso real e ação
de retomada; não apresenta zero como total confirmado.

Ativação fixa `hasProgressResources` no servidor. A partir daí, regras impedem
alterar corpo, contagem e modo de capítulos, criar/remover capítulos ou sobrescrever
o total diretamente. Os escritores atualizados passam por serviços do servidor
e continuam disponíveis durante a verificação. Metadados permitidos conservam
as fronteiras existentes. Escrita antiga recusada recebe orientação para atualizar.

Todo escritor aplica contribuições no mesmo commit do conteúdo: criação, edição,
importação, IA, conversão, movimento, arquivo/restauração e remoção. A contribuição
é a prova idempotente de processamento: fonte criada antes do cursor já entra
pelo escritor, sem dupla soma quando visitada. Checkpoint avança somente após
confirmação da fonte. Não reiniciar a preparação a cada edição.

Remover agrupador desabilita seu agregado e subtrai o valor conhecido uma única
vez no commit inicial. Limpeza em lotes desloca contribuições para fora da composição
sem subtrair novamente. Conversão retira a contribuição legada e acrescenta a
nova cena no mesmo commit. Helpers preparam todas as leituras antes das escritas.
Exclusão do livro limpa os recursos pelo protocolo servidor já existente.

## Contrato público mínimo

`WorkTarget = { kind: book | adventure | campaign, id }`.
`WorkResource = project | {kind: chapter, id} | {kind: scene, id}`;
capítulo somente em livro e cena somente em livro/aventura.

`WorkProgress` devolve target, ownerId, título atual autorizado, revision,
activityRevision, archived, editorialState/wordGoal (nulos em campanha),
manuscript (nulo em campanha; ready, wordCount, operationId/processed opcionais)
e checklist (nulo em livro; total/completed). Listas nunca somam a página para
inventar totais globais.

| API                     | Entrada principal                                                    | Resultado                                             |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| getWorkProgress         | target                                                               | progresso autorizado ou null                          |
| updateWorkProgress      | target, operationId, expectedRevision, patch editorialState/wordGoal | estado confirmado                                     |
| prepareWorkWordCount    | target, operationId, limit opcional                                  | complete, processed, wordCount ou null                |
| listWorkChecklist       | target, filtro all/pending/completed, cursor, limit                  | itens, cursor, checklistRevision e totais             |
| createWorkChecklistItem | target, operationId, title                                           | item confirmado e totais                              |
| updateWorkChecklistItem | target, id, operationId, expectedRevision, patch title/completed     | item confirmado e totais                              |
| deleteWorkChecklistItem | target, id, operationId, expectedRevision                            | revisão da lista e totais                             |
| getWorkPreferences      | vazio                                                                | revision e timeZone ou null                           |
| saveWorkPreferences     | operationId, expectedRevision, timeZone                              | preferência confirmada                                |
| recordWorkActivity      | target, resource, operationId, expectedActivityRevision              | activityRevision e accessedAt                         |
| listWorkResume          | kind opcional, cursor, limit                                         | resumos autorizados atuais, cursor e activityRevision |
| resolveWorkResume       | target                                                               | target/título/resource/fallback autorizado ou null    |

Mutação usa recibo estável e fingerprint; reutilizar ID com outro payload é inválido.
Replay reavalia autorização atual. Conflito CAS preserva preenchimento e pede
comparação/atualização, sem overwrite automático. Checklist tem título limitado
a 300 caracteres e revisões por item; paginação 25/50, sem limite de acervo.

## Retomada e privacidade

Atividade guarda somente tipo/IDs e data do servidor, sem título histórico,
texto, seleção, cursor ou URL. CAS global por usuário impede um pedido antigo
de outra aba/dispositivo de substituir silenciosamente uma visita mais recente.
Registro acontece após carregar recurso autorizado, fora dos timers/flush do
autosave. Falha ou conflito de atividade não transforma texto salvo em falha.

A lista resolve títulos atuais autorizados. Continuar reautoriza projeto/recurso:
recurso removido volta ao projeto com aviso genérico; projeto indisponível retorna
null, sem nome antigo ou rota privada. Rotas são reconstruídas de identidades
validadas. Visitas não alteram updatedAt do projeto nem revisões de prosa/narrativa.

## Implementação sequencial e arquivos

1. Contrato de contagem servidor e corpus de paridade em Functions e testes frontend.
2. `functions/src/workProgress*.mjs`: APIs, ledger, preparação e testes com transações reais simuladas.
3. Integrar escritores em books/services, organização/importação, scenes/sceneJobs, chapterChat e criação assistida quando pertinente; callables e regras/índices/SDK.
4. `src/features/work-progress`: modelos, serviço, hooks privados e componentes públicos.
5. Integrar BookPage/AdventurePage/CampaignPage, StudioPage e editores; manter aliases visuais apenas em configuração de teste.
6. Testes dirigidos, QA Chromium, validate integral, revisão independente e documentação/ADR/AGENTS/entrega.
7. Commit e envio autorizado ao PR em rascunho; acompanhar a CI do SHA exato em paralelo, conforme decisão de 2026-10-15.

Backend, frontend e parser/corpus podem usar subagentes com propriedade de arquivos
separada após fechar este contrato. Integrações dependentes e gates ficam sequenciais.

## Aceite e verificação

- Estado pronto não publica, oferece ou revela conteúdo.
- Total segue edição/importação/IA, remoção, conversão, arquivo e restauração, inclusive durante preparação e retries.
- Contagem possui paridade com texto visível, sem alterar manuscrito ou fonte preservada.
- Checklist funciona com retomada, páginas, filtros, erros e conflitos, com totais autorizados.
- Nenhum dado atravessa UID/projeto, inclusive respostas tardias e autorização revogada.
- Retomada cobre livro/capítulo/cena/campanha, origem removida e disputa entre dispositivos.
- Fuso inicial e preferência persistida funcionam; mudança de fuso não altera meta total.
- Navegador cobre teclado, foco, temas claro/escuro/sépia e 320 px; regressões existentes permanecem verdes.
- `npm run validate`, regras SDK reais, produção e CI do novo SHA verdes; revisão e entrega documentadas.

## Correção de integração — filtros editoriais e regressões

A [CI de `7988fb7`](https://github.com/gaabrielrd/writer/actions/runs/38695798057)
aprovou Node 22/24, auditoria e produção; as
[regras reais](https://github.com/gaabrielrd/writer/actions/runs/38695798053)
também passaram. A suíte visual encontrou
roteiros anteriores incompatíveis com a nova aba Progresso, rótulos e título de
retomada. Um percurso de edição de arco também falhou e está sob inspeção dos
artefatos, sem atribuir a causa a lentidão. A inspeção confirmou uma regressão
real: remover os filtros
Rascunho/Pronto das aventuras não preserva a capacidade aprovada em F2-01.
Não substituir sua verificação por um filtro mais restrito apenas para passar.

Plano de correção dentro de F2-04, antes de qualquer tarefa seguinte:

1. Acrescentar `editorialState?: all | draft | review | ready` a
   `listStudioProjects` somente para livros/aventuras, preservando `status` legado.
   Campanha continua com seu ciclo. O estado efetivo usa o campo válido atual;
   se ausente, aventura `status=ready` usa Pronto e os demais usam Rascunho.
2. Resolver o filtro no servidor em janelas da consulta de metadados já limitada
   a 25/50 + 1. Campo ausente impede uma query por igualdade de representar todo
   o legado; não migrar manuscritos, baixar corpos ou filtrar só a página na UI.
   Cursor aponta a última linha verificada e vincula UID/tipo/status/estado editorial.
   Cursor antigo sem estado editorial continua válido somente sem filtro editorial.
3. A UI segue janelas vazias até obter resultados ou esgotar a consulta, com estado
   de carregamento e cancelamento por conta/filtro. Não declarar acervo vazio
   diante de uma janela vazia com continuação, nem inventar totais globais.
   O servidor nunca busca todo o acervo numa chamada; cada página segue limitada.
4. Oferecer filtro editorial em livros/aventuras, separado de publicação/condição
   de arquivo. Conservar a independência das páginas e o filtro das campanhas.
5. Preservar o teste de Rascunho do Estúdio, cobrindo também revisão/pronto após
   mudança editorial com status legado diferente e ocorrências depois da primeira
   janela. Provar cursor entre filtros/UIDs e cancelamento de respostas antigas.
6. Atualizar o percurso Home/End para provar a aba Progresso antes de voltar aos
   arcos; aguardar URL e heading principal da obra ao navegar, distinguindo o título
   legítimo da retomada. Sem `.first()`, force, sleeps, aumento de timeout ou retry.
7. Validar serviços/componentes, SDK real, controles Chromium, validate integral,
   revisão e documentação; commit/envio autorizado e acompanhamento da CI do novo SHA.

Arquivos: `functions/src/studio.mjs`, testes de serviço/SDK; modelos de listagem
de books/adventures, hook e seção do Estúdio e seus testes; adaptadores/roteiros
visuais. A regra de estado editorial, a prosa, os escritores e a publicação não
mudam. A leitura filtrada pode percorrer várias janelas de metadados; essa condição
permanece visível e cancelável, sem quota de projetos ou soma de totais da página.

Backend, frontend e QA usam subagentes com arquivos separados; integração e gates
dependentes permanecem sequenciais. Não avançar com o filtro removido.

### Resultado local da correção

Validate integral exit 0: 152 arquivos/1.380 testes frontend, 77 scripts e
224 Functions; cobertura 93,16 / 86,56 / 92,03 / 95,36, tipos/build/smoke verdes.
SDK real 85/85. Controles de navegação 24/24 diretos em seis projetos, mais seis
repetições para conferir capturas em 320 px; progresso 90/90 diretos após a
correção, 149,87 s. Execuções finais com dois workers, retries 0 e sem flaky/skips.
Produção local: seis passaram e um skip Windows preexistente, 18,1 s.
Capturas dos filtros revistas nos três temas; revisão sem P0–P2 nos caminhos
conferidos. Documentação e diff verificados. Commit/envio da correção e CI do
novo SHA ainda condicionam a conclusão, sem usar a CI reprovada como aprovação.

A correção foi registrada e enviada em `16e71f6`. Em seguida, o operador autorizou
avançar sem esperar a CI e pediu testes direcionados após ajustes. F2-05 pode
começar com os gates locais acima; CI pendente continua registrada e acompanhada
em paralelo, conforme a [mudança de sequência](06-contratos-e-replanejamento.md).

## Evidência local anterior à correção da integração

- Validate integral exit 0: 151 arquivos / 1.361 testes frontend, 77 scripts e
  220 Functions; cobertura final 93,13 / 86,47 / 92,01 / 95,35, limites preservados.
- SDK/emulador: 83/83, incluindo replay depois de outra edição, preparação
  intercalada, composição e proteção dos recursos privados.
- QA final: 90/90 diretos, seis projetos, 145,32 s, dois workers e retries 0, sem skips
  ou flaky; teclado e nove capturas 320 px revisadas nos três temas.
- Produção local: seis passaram e um skip preexistente por referência Windows
  ausente, 14,7 s; gates e configuração preservados.
- Revisões independentes sem P0–P2 remanescente nos caminhos conferidos.
- Commit `7988fb7` enviado ao PR em rascunho; a CI visual reprovou, conforme
  a seção de correção acima. Esses resultados locais não encerram o incremento.

Detalhes, controles negativos e limitações na
[entrega F2-04](../../../entregas/2026-10-15-writer-v2-progresso.md).

## Riscos e não escopo

O maior risco é deixar um escritor fora do ledger ou contar HTML de modo diferente;
auditar caminhos e testar o corpus antes de confirmar o total. Projetos existentes
podem requerer várias chamadas de preparação e precisam mostrar essa condição.
Condições humanas/comerciais permanecem pendentes. Não implementar diário de
produção, calendário, prazos, sessões jogáveis, notificações, ranking, cobrança
por produtividade, retomada de itens narrativos ou posição exata do cursor.
