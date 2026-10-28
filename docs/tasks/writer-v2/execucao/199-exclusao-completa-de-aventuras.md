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
