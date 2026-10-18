# F2-08 S1 — Sessões privadas da campanha

**Estado:** contrato revisto por backend, cliente e QA; implementação autorizada
pelo escopo sequencial do Writer V2, ainda não validada nem entregue.
**Dependências:** F2-07 validado localmente em `1b20f49`; regras remotas revelaram
uma expectativa SDK antiga no teste do Estúdio, em correção. A CI acompanha a
execução sem bloquear estudo independente, conforme decisão do operador.
**Origem:** [preparação de sessões](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md),
[domínio](02-modelo-de-dominio.md), [privacidade](03-permissoes-e-privacidade.md)
e [exclusão C4](20-exclusao-integral-da-campanha.md).

## Objetivo, recorte e hipóteses

Preparar sessões particulares em campanhas independentes ou capturadas de aventura
própria: criar, consultar, editar, excluir e ordenar, preservando texto autoral e
pedidos incertos. O texto próprio permanece acessível ao dono quando a origem da
aventura está indisponível. Não copiar material derivado para esse texto.

S1 entrega a estrutura privada. S2 acrescentará referências autorizadas e consulta
de material; S3, pistas, missões e pendências. Nenhum desses recortes isoladamente
comprova os quatro critérios completos de F2-08. A referência de esforço da tarefa
continua 32/48/80 h; divisão provisória S1 12/20/32, S2 12/16/28, S3 8/12/20 h,
sem compromisso de calendário. Preservar a capacidade solo de 20 h/semana.

A pergunta sobre data ainda não recebeu resposta. Após oportunidade de resposta,
adota-se como **suposição técnica inicial** data real opcional sem horário,
`scheduledDate: YYYY-MM-DD | null`; não é uma escolha humana confirmada.
Validar calendário gregoriano, anos 0001–9999 e dias reais, sem conversão de fuso.
Data do mundo fictício já pertence à cronologia narrativa; não inferir integração.

Estados já aprovados no domínio: `planned`, `running`, `completed`, exibidos como
Planejada, Em andamento e Concluída. Alteração explícita é metadado privado e não
executa sessão, revela material, publica diário ou altera campanha/cânone.

## Persistência, autorização e limites

- `campaigns/{cid}/sessions/{sessionId}`: schema 1, ownerId/campaignId/token preciso,
  id, revision contínua, order inteiro seguro positivo, createdAt/updatedAt do
  servidor, deleted; ativos também title, scheduledDate, status e summary.
- `campaigns/{cid}/sessionState/current`: schema 1, dono/campanha/token, revision
  da coleção e nextOrder. Controle ausente só equivale a zero após consulta
  limitada que prove inexistência de sessões, inclusive tombstones. Controle
  perdido ou inconsistente interrompe a operação; não recalcular silenciosamente.
- `users/{uid}/campaignSessionOperations/{operationId}`: recibo opaco retido até
  exclusão integral da campanha, quando é reduzido a marcador mínimo C4;
  fingerprint do pedido normalizado, identidade e resultado mínimo. Sem prosa,
  título, data de encontro, lista de sessões ou credenciais.

Toda API confere autenticação, reserva permanente C4, dono e token preciso da
campanha antes de ler corpo/recibo ou repetir escrita. Campanha indisponível não
é substituída por livro/aventura homônimo. Não exigir autorização da aventura para
texto próprio. Nenhuma leitura/escrita direta pelo SDK, inclusive recibos.

Título obrigatório até 300 caracteres, trim e UTF-8 válido; summary texto simples
até 150.000 caracteres e 512 KiB, preservando whitespace. Chaves fechadas, datas,
estados e inteiros seguros validados nas duas fronteiras. Sem HTML interpretado,
arrays ilimitados, totais derivados ou quota arbitrária de sessões.

Listar apenas metadados, sem summary: 25 por padrão, máximo 50 e um lookahead;
ordenar por order crescente e ID. Cursor fechado vinculado a UID, campanha,
token, collectionRevision, order e ID. Qualquer mutação invalida a paginação
anterior. Não filtrar por estado em S1, para a adjacência ser inequívoca.
Resposta máxima 4 MiB; consulta bounded e índice declarado.

## ABI pública proposta

