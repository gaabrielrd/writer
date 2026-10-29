# P2 — exclusão completa e retomável de aventuras

Base: 7d5bd93. Objetivo inteiro Writer V2 permanece ativo.
Somente commits locais; sem subagentes, CI, push/PR, merge ou deploy.

## Objetivo e descoberta

O plano 198 comprovou uso normal após restauração e identificou a ausência de
exclusão de projeto aventura. Implementar o fluxo completo, da confirmação à
limpeza retomável, com reserva permanente contra recriação/retomadas antigas.
Não usar deleteSceneBook com cast nem cleanup de restauração como substitutos.

Fontes atuais: Studio, scenes/sceneJobs, campaignDeletion/Contracts/Guard/Cleanup,
matriz de consumidores e Rules. O grafo parcial não contém serviços recentes;
busca sem resultado não é prova de ausência. Verificar namespaces reais e suas
fronteiras antes de implementar cada etapa.

## Requisitos

- Fonte privada de confirmação: UID/aventura, identidade nativa de nascimento,
  revisão e título atual. A confirmação é explícita e separada da simples leitura.
- Início idempotente, reserva global permanente por adventureId e job privado
  por conta. Recibo/fingerprint e checkpoint próprios. Reserva de outra conta
  não revela identidade privada nem permite tomar ou reutilizar o ID.
- Reserva e root.deleting fecham os escritores/leitores/IA/captura/ativação e
  creators de Studio/importação/restauração. Replay histórico não recria raiz,
  lote, uso ou chave nem concede acesso. Início incerto é resolvido pelo mesmo
  ID; eventual fence desconhecido não desfaz exclusão confirmada.
- Limpeza limitada por páginas/unidades, metadata antes de prosa, checkpoints
  atômicos e retry exato. Inventário fechado por família e consulta final vazia.
  Não varrer texto de outra conta nem usar recursiveDelete sem limite.
- Remover estrutura/corpos/planejamento/referências/blocos/arcos/marcos/eventos,
  lore próprio/corpos/índices, progresso/checklist/ledger/histórico. Tratar jobs/
  chaves/contextos/operações externas por identidade, não apenas prefixo.
- Desvincular universo e retomada/atividade; impedir novas operações pendentes.
  Destacar usos de imagens e preservar arquivos/imagens ativos da biblioteca que
  são cópias próprias, inclusive quando reutilizados por outro projeto.
  Personas próprias e lotes/recibos ativos não devem ser retirados por excluir
  uma aventura. Material preparing exige fechamento/fence, não promoção implícita.
- Conferir restaurações ativadas ainda com mídia/coleta pendentes: fechar
  derivação/uso sem reaparecer raiz e preservar job/recibos congelados. A limpeza
  de preparação e a de projeto têm responsabilidades distintas.
- Campanhas existentes não são excluídas junto. Bases/derivados dependem do
  acesso atual à origem; notas próprias permanecem conforme contratos anteriores.
- UI privada no projeto/Estúdio: revisão do que será removido, confirmação,
  progresso, falha/retry/retomada após recarga. Arquivos já baixados permanecem
  sob controle do usuário. Não publicar termos comerciais nessa operação.
- Só concluir exclusão quando o inventário/filhos estiver vazio, vínculos
  encerrados e raiz removida com reserva/recibos nativos permanentes.
- Testes dirigidos por ajuste; validate integral ao fechar o bloco 198–exclusão,
  sem reduzir cobertura ou limitar o escopo do objetivo.

## Sequência de implementação

1. Inventariar controles/famílias e definir contratos próprios, reserva/guard.
   Testar schema, mascaramento, privacidade e recusa antes de I/O de corpos.
2. Integrar guards de criação/consumo e provar que novas tentativas/replays não
   contornam a reserva. Não expor produtor de reserva antes dos gates necessários.
3. Implementar fonte/início/job/recibos/resolução/avanço com transações e nascimento
   nativo. Acrescentar limpeza por família com unidade e consulta vazia final.
4. Integrar quiescência de contextos, importação/restauração, mídia, usos,
   universo/retomada, Rules e demais consumidores revelados pelo inventário.
5. Cliente e UI com retomada/confirmacão, SDK/Rules pertinentes e browser nos
   três temas/mobile/teclado. Dados reais não serão excluídos no QA.
6. Regressão do ciclo rico restaurado, exclusão original, cópia alheia preservada,
   falhas após commits, conta/revisão/origem trocadas, reserva recriada/forjada,
   cursor/recibo antigos e novas criações no mesmo ID.
