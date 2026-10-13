# W2-F2-03 — Arcos e cronologia básica

**Base:** `f4449a5`, 2026-10-13. **Estado:** implementado; QA completo, regras reais, validate integral final e produção local aprovados. Git e CI do incremento pendentes.
**Dependência:** F2-02 passou no [CI completo](https://github.com/gaabrielrd/writer/actions/runs/38431179149)
e nas [regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/38431178957).
**Tarefa:** [arcos e cronologia](../fase-02-criar-e-preparar/03-arcos-e-cronologia-basica.md).

## Autorização e escolhas

O objetivo ativo autoriza planejar, implementar e validar cada incremento. O plano
foi apresentado antes de alterações. O operador confirmou ordem manual e data
textual livre, como “3º dia do inverno”. Data vazia é válida; texto não é convertido
em Date nem participa da ordenação. D-02 trata de cânone/variantes, não de calendário.
Pilotos humanos, comércio, merge e deploy conservam suas condições próprias.

## Recursos e interface pública

`features/narrative-planning` oferece modelos, serviços e `NarrativePlanner`,
consumidos pelas interfaces públicas em livros e aventuras. O espaço contextual
“Arcos e cronologia” fica dentro dos projetos, preservando os cinco espaços globais.
Não introduzir campanhas, permissões de participante ou IA neste incremento.

Alvo fechado `{kind: book|adventure, id}`; dono deriva de Auth e do pai existente.
Livro usa authorId; aventura, ownerId. Recusar pai em exclusão e nunca recriar origem.

| Recurso                              | Dados privados                                                |
| ------------------------------------ | ------------------------------------------------------------- |
| `arcs/{id}`                          | título, estado inicial, objetivo e desfecho planejado         |
| `arcs/{arcId}/milestones/{id}`       | título, notas e ordem própria do percurso do arco             |
| `timelineEvents/{id}`                | título, descrição, dateLabel opcional e ordem da cronologia   |
| `narrativeLinks/{id}`                | origem arc/event/milestone e referência tipada por identidade |
| `narrativeControls`, `narrativeJobs` | revisões estruturais, slots e checkpoints privados            |
| `sceneLoreLinks/{id}`                | índice derivado privado das referências explícitas de cenas   |

Todos os itens têm schemaVersion 1, ID, ownerId, revision positiva, datas
operacionais do servidor e rank. Título obrigatório até 300 caracteres; campos
de planejamento até 4.000; dateLabel opcional até 300. Listas são resumos sem
textos longos; detalhes são carregados sob demanda. Sem quota comercial de itens.
Documentos até 900.000 bytes e respostas paginadas até 1.000.000 bytes, sem truncamento.

Marco e evento são distintos: um marco pode referenciar um evento compartilhado.
Mover o percurso de um personagem não rearranja a cronologia; nenhum movimento
altera ranks de cenas, capítulos, contagens ou prosa. Marcos não copiam a descrição
do evento. Arcos, cronologia e marcos de cada arco têm sequências independentes.

## API e concorrência

Resource discrimina `arc|event|milestone(arcId)`; source inclui também id. Toda
mutação usa operationId estável, fingerprint fechado e recibo privado mínimo em
`users/{uid}/narrativeOperations`, sem duplicar texto. CAS usa a revisão observada.
Erro de revisão usa failed-precondition/revision-conflict, sem dados privados.
Cliente conserva preenchimento e compara antes de confirmar sobre uma revisão nova.

| API                        | Contrato específico                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `getNarrativeContext`      | metadados autorizados do projeto, revisões e estado da preparação do índice           |
| `createNarrativeItem`      | resource, campos próprios e operação; insere ao final em transação                    |
| `updateNarrativeItem`      | source, expectedRevision, patch fechado e operação                                    |
| `getNarrativeItem`         | detalhe privado ou null para origem inexistente/alheia                                |
| `listNarrativeItems`       | resource/cursor/25 ou 50; resumos e controle estrutural observado                     |
| `moveNarrativeItem`        | source, expectedRevision/expectedStructureRevision e beforeId ou afterId              |
| `deleteNarrativeItem`      | source/revisão/operação; revogação inicial e limpeza retomável limitada               |
| `setNarrativeReference`    | source/revisão/operação, referência tipada, remove opcional                           |
| `listNarrativeReferences`  | páginas de vínculos e disponibilidade vigente, sem nomes históricos                   |
| `listNarrativeLoreOptions` | escopo book/universe do próprio projeto; identidade/nome/categoria, sem fichas longas |
| `listEntityScenes`         | referências explícitas de cenas por identidade; nunca detecção textual                |
| `listEntityNarrativeItems` | itens relacionados por vínculo explícito, sem prosa nem fichas copiadas               |
| `prepareEntitySceneIndex`  | preparar referências existentes em lotes de até 50, com checkpoint                    |
| `rebalanceNarrativeRanks`  | preencher slot inativo em lotes de até 50 e trocar atomicamente                       |
| `getNarrativeJob`          | pedido original e progresso autorizados, para retomar após recarga                    |

Cursores ligam UID, alvo, recurso/arcId/filtros, slot, identidade e revisões de
narrativa/cenas. Listas 25/50 e limit+1; reavaliar origem/escopo em cada página.
Mudança temporal invalida com revision-conflict; escopo diferente é argumento inválido.
Erro de página conserva os itens já mostrados; atualização começa na primeira página.

Ranks reutilizam os helpers puros de sceneRanks. Antes/depois compara vizinhos
reais da sequência, não índices da página. Esgotamento oferece job retomável;
estrutura bloqueada durante rebalance, edição de texto permitida. Troca de slot
atômica mantém a ordem anterior até concluir. Guardar o pedido original, sem
substituir versões observadas ao retomar. GET não migra nem muda metadados.

## Referências e consulta de entidades

Referências são documentos individuais, sem arrays crescentes e sem quota por
item: cena do mesmo projeto, evento do mesmo projeto, lore local do próprio livro
ou universo atualmente vinculado e pertencente ao autor. Aventura sem universo
continua funcionando com cenas/eventos; não ganha lore local nesta tarefa.

Disponibilidade e rótulo vêm da origem autorizada atual. Remoção, exclusão ou troca
de universo conserva identidade com rótulo indisponível, sem nome, trecho ou URL
da origem perdida. Nome igual não substitui identidade. Cena arquivada segue
acessível ao dono e é identificada como arquivada; mudança de agrupador não rompe vínculo.

`sceneLoreLinks` guarda identidades, não fichas ou prosa, com chave hash do vínculo.
setSceneReference atualiza referência e índice atomicamente. Preparação das
referências F2-02 existentes é explícita no protocolo, retomável e limitada a 50
filhos por lote; leitura da UI pode conduzir a preparação com progresso e retomada.
Enquanto incompleto, não devolver um falso vazio ou cobertura parcial como completa.
Concorrência com remover/adicionar referência verifica o snapshot na transação.

“Cenas vinculadas” exibe somente índices de referência persistidos. A detecção
lexical existente na cena aberta permanece identificada como menção textual;
não cria vínculo, evento ou cânone. Não varrer corpos completos do projeto pelo
navegador nem prometer busca textual exaustiva. Lore options é paginado e leve.

## Exclusão, privacidade e compatibilidade

Item em exclusão é marcado antes da limpeza e bloqueia novas mutações/vínculos.
Excluir arco limpa seus marcos e links de origem por lotes, preservando eventos
independentes. Excluir evento/marco limpa seus links de origem; vínculos recebidos
para evento permanecem indisponíveis. UI mostra efeito e pedido original retomável.

Raiz usa hasNarrativeResources/narrativeRevision protegidos, separados de cenas.
Datas do projeto permanecem monotônicas; revisões de narrativa não se passam por
alteração de prosa. Regras impedem writes diretos, perda de marcadores e finish
antigo que abandone filhos. Namespace e recursos privados não entram no leitor público.

deleteSceneBook incorpora coleções/filhos/índice novos à limpeza existente após
revogar publicação, inclusive livro só com narrativa. Cliente encaminha qualquer
marcador; pai permanece até limpar tudo. Não criar protocolo concorrente de exclusão.
Adventuras preservam seu ciclo atual; excluir itens não exclui o projeto automaticamente.

## Backup, publicação e experiência

JSON privado passa a v6 quando houver recursos narrativos. Captura guarda arcos,
marcos, eventos e referências originais, sem UID, índices derivados ou jobs.
Conferir narrativeRevision, sceneRevision e metadados do projeto antes/depois;
não finalizar backup parcial durante exclusão. v1–v5 permanecem para livros sem
recursos narrativos. Restauração integral continua na tarefa própria.

PDF/DOCX/Markdown e publicação continuam somente com prosa e projeções vigentes,
sem títulos/datas/notas de narrativa acrescentados. Não alterar a ordem do manuscrito.
Troca de UID/projeto invalida respostas atrasadas. Formulários cobrem erro, vazio,
carregamento e sucesso; retry incerto congela pedido, conflito preserva campos.
Navegação contextual conserva arco/aba ao abrir uma cena e retornar.

Interface por teclado, foco nos diálogos e 320 px nos três temas. Arcos mostram
campos e marcos; cronologia mostra ordem manual e datas livres ou “Sem data”.
Entidades oferecem cenas vinculadas e itens relacionados paginados; referências
indisponíveis podem ser removidas/substituídas sem abrir origem inacessível.

## Arquivos e execução

1. Root: contrato/modelo público, encerramento documental de F2-02 e integrações.
2. Backend: narrativePlanning/narrativeContracts/narrativeJobs/sceneLoreIndex,
   scene mutations/cleanup, callables, regras/índices e testes reais/unitários.
3. Frontend: feature narrative-planning, serviços/componentes/hook/testes e
   identificação de menções textuais na cena, somente pelas interfaces públicas.
4. Root: BookPage/AdventurePage, modelos/serviço de livros, captura JSON v6,
   exportação, testes, docs/ADR e revisão final.
5. Visual: stores/adaptadores isolados, narrative-planning.visual.ts, alias Vite
   e integração dos metadados; modelo real de captura usado onde aplicável.
6. Root: seis shards no CI e testes do contrato da distribuição. Manter 2 workers,
   45 s individuais, 15 min/job, retry, asserções, uploads e check E2E requerido.

Subagentes paralelizam somente ownerships independentes com este contrato fixo.
Não adicionar dependências, antecipar fase 3/campanhas/IA ou mudar a navegação global.

## Gates, critérios e riscos

- Autor percorre arco/marcos e mestre encontra acontecimentos da aventura.
- Reordenação narrativa preserva prosa, ordem das cenas/capítulos e exportações.
- Todas as consultas respeitam autoria/origem; referências removidas não navegam.
- Índice existente é preparado sem omissão, mesmo com mutação concorrente.
- Backup privado é completo/consistente; publicação continua sem notas privadas.
- CAS, retry, cursores, jobs, exclusão, troca de universo/UID e clientes antigos
  têm testes; Chromium comprova temas, teclado/320 e jornadas equivalentes.
- npm ci functions, validate integral, regras reais, produção E2E, revisão,
  documentação/entrega, Git/PR e CI do SHA pertinente antes de encerrar tecnicamente.

O maior shard de F2-02 levou 13,8 min; seis partes distribuem os 744 casos atuais
em 124 cada, sem omissão/duplicação. Medir o novo tempo no CI, sem estimá-lo como
resultado. Hosting ainda tem integration sem sharding em 30 min: risco separado,
não declarar resolvido por esta mudança nem executar deploy. A intermitência
legada de autocomplete registrada em F2-02 permanece sem correção comprovada.

## Checkpoint local — 2026-10-13

Implementação do contrato concluída nas frentes backend, frontend e integração.
Validate integral verde: 142 arquivos/1.195 testes frontend, 77 scripts, 133 backend;
cobertura 93,17/86,69/91,90/95,34, lint/tipos/build/smoke aprovados. Regras completas
no emulador demo: 74/74, zero falhas/skips, 31,999 s.

Revisões independentes corrigiram a verificação de autoria de livro retornado do
cache, incluindo refresh e guarda de renderização. O primeiro QA revelou contexto
de universo antigo mantido após desvincular pelo formulário do livro; invalidar o
Planner por UID/projeto/universo corrige o caso e preserva arco/visão pela URL.
Regressão unitária da integração passou; quatro percursos visuais dirigidos passaram
após os ajustes, incluindo revogação real pela UI, UID/paginação e backup/publicação.
Fixtures demonstram UI/transporte; regras/atomicidade são comprovadas no emulador.

Inventário completo atual: 744 casos em seis shards de 124; 744 identidades únicas,
zero omissões/duplicações/extras. Ainda medir duração e conclusão remotas. A rodada
final de 96 visuais narrativos passou em 544,418 s, sem skips, falhas ou retries;
pixels de 320 px inspecionados nos três temas. A regressão completa de cenas passou
96/96 em 498,592 s, sem skips ou retries. A primeira rodada dos fluxos existentes
terminou em 89/90: WYSIWYG mobile-dark inseriu texto na posição errada após fechar
lore, antes do autosave/navegação. Três repetições intactas passaram, sem demonstrar
correção. Teste JSDOM reproduziu a janela DOM/selectionchange; o foco síncrono
pós-fechamento passou no mesmo teste e nos 25 de RichEditor/AIAdapter. Verificação
de gesto nativo confirmou causa/candidato com controle do callback de foco em
servidores temporários externos: anterior devolve DOMfim para “Li”, candidato
preserva o fim e digitação. O WYSIWYG intacto passou 18/18 (3×seis projetos) e as
duas jornadas focais de cenas passaram 12/12, sem skip/retry. Rodada intacta de
90 regressões finais passou 90/90 em 261,031 s, sem skip/retry/flaky. Processos
próprios de QA encerrados e pixels 320 px inspecionados nos três temas.
Após ajustes e documentação/AGENTS, validate integral final passou: 142 arquivos/
1.196 testes frontend, 77 scripts, 133 backend; cobertura 93,18/86,71/91,90/95,35.
Lint, tipos, build e smoke verdes, limites mantidos. E2E de produção local exit 0:
seis passaram em 17,4 s e um skip legado por falta da referência Windows; nenhum
caso ficou não executado por timeout. Configuração/rede preservadas, processos
próprios encerrados. CI do SHA novo precisa comprovar todos os checks Linux.
A [entrega](../../../entregas/2026-10-13-writer-v2-arcos.md) registra resultados e
pendências reais; não declarar CI ou conclusão técnica antes dos respectivos gates.