```ts
type Scope = { campaignId: string; campaignToken: string };
type Session = {
  id: string; schemaVersion: 1; ownerId: string; campaignId: string;
  revision: number; order: number; title: string;
  scheduledDate: string | null; status: 'planned' | 'running' | 'completed';
  summary: string; createdAt: number; updatedAt: number;
};
type Envelope = Scope & {
  schemaVersion: 1; ownerId: string; collectionRevision: number;
};
type Receipt = {
  operationId: string; action: 'save' | 'move' | 'delete'; sessionId: string;
  expectedRevision: number; revision: number; collectionRevision: number;
};
type Mutation = Envelope & { receipt: Receipt; session: Session | null };
listCampaignSessions({ campaignId, campaignToken?, cursor?, limit? })
  -> Envelope & { items: Omit<Session, 'summary'>[]; nextCursor: string | null };
getCampaignSession(Scope & { sessionId })
  -> Envelope & { session: Session | null };
saveCampaignSession(Scope & {
  sessionId; operationId; expectedRevision;
  title; scheduledDate; status; summary;
}) -> Mutation;
moveCampaignSession(Scope & {
  sessionId; operationId; expectedRevision; expectedCollectionRevision;
  direction: 'up' | 'down';
}) -> Mutation;
deleteCampaignSession(Scope & { sessionId; operationId; expectedRevision })
  -> Mutation;
```

Criação: expectedRevision 0, sessionId igual a operationId, estado inicial planned;
ordem append gerada pelo servidor e avanço atômico de nextOrder/collectionRevision.
Outro estado na criação é rejeitado explicitamente; a UI apresenta Planejada ao
criar e permite alterar o estado após a criação, sem normalização silenciosa.
Edição substitui o formulário inteiro contra a revisão observada. Não enviar
PATCH implícito nem aceitar título/corpo com revisão diferente.

Mover acima/abaixo troca duas ordens e duas revisões na mesma transação. Consulta
do vizinho limitada, com comparação da coleção observada; limite sem vizinho é
erro explícito sem recibo, não sucesso fictício. Data/estado não reordenam.
Validar overflow em ambas as revisões e ordens distintas; vizinho excluído não
participa. Preservar corpos. Lista com revisão nova do vizinho não pode virar
base do formulário mantendo seu texto antigo; exige leitura completa explícita.
Bloquear movimento local enquanto houver formulário alterado ou operação pendente.
Movimento remoto conserva o rascunho e sua revisão antiga; salvar conflita sem
sobrescrever. Resposta atrasada nunca reabre formulário fechado ou substitui edição.
Excluir exige confirmação com título e revisão congelados; escreve tombstone
sem título/texto/data e avança a coleção. Recriar ID tombstonado é negado.

Mutation traz Envelope, recibo mínimo e `session: Session | null`. Recibo inclui
operationId, action save/move/delete, sessionId, expectedRevision, revision
confirmada e collectionRevision do evento. O servidor confere fingerprint exato
antes de reconhecer replay. Uma operação já confirmada permanece confirmável
mesmo depois de nova edição; só retorna corpo se revisão e hash ainda coincidirem
com o resultado original. Caso contrário session é null: o cliente encerra o
pedido confirmado, preserva o rascunho e exige consulta explícita antes de adotar
estado atual. Não transformar recibo histórico em autoridade sobre outro texto.
Replay não altera contadores, ordem, timestamps ou estado.
Receipt.revision é expectedRevision + 1. Envelope.collectionRevision é a revisão
atual; receipt.collectionRevision é a histórica, menor ou igual à atual. Em move,
a revisão histórica da coleção é expectedCollectionRevision + 1. Conferir schema,
dono/campanha/token, alvo/ação, fingerprint e inteiros seguros do recibo persistido.
Hash inválido na mesma revisão falha fechado, sem confirmar corpo corrompido.

## Cliente e recuperação

Nova feature folha `campaign-sessions`, dependente somente de auth e shared.
`campaigns` compõe o painel e o encerramento C4 pelas interfaces públicas; não
criar import reverso para campanhas/C4. Services contêm callables/persistência.
Manter APIs externas e storage fora de componentes, sem dependência nova.

Painel na campanha: lista paginada, estados de loading/vazio/erro/sucesso,
formulário de título/data/estado/preparação, ações por sessão e diálogo de exclusão.
Campos por shared/ui, ícones Lucide e tokens semânticos. Mover acima/abaixo por
ação acessível, preservar foco e anunciar resultado; suportar teclado, celular e
três temas. Não reutilizar internals de cenas nem checklist do projeto.

Um journal versionado por UID/campanha, com token, pedido integral, operação e
formulário autoral. Web Locks e CAS do snapshot integral, sem lock durante HTTP;
confirmar persistência antes de enviar. Troca de UID, campanha, journal ou epoch
invalida respostas atrasadas. Falta de Web Locks/armazenamento bloqueia envio com
mensagem recuperável, sem descartar texto. Draft alterado não adota GET ao focar.
Nenhum novo pedido sobrepõe um incerto. Recuperar só após conferência da campanha;
repetir exatamente a operação mediante ação explícita, sem retry silencioso.
O gate retornado no envelope autoriza a campanha mesmo com session null. Não
exigir existência/listagem da sessão para repetir criação ou exclusão incerta;
não rebasear token/revisão/formulário do pedido com GET posterior.