7. Revisão, documentação/ADR/evidência, validate integral e commit(s) locais
   coerentes. Atualizar P2 somente quando o conjunto dos seus aceites estiver
   provado; P3/D/F2-09 e gates humanos/comerciais continuam no objetivo.

## Arquivos previstos e suposições

Serviços próprios adventureDeletion*, integração nos produtores/leitores
identificados, index/Rules conforme o contrato, feature cliente de exclusão
composta pelas interfaces públicas, testes e matriz/documentação.
Reutilizar somente primitivas demonstradas; não criar alias de campanha/livro.

A reserva guarda apenas metadata e nunca prosa/chave. Identidades históricas
não são autorização atual. Estado ambíguo/corrompido preserva dados e recusa
limpeza até conferência; falha não permite reaproveitar a identidade.
Não introduzir dependência nem política comercial nova.

## Aceites

- [ ] Inventário e gates completos contra recriação/retomada.
- [ ] Fonte/início e limpeza de todas as famílias, com vínculo/metadata preservados.
- [ ] Cópias próprias/mesas alheias preservadas e derivação revogada corretamente.
- [ ] UI/retomada e contratos SDK/Rules/browser comprovados.
- [ ] Regressões dirigidas e validate integral verdes.
- [ ] Revisão, documentação/evidência e commits locais.

## Estado de implementação — em andamento

Primeira etapa local, ainda sem produtor público de exclusão: guard privado
com leitura mascarada da reserva permanente, validação fechada dos metadados,
erro sem identidade para outra conta e integração na criação do Estúdio.
Scenes, WorkProject/histórico/blocos, lore, âncora de backup e contexto de IA
também recusam raiz reaparecida atrás da reserva.

A integração revelou contextos internos de histórico montados sem db no chat/
aplicação. Eles passaram a fornecer o port explicitamente; não há fallback que
ignore a reserva. Os testes da âncora agora exigem exatamente a leitura adicional
da reserva, sem relaxar o bloqueio de prosa/universo ou alterar o token v1.

Resultados dirigidos: 73 Node do guard/âncora/contexto/Estúdio; 433 Node das
famílias de backup/blocos/histórico/progresso; 16 de aplicação de sugestões.
Há sobreposição entre rodadas; não somar como testes distintos.
Lint dos arquivos do primeiro grupo, arquitetura/docs e diff passaram.
Nenhum endpoint ou início de exclusão foi exposto, nem dado real excluído.

Pendentes: gates restantes de creators e consumo, inventário operacional
completo, serviço/job/limpeza/recibos/resolução, Rules, cliente/UI/retomada,
browser e validate integral do bloco. Esta tarefa permanece aberta e sem
entrega declarada.

## Segunda preparação local — reserva, consumidores e fonte

Integrados importação/retomada/chaves e ativação de restauração, mídia antes/
depois do I/O, origem/base/comparação de campanha, narrativa/jobs, descoberta de
job de cena e catálogo/retomada. Notas próprias da campanha e perguntas próprias
do chat permanecem; respostas derivadas ficam ocultas antes de ler seu corpo.
Recibos históricos de ativação continuam metadata, sem autorização atual.

Fonte interna de confirmação usa title/revision e tokens de nascimento e
updateTime nativos da raiz/progresso. Não expõe método em index.mjs nem inicia
exclusão. Rules negam listagem direta da raiz, mantêm o catálogo por callable
existente e conferem reserva/deleting/owner no get e filhos permitidos.

42 Node novos verdes, 390 de domínio, 355 de restauração, 77 de autoria,
cinco Vitest integrados e 37 cenários SDK/Rules distintos no emulador demo. Há sobreposição entre
rodadas; detalhes reais e falhas corrigidas na
[entrega parcial](../../../entregas/2026-10-28-writer-v2-reserva-e-fonte-da-exclusao-de-aventuras.md)
e decisão na [ADR 0221](../../../decisions/0221-adventure-deletion-reservation-and-source.md).

Todos os aceites gerais acima permanecem abertos: não há produtor/job/limpeza
ou interface de exclusão. Inventário completo/fechamento de Storage/controles,
universo/atividade e fontes órfãs precisam preceder a exposição da operação.
O validate integral continua reservado ao fechamento do bloco.

## Próximo passo — inventário físico e início privado

Base conferida em 24411d3, árvore limpa. A prova SDK local m113-group-probe
encontrou quatro corpos com raiz/pais ausentes, em três consultas de duas
unidades, com projeção vazia e exclusão de cinco caminhos alheios.

Usar collectionGroup por filho conhecido (body/planning/references/milestones)
com cursores de nome de documento dentro da raiz: limites documentais fixos
!/! e ~/~ enquadram os nomes ASCII das famílias autorizadas. Validar cada
caminho retornado contra a família e profundidade exatas; não interpretar
nome semelhante como pertencimento. Paginar também as 19 coleções diretas.
Reconsultar desde o início após remover uma página e exigir consulta vazia,
incluindo filhos sem head. Porta sem suporte deve recusar, sem travessia
por pais como fallback. A prova não cobre índices/configuração de produção.

Implementar o início somente no serviço interno (sem index/callable/UI):
UID/fingerprint/pedido fechado, CAS de sourceToken/nascimento/revisão atuais,
reserva/job/recibo e revogação atômicos, desvínculo tipado do universo.
Confirmação posterior lê metadados nativos; incerteza usa o mesmo ID.
Vincular nascimento do job/reserva/recibo inicial e último checkpoint; metadado
copiado/recriado não autoriza uma tentativa antiga. Resolver início desconhecido
com fence não deve cancelar exclusão confirmada, nem consultar prosa atual.

Depois integrar limpeza/quiescência completa e avanço; não declarar este
início privado como produto disponível ou exclusão concluída.

## Início interno e inventário — implementados parcialmente

Serviço próprio agora inicia/consulta/lista/resolve com fonte atual e metadados
nativos, revogação/recibo/job/reserva e desvínculo atômicos. O recibo é lido
por folhas e possui hash do checkpoint. Perda de ACK ou da leitura posterior
retoma pelo pedido original. Ainda sem export em index/callable/UI.

Inventário v1 independente da restauração enumera 19 coleções diretas e
quatro grupos de filhos. Caminhos/profundidades/dono/projeto são conferidos;
página de até 25, sem corpos, seguida de observação vazia separada.
Provas: 28 Node e oito SDK/Rules reais verdes; 54 órfãos sem raiz removidos
em 25/25/4/0 nas transações do teste, vizinho preservado e reaparecimento
bloqueando certificação. O processador do produto ainda não existe.

A [ADR 0222](../../../decisions/0222-adventure-deletion-start-and-inventory.md)
e a [evidência parcial](../../../entregas/2026-10-28-writer-v2-inicio-privado-e-inventario-da-exclusao-de-aventuras.md)
registram regras, resultados e limites. Próximo: integrar quiescência operacional,
retirada de mídia/usos e fontes/controles externos, avanço da limpeza/atividade,
certificação terminal e cliente/UI. Todos os aceites gerais continuam abertos.

## Avanço interno — encerramento dos contextos e pedidos

Base 530413d conferida limpa. Acrescentar nascimento original da raiz ao job
privado, derivado do snapshot (sem input do cliente), para conferir a identidade
dos contextos mesmo quando o head já estiver ausente. O formato continua interno,
sem jobs reais/endpoint; não há migração silenciosa de um formato público.

Implementar advance com token nativo/checkpoint/fingerprint, recibo e novo estado
atômicos. Primeiro processador: invalidar contextos e retirar seus corpos sem
hidratar captura/frozen; desligar turnos ativos da origem para impedir resposta
tardia. Consultar somente UID/alvo/nascimento conferidos; preservar outras origens
e contas. Raiz marcada não recebe novas mutações durante os passos.

A política de perguntas próprias na exclusão inteira foi perguntada ao operador;
não apagar perguntas enquanto essa resposta não chegar. Ficha indisponível e
exclusão de projeto têm escopos diferentes. Partes dependentes dessa decisão
aguardam; núcleo de avanço e encerramento de derivação podem prosseguir.

Não saltar uma etapa ainda não implementada nem fabricar certificação. Mídia,
usos, importação/restauração, limpeza e verificação finais permanecem obrigatórios
antes da exposição do fluxo e do fechamento 199.

## Resultado parcial — contextos e turnos ativos