Exclusão C4 comprovada para o mesmo UID/campanha revoga apresentação antes do CAS;
pulso é somente invalidação. Novo closer público permite a campaigns encerrar
somente o snapshot mostrado, sem ler material derivado; preserva journal diferente,
inválido ou futuro e aguarda conclusão da transação local. Foco/GET concorrentes
não podem deixar painel permanentemente ocupado nem ressuscitar texto excluído.

## Compatibilidade obrigatória da limpeza C4

Antes de habilitar sessões, estender inventário de limpeza com sessions,
sessionState e recibos opacos seletivos da campanha. Não acrescentar posições à
lista v1 e reinterpretar checkpoint existente.

Novos jobs usam cleanupVersion 2 interna. Ausência de versão preserva semântica v1
e suas sete coleções. Checkpoints/part/certificações aceitam somente o inventário
da respectiva versão; versão desconhecida falha fechada. Registro terminal continua
mínimo, sem carregar versão/inventário interno nem prosa. Jobs v1 já iniciados não
podem receber sessões porque a reserva permanente bloqueia todos os novos writers.

Ativação operacional exige implantar guardas, cinco callables, regras, índices e
novo início/avanço C4 conjuntamente e drenar versões antigas **antes** de habilitar
a UI S1. Um writer antigo de início C4 poderia criar job v1 após criação de sessão;
somente versionar advance não resolve coexistência. Manutenção Admin segue o mesmo
gate. Nenhum deploy ou remoção de dado real está autorizado por este plano.

## Sequência de execução

1. [x] Rever ABI com backend, cliente e QA; fechar lacunas de recibo e limpeza.
2. [ ] Implementar serviço puro injetado, CAS, ordem, paginação e testes de domínio.
3. [ ] Atualizar inventário C4 com compatibilidade v1/v2 e testes reais de limpeza.
4. [ ] Compor callables, regras negativas, índice e testes SDK com emulador real.
5. [ ] Implementar folha cliente, journal/closer, painel e testes de comportamento.
6. [ ] Integrar na campanha, controlar invalidação/foco/UID e fechamento C4.
7. [ ] Validar duas jornadas nativas nos seis perfis; revisar capturas móveis/320.
8. [ ] Rodar validate no fechamento, rever diff, atualizar docs/ADR/AGENTS e entrega.
9. [ ] Commit e envio ao PR autorizado; acompanhar CI sem esperar para estudo seguinte.

Arquivos previstos: functions/src/campaignSessions*.mjs, funções/contratos C4,
functions/src/index.mjs e scripts de sintaxe existentes; functions/test e tests/firestore,
firestore.rules/firestore.indexes.json; nova src/features/campaign-sessions,
composição pública campaigns, testes/e2e/visual pertinentes; docs afetadas e AGENTS.
Arquivos compartilhados têm dono único durante implementação; mudanças dependentes
só começam depois de contrato revisto. Sem alterar limites, retries ou timeouts.

## Critérios verificáveis e riscos

- Criar duas sessões, editar, mover por teclado e recarregar preserva título/texto,
  data/estado/ordem; outra campanha permanece intacta.
- Texto próprio de campanha capturada continua acessível após revogação da origem.
- Escrita antiga, concorrência de ordem, ID tombstonado e controle ausente não
  sobrescrevem texto nem inventam revisão. UTF-8 inválido, datas impossíveis,
  paginação estrangeira/antiga e overflow falham sem escrita parcial.
- Resposta de save perdida, reload e replay exato produzem uma escrita; edição
  posterior não impede confirmação histórica nem é adotada silenciosamente.
- C4 bloqueia leitores/writers/replay antes do corpo, elimina sessões/controle,
  preserva outra mesa e fecha apenas journal antigo explicitamente confirmado.
- Jobs C4 v1 continuam retomáveis; v2 limpa novos recursos com limites iguais.
- SDK de outro UID e do dono não lê/escreve sessões/controle/recibos diretamente.
- Interface cobre erro/vazio/carregamento, foco/cancelamento, três temas, mobile,
  sem erros de console/página. Fixtures não comprovam autorização do backend.

Riscos principais: replay histórico confundido com corpo atual; movimento após
mudança de topologia; perda de controle tratada como zero; sessão criada durante
rollout de C4 antigo; journal novo apagado por confirmação antiga; reutilização
indevida de material revogado. Os contratos e testes acima tratam cada caso.

## Não escopo

Referências de cenas/NPCs/lore, pistas, missões, consequências, checklist por sessão,
agenda externa, horário, notificações, participantes, compartilhamento, condução
ao vivo, publicação, cânone, IA, histórico de versões, importação e backup de sessões.
Nada disso recebe checkbox de concluído por esta estrutura privada.