Advance interno e partes zero/um implementados. Snapshot retirado por metadata,
controle fechado e turno ativo desligado com catálogo no checkpoint atômico.
O nascimento original da raiz permite retomada sem head. 27 Node e 11 SDK/Rules
positivos; lote 10/3/0, rollback da página, retry após ACK perdido e resposta
atrasada sem escrita. Índices locais declarados, sem implantação.
Veja [ADR 0223](../../../decisions/0223-adventure-deletion-quiescence.md) e
[evidência parcial](../../../entregas/2026-10-28-writer-v2-avanco-privado-e-encerramento-de-contextos.md).
A parte dois recusa até implementar fontes; nenhuma fase completa certificada.
Perguntas próprias e corpos de turnos preservados nesta etapa. Demais aceites,
interface e validate integral continuam pendentes; macro 8/35 inalterada.

## Integração seguinte — fontes e mídia de restauração/importação

Base dcf3135 conferida limpa. Processar a fonte de restauração original pela
identidade nativa da raiz/job e preservar o job ativado e seus recibos.
Primeiro retirar mídia ainda pendente por geração/fence, sem publicar imagens
preparing; imagens que já ficaram ativas são cópias próprias preservadas.
Conferir novamente origem, checkpoint e intenção após I/O externo.

Compor mídia/coleta e recibos originais com o checkpoint da exclusão na mesma
transação. A chave é removida pela primeira coleta existente, por metadata,
não por um segundo fluxo que deixaria o sidecar antigo inconsistente.
Retomar coleta parcial ou já concluída, sem tocar artefatos atuais da aventura,
personas ou biblioteca ativa. Cada avanço executa uma unidade limitada.

Na importação ativada, provar job/reserva/token e nascimento da raiz pelo
recibo nativo da ativação. A chave já deve estar ausente. Retirar manifests
de seção em páginas somente após conferir recibos de append, sem ler corpos;
preservar job/recibos. Raiz ausente não perde a identidade histórica.

Testar fontes reais pelas factories existentes, mídia preparada/ativa,
retirada física e accept atrasado, falha/ACK após I/O/commit, origem/recibo
recriados e vizinho preservado; SDK local pertinente. Só certificar quiescência
depois dos processadores e verificações implementados; as fases restantes,
perguntas próprias pendentes, interface e validate integral continuam abertas.

## Resultado parcial — fontes integradas

Quiescência agora retira mídia preparing e coleta fontes originais de
restauração/importação. Recibos e checkpoints são atômicos; imagem ativa,
job ativado, personas e campanhas independentes permanecem. Fontes provadas
vazias e ausência de chaves permitem mover para a fase media, ainda pendente.

76 Node distintos positivos em rodadas sobrepostas; 13 SDK/Rules distintos,
com a jornada nativa de mídia/coleta positiva isoladamente em 274595,1786 ms.
Duas tentativas anteriores atingiram 180 segundos na preparação original;
limites e checks reais estão na
[evidência parcial](../../../entregas/2026-10-28-writer-v2-fontes-na-exclusao-de-aventuras.md)
e decisão na [ADR 0224](../../../decisions/0224-adventure-deletion-source-retirement.md).
Não conclui exclusão inteira, interface, P2/P3/D/F2-09 ou macro 8/35.

## Próximos processadores — mídia, usos e autoria

Base 916490c conferida limpa. Implementar o portão de mídia pela mesma
identidade de fonte, sidecars originais completos e ausência de preparação/chaves
remanescentes, sem publicar nem apagar cópias ativas.

A limpeza de usos consulta o grupo uses dentro do namespace da biblioteca do
UID, por adventureId, em lotes de 25. Conferir caminho/tipo/recurso/chave exatos;
agrupar por imagem antes de atualizar useCount, preservando usos de outros
projetos e bytes/metadata independentes. Uso órfão com imagem ausente pode ser
retirado sem recriar imagem ou contador. Cabeçalho presente inconsistente
recusa o lote inteiro. O vazio é outra observação. Declarar índice local.

Processar então as 23 famílias do inventário já aprovado, com até 25 remoções,
recibo e checkpoint por transação, sem carregar prosa ou depender de pais.
Consulta vazia avança a família; outra verificação de todas as famílias vazias
precede a fase controls. Raiz marcada/reserva permanecem até o fechamento
integral, ainda não implementado.

Testes dirigidos de contadores compartilhados, outras contas/projetos, órfãos,
rollback/ACK/replay/concorrência, famílias/filhos e reaparecimento atrás da
varredura. SDK real de consultas/contagens e transações; sem dados reais.
Controles/chat derivado/atividade/verificação final e cliente/UI continuam
necessários, com validate integral no fechamento do bloco.

## Resultado parcial — usos e autoria implementados

Mídia passa por portão de leitura; usos de imagens são retirados em 25/25/3/0
com contador agregado por imagem, preservando cópias e outros projetos/contas.
As 23 famílias são removidas por metadata e vazios separados, mesmo sem heads.
Reaparecimento de conteúdo próprio conhecido reabre sua família antes do
certificado, em vez de exigir exclusão manual ou declarar vazio falso.

78 Node e 14 SDK/Rules distintos positivos em rodadas sobrepostas; resultados,
correções de asserção e limites estão na
[evidência parcial](../../../entregas/2026-10-28-writer-v2-usos-e-autoria-na-exclusao-de-aventuras.md)
e na [ADR 0225](../../../decisions/0225-adventure-deletion-images-and-authorship.md).
Job chega a controls em deleting. Controles/chat derivado/atividade/final,
interface e validate integral continuam pendentes; macro 8/35 inalterada.

## Próxima integração — corpos derivados do chat e retomada

Base 4a9e46e conferida limpa. Auditar os produtores: recibos de cenas,
histórico, progresso, blocos, lore e chat conservam IDs/hashes/revisões, sem
prosa. Preservar esses recibos opacos e limites da conta; não apagar por prefixo
nem quebrar a resolução histórica. Autorizações atuais continuam obrigatórias.

Limpar contextos e corpos de turnos por páginas de metadata no UID. Conferir
controle/token/escopo e nascimento original; preservar perguntas, metadados de
turnos e conversas. Para órfãos com origem congelada, exigir prova nativa e hash
do pedido original de preparação/conversa antes de atribuir o escopo.
Órfão temporário sem controle nem origem verificável recusa sem ler captura
ou escolher um projeto por suposição. Recusas preservam a página inteira.

Revalidar controles próprios e ausência de corpos antes de certificar controls.
A origem revogada não permite geração tardia, aplicação ou débito; testes devem
provar que perguntas próprias continuam acessíveis sem ler respostas removidas.
Não usar o cleanup geral da conversa, que também remove perguntas.

Retirar depois a retomada canônica da aventura e invalidar o cursor da conta
por revisão atômica, preservando outros projetos e accessedAt. Dados de controle
inconsistentes recusam sem remoção parcial. Verificação terminal e remoção da
raiz/cliente/UI continuam próprias; política final de perguntas ainda pendente.

## Resultado parcial — chat derivado e retomada

Processadores implementados com páginas de dez por metadata e recibos/hash/
nascimento para órfãos prontos. Perguntas próprias e recibos preservados;
outros projetos criados depois do início também permanecem. Órfão temporário
sem origem verificável recusa sem ler a captura. Atividade canônica sai com
revisão da conta/checkpoint/recibo no mesmo commit, sem mudar accessedAt.

56 Node dirigidos e três SDK/Rules positivos; correção da fixture, resultados
e limites na
[evidência parcial](../../../entregas/2026-10-28-writer-v2-chat-e-retomada-na-exclusao-de-aventuras.md)
e [ADR 0226](../../../decisions/0226-adventure-deletion-chat-and-activity.md).
Chega a verify em deleting; verificação terminal/raiz e exposição/cliente/UI
ainda faltam. Política final de perguntas permanece pendente. Macro 8/35
inalterada; validate integral no fechamento do bloco.

## Próxima integração — verificação e fechamento nativos

Base 1d7a6b6 conferida limpa. Implementar segunda passagem limitada e somente
por metadata dos corpos/controles do chat. Cada avanço conserva checkpoint e
cursor; conteúdo próprio comprovado reabre controls, sem certificar vazio.
Não apagar perguntas nem decidir a política final pendente.

No commit terminal, reler as 23 famílias com limite um, usos de imagens, fontes/
chaves/mídia, retomada canônica e corpos derivados por escopo indexado. Reabrir
família/fase conhecida reaparecida e truncar certificados posteriores; identidade
recriada ou sem prova continua recusada. As varreduras apoiam-se na reserva
permanente e nos guards que impedem novos escritores da origem. Não substituir
a leitura final por contadores ou certificados anteriores.

Remover raiz quando presente e atualizar reserva deleted, job completo e recibo
na mesma transação. Preservar nascimento original; leitor terminal exige raiz
ausente e updateTime da reserva/job igual ao nascimento do último recibo.
Retry antigo devolve recibo original/progresso atual, sem repetir efeitos.
Recusar reserva/job/raiz recriados, mesmo com metadata copiada.

Arquivos: adventureDeletion.mjs, Controls/Activity e novo Verify, índices locais,
testes Node/SDK e documentação/ADR. Sem endpoint, cliente/UI ou migração pública.
Testar ciclo completo/raiz ausente, reaparecimento em família/imagem/chat/atividade,
perguntas legíveis, transação final/rollback/ACK perdido e provas nativas. Rodar
somente checks/testes afetados; validate integral permanece no fechamento 198–199.

## Resultado parcial — verificação terminal implementada

Segunda passagem limitada do chat e consultas finais de inventário/usos/fontes/
atividade/corpos implementadas. Conteúdo conhecido reabre sua fase, truncando
certificados. Contradição corpo/controle recusa por metadata, sem ciclo de
reabertura. Remoção da raiz, reserva deleted, job completo e recibo são atômicos;
leitor exige raiz ausente e relógios nativos conjuntos.

123 Node e seis SDK/Rules positivos; resultados reais/correções/limites na
[evidência parcial](../../../entregas/2026-10-28-writer-v2-verificacao-terminal-da-exclusao-de-aventuras.md)
e [ADR 0227](../../../decisions/0227-adventure-deletion-terminal-verification.md).
Motor interno chega a complete. Transporte autenticado, cliente/UI/recarga,
política final de perguntas e validate integral continuam abertos; não conclui
199/P2/P3/D/F2-09/V2. Macro 8/35 e gates preservados.

## Próxima integração — contrato cliente e recuperação metadata

Base 3628888 conferida limpa. Criar adventure-deletions como feature folha de
auth/shared, sem importar implementações de campanhas ou portabilidade. Primeiro
implementar tipos/verificadores, transporte de seis comandos e coordenador por
conta/aventura, com diário metadata por Web Locks/localStorage. Não compor UI,
nem exportar endpoints do servidor antes de concluir a recuperação integrada.

Validar schemas fechados e orçamentos antes de adotar respostas: sourceToken,
adventureToken, deletionToken, UID/aventura/job, recibo original e checkpoint.
Progresso pode reabrir fase anterior, mas não retroceder checkpoint, contagem,
datas ou conclusão. Catálogo tem envelope próprio do servidor, sem confundir
a resposta de campanhas. Cursor continua opaco e limitado.

Persistir pedido exato antes do primeiro envio. Início incerto repete o mesmo
ID ou grava intenção de cancelamento antes de resolver no servidor. Confirmação
não cancela job já existente. Etapa guarda identidade, piso conhecido e pedido
original. ACK perdido, resposta inválida, falha local ou troca de conta preservam
a pendência. Só substituir por progresso conhecido após recibo ou conflito
definitivo com consulta atual do mesmo job. CAS do envelope inteiro em toda
transição; outra aba ou entrada ilegível impedem sobreposição.

Diário guarda somente IDs, hashes, revisão, checkpoint, contagem, fase e datas:
sem título, manuscrito, perguntas/respostas, arquivo ou chave de recuperação.
Releitura local não autoriza origem nem inicia avanço automaticamente. Leitura
remota permanece disponível sem reserva de escrita no navegador.

Arquivos: feature nova (model/services/tests/index), documentação e ADR. Testar
schemas, retornos de todos os comandos, reload/ACK, concorrência/CAS, conta trocada,
respostas tardias/forjadas, quota/lock indisponível e recuperação de conflito.
Checks dirigidos/tipos; sem suite completa, CI, publicação ou UI nesta integração.

## Resultado parcial — núcleo cliente e recuperação metadata

Feature própria com contratos, adaptador de seis comandos, coordenador por
conta/aventura e reserva Web Locks/CAS implementados. Pedido original é salvo
antes do envio; recibo, identidade e pisos precedem adoção. ACK perdido retoma
pelo mesmo ID/token/checkpoint e intenção de cancelamento não desfaz confirmado.
Diário sem título/prosa/chave; conta, outras abas e falhas preservam pendência.

49 Vitest e 21 testes arquiteturais positivos, incluindo ciclo com as factories
reais sobre double até remoção terminal. Veja
[evidência parcial](../../../entregas/2026-10-28-writer-v2-cliente-e-recuperacao-da-exclusao-de-aventuras.md)
e [ADR 0228](../../../decisions/0228-adventure-deletion-client-recovery.md).
Sem endpoint exportado ou hook/UI composto. Transporte autenticado, browser,
política final das perguntas e validate integral ainda faltam; macro 8/35.
