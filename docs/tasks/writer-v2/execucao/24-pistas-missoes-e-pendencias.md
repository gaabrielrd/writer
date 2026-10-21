# F2-08 S3 — Pistas, missões e pendências

**Estado:** decisões recebidas e contrato técnico fechado em 2026-10-21;
implementado e validado localmente; CI do novo head pendente, sem rollout.
**Dependência:** [S2B](23-cenas-completas-na-preparacao-da-sessao.md), concluído
tecnicamente em `56cbb06`: correção visual com CI geral e regras verdes no PR #21.
A falha original de cacd71e e sua correção permanecem na evidência S2B.
**Origem:** [F2-08](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md).

## Objetivo

Preparar pistas e missões particulares, registrar condição de descoberta e
destinatário em texto, acompanhar estados e retomar pendências em outra sessão.
Concluir uma missão será uma ação explícita sem publicar pista, alterar universo
ou executar consequência. S3 deve fechar os critérios restantes de F2-08, sem
antecipar jogadores, revelação ou condução de F3.

## Decisões recebidas em 2026-10-21

1. Pistas e missões pertencem à campanha e podem ser vinculadas a várias sessões.
   Texto e estado são compartilhados pelo item; excluir sessão revoga seus
   vínculos e conserva o item da campanha. Vínculos são metadados sem prosa.
2. Missões têm os estados disponível, em andamento, concluída, falhou e abandonada.
   Toda mudança e reabertura é manual e privada, sem inferir sucesso por condição,
   rolagem ou texto. Pendência da missão deriva dos dois primeiros estados.

As duas lacunas de produto estão resolvidas. Fechar ABI, limpeza e recuperação
antes da implementação; não criar novas perguntas para decisões técnicas inferíveis.

## Evidência da descoberta

Consultas ao grafo não localizaram contratos atuais suficientes; inspeção dos
arquivos reais confirmou que quest/clue são tipos narrativos de blocos, sem ciclo
de estado de missão da mesa. WorkChecklist guarda título/concluído e está acoplado
a WorkProgress; não atende condição/destinatário nem a nova entidade.

SessionReferences é metadata-only e resolve material derivado sob autorização;
não deve receber prosa própria. S1 tem revisão/sessão, recibos históricos e
journal próprios, mas seu tombstone não executa limpeza ilimitada de prosa filha.
A política S2 de IDs órfãos até C4 não autoriza conservar prosa filha como se fosse
apagamento integral. Propriedade é a primeira dependência do contrato S3.

## Contrato técnico fechado em 2026-10-21

### Itens e estados

Nova folha `campaign-preparation`, dependente somente de auth/shared. Itens são
privados da campanha, sem leitura da aventura/universo/sourceContext. Texto
próprio simples, sem cópia automática. Apoio derivado permanece no leitor S2.

- Pista: `kind: clue`, título, corpo `{text, condition, recipient}` e estado
  `pending | handled` (Pendente/Tratada). Destinatário é anotação textual privada.
- Missão: `kind: quest`, título, corpo `{description, consequences}` e estado
  `available | active | completed | failed | abandoned` (Disponível/Em andamento/
  Concluída/Falhou/Abandonada).
- Tipo imutável. Criação começa em Pendente/Disponível; depois qualquer transição
  válida é explícita, inclusive reabertura. Nenhum estado publica ou dispara algo.
- Pendência deriva do estado: pista pending; missão available/active. Não existe
  booleano paralelo. Listas oferecem Todos/Pendentes e atualização explícita.
- Título obrigatório, trim, até 300 caracteres. Cada campo de prosa até 150.000
  caracteres; agregado até 512 KiB UTF-8 válido. Prosa sem trim ou truncamento.
- Ordem manual do catálogo por tipo; controle de coleção global por campanha.
  Mover somente na lista completa, nunca trocar com vizinho oculto em Pendentes.
- Vínculos possuem ordem própria por sessão, misturando os dois tipos. Mostram
  metadados atuais do item, sem prometer fotografia histórica de sua execução.
- Retomar acrescenta vínculo à sessão salva escolhida, preservando os anteriores.
  Duplicidade ativa sessão/item é impedida; repetição do pedido é idempotente.
- Excluir sessão revoga seus vínculos e preserva integralmente itens e corpos.
  IDs órfãos sem prosa aguardam C4. Excluir item grava tombstone sem título/estado
  e apaga corpo atomicamente; vínculos ficam neutros e removíveis sem fanout.
  Ausência física sem tombstone é inconsistência e falha fechada.

### Persistência e ABI

Coleções novas:

```text
campaigns/{cid}/preparationItems/{itemId}
campaigns/{cid}/preparationBodies/{itemId}
campaigns/{cid}/preparationState/current
campaigns/{cid}/sessionPreparationLinks/{linkId}
campaigns/{cid}/sessionPreparationState/{sessionId}
users/{uid}/campaignPreparationOperations/{operationId}
users/{uid}/campaignPreparationFences/{operationId}
```

Items contêm somente identidade, revisão, ordem, título, tipo, estado, datas e
marcador deleted. Bodies contêm identidade/revisão e corpo fechado. Separação
permite listagens sem ler prosa e exclusão física atômica do texto. Links guardam
identidades, sessão/item, revisão, ordem e datas; não duplicam texto ou título.
State guarda revision/nextOrder global; SessionState é próprio de cada sessão.

Dez RPCs, todos com autenticação e DTO fechado. Somente listCampaignPreparationItems
aceita campaignToken omitido para bootstrap autenticado do painel sem sessão;
sempre devolve o token atual no envelope. Nas demais chamadas token exato é
obrigatório. Resolver tem apenas action/request/intent na raiz; campanha/token
ficam dentro de request, sem duplicação externa:

| RPC                                  | Dados além de campanha/token                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| listCampaignPreparationItems         | kind, view all/pending, cursor/limit opcionais                                                                              |
| getCampaignPreparationItem           | itemId, expectedRevision                                                                                                    |
| saveCampaignPreparationItem          | operationId, itemId, expectedRevision, expectedItemCollectionRevision, kind, title, status, body                            |
| deleteCampaignPreparationItem        | operationId, itemId, expectedRevision, expectedItemCollectionRevision                                                       |
| moveCampaignPreparationItem          | mesmos controles de delete e direction up/down                                                                              |
| listCampaignSessionPreparationLinks  | sessionId, expectedSessionRevision, cursor/limit opcionais                                                                  |
| addCampaignSessionPreparationLink    | sessionId/revisão, operationId, linkId, expectedRevision zero, expectedLinkCollectionRevision, itemId, expectedItemRevision |
| removeCampaignSessionPreparationLink | sessionId/revisão, operationId, linkId, expectedRevision, expectedLinkCollectionRevision                                    |
| moveCampaignSessionPreparationLink   | mesmos controles de remove e direction up/down                                                                              |
| resolveCampaignPreparationOperation  | action, request congelado, intent cancel                                                                                    |

Ações: save-item/delete-item/move-item/add-link/remove-link/move-link. Criação exige
itemId igual a operationId; vínculo novo exige linkId igual a operationId. IDs
passam por validateId. CAS inclui revisão do alvo e do respectivo controle de
coleção. move-item troca a ordem com vizinho do mesmo tipo; move-link troca com vizinho
da sessão de qualquer tipo. Ambos incrementam a revisão do vizinho e controle. Add confere item e sessão na mesma transação; remove/move não dependem
da disponibilidade do item. Histórico de operação não depende de sessão ativa.

Ausência de controle só representa revisão zero quando consulta limitada,
incluindo tombstones, comprova coleção vazia; caso contrário falha fechada.

Respostas têm schemaVersion 1, ownerId/campaignId/campaignToken. Listas devolvem
somente metadados e revisão/nextCursor; get confere expectedRevision ANTES de ler
body e exige revisões metadata/body iguais. Lista de links inclui sessionId,
sessionRevision, itemCollectionRevision e linkCollectionRevision. Cada vínculo
traz available false sem título antigo ou available true com target atual.

Shapes fechados dos resultados (createdAt/updatedAt são números em milissegundos
do Unix epoch, válidos e finitos, como S1; não são datas textuais de sessão):

```ts
ItemSummary = {
  id, kind, revision, order, title, status, createdAt, updatedAt
}
LinkSummary = {
  id, revision, order, createdAt, updatedAt
} & ({ available:false } | { available:true, target:ItemSummary })
ItemReceipt = {
  operationId, action, itemId, expectedRevision,
  revision, itemCollectionRevision
}
LinkReceipt = {
  operationId, action, linkId, sessionId,
  expectedSessionRevision, expectedRevision,
  revision, linkCollectionRevision
}
Confirmed = Identity & { kind:'confirmed', receipt }
Canceled = Identity & { kind:'canceled', action, operationId }
ItemList = Identity & {
  itemCollectionRevision, items:ItemSummary[], nextCursor
}
ItemGet = Identity & {
  itemCollectionRevision, item:ItemSummary & {body}
}
LinkList = Identity & {
  sessionId, sessionRevision, itemCollectionRevision,
  linkCollectionRevision, items:LinkSummary[], nextCursor
}
```

Identity contém schemaVersion/ownerId/campaignId/campaignToken. ItemReceipt limita
action às três ações de item; LinkReceipt às três ações de vínculo. Revisão
resultante é expectedRevision + 1; revisão da coleção é a esperada + 1. Histórico
reproduz o recibo original, nunca a revisão atual. Tombstone neutro não requer
itemId no DTO do vínculo: remoção usa linkId, sem expor metadata antiga.

Página padrão 25, máximo 50, consulta mais uma linha para continuidade. Cursores
prendem UID/campanha/token, tipo/filtro, revisões e última ordem/ID. Cursor de
links prende AMBAS revisões de coleção: editar título/estado invalida paginação.
Pendentes são filtrados no servidor. Resposta limitada a 4 MiB, sem truncamento.

### Segurança e recuperação

Transação: autenticar/validar estrutura; conferir reserva permanente C4,
propriedade/token; conferir recibo/fence pelo fingerprint integral; somente para
operação nova conferir controles/sessão/CAS/alvos/corpo; escrever atomicamente.
Recibo confirmado é metadata-only, inclusive na primeira resposta. Reconhecer
histórico invalida lista e marca formulário para consulta explícita; não adota
texto posterior nem apaga edição posterior ao pedido congelado.

Resolver reconhece recibo existente ou grava fence que impede pedido tardio.
Cancelamento não ecoa request, prosa ou fingerprint: só identidade, kind canceled,
ação e operationId. Recibos privados podem guardar hash do pedido para comparação;
C4 sanitiza hash/prosa conservando apenas marcador terminal.

Journal único por UID/campanha para as seis ações, contendo pedido próprio
congelado completo antes de RPC. Web Locks cobrem CAS local, nunca HTTP. Intento
de cancelamento é persistido antes da chamada. Comparação canônica integral
antes de trocar/apagar snapshot. Storage inválido, formato futuro ou outra aba
preservam controle. Recuperação própria não depende da origem da aventura.

Sete namespaces fechados ao SDK direto (dono, intruso e anônimo). Nenhuma regra
pública, envio a jogador ou execução de consequência. Listas selecionam campos
explicitamente; nenhum corpo é devolvido por listagem/recibo/resolver.

### Composição e interface

CampaignDetail monta painel/editor uma vez por UID/campanha, irmão estável de S1,
fora de CampaignContent/materialEpoch. Salvar S1/adotar base não desmonta prosa
S3. Revisão da lista não rebaseia formulário. Guard da campanha protege journal;
guard da sessão protege somente novos comandos de vínculo. Fechar S1 não apaga
formulário nem bloqueia confirmação/cancelamento histórico.

Slot público S1 dispara callback com campanha/token/sessão/revisão salva e guard,
sem importar S3 nem possuir seu editor. Retomada abre sessão salva → Pistas e
missões → Pendentes → Vincular a esta sessão. Testar foco/Escape/retorno ao botão
quando diálogo S3 abre sobre S1, mantendo preparação S1 não enviada.

Interface pública proposta: CampaignPreparationPanel com campaignId, openRequest
(requestId/session/view) e onPendingChange. Contexto de sessão traz campaignId,
campaignToken, sessionId, expectedSessionRevision, isActive e readOnly. Closer
público readPendingCampaignPreparation/forgetCampaignPreparationRecovery compara
snapshot exato. Campaigns agrega dirty/reserva/pedido pendente/controle ilegível.

### C4 v4 e rollout

Aceitar estritamente versões 1/2/3/4; versão futura 5 continua recusada. Inventários
antigos mantêm prefixos/posições/checkpoints exatos: recovery 3/4/6, filhos 7/9/11.
V4 acrescenta Operations/Fences (recovery total 8) e cinco filhos (total 16).
Controls permanece 4. Novas exclusões iniciam cleanupVersion 4. Verificações
version===3 passam a >=3 SOMENTE depois da validação estrita. Limpeza de 25 por
etapa continua limitada. Sanitizar recibos/fences sem conservar fingerprint/prosa.

Índices: items deleted/kind/order/name; pendentes deleted/kind/status/order/name;
links sessionId/deleted/order/name e sessionId/deleted/itemId; recovery campaignId/
name conforme padrão existente, nos sentidos de movimentação usados pelas consultas.
O campo preparationBodies/body não é indexado. Escritores S3 e C4v4 sobem conjuntamente, drenando
instâncias antigas antes de habilitar S3. C4 antigo não certifica inventário novo.
Nenhum deploy, migração real ou exclusão de dados do operador é autorizado aqui.

## Arquivos e passos de implementação

1. [x] Receber decisões de produto e registrar estado/exclusão.
2. [x] Fechar dados, ABI, ordem/retomada, recuperação e inventários C4.
3. [x] Reestimar parcelas humanas sem dupla contagem.
4. [x] Backend: novos functions/src/campaignPreparationContracts.mjs e
       campaignPreparation.mjs e unidades; adaptar index.mjs/package.json,
       campaignDeletionContracts/DeletionCleanup/Deletion e testes C4,
       firestore.rules/firestore.indexes.json.
5. [x] Cliente: nova folha src/features/campaign-preparation com modelo,
       serviços/callables/recovery, hook, painel/catálogo/editor/vínculos e
       unidades; composição CampaignPage, slot S1, closer e fronteira arquitetural.
6. [x] QA: quatro famílias SDK reais, fixture e três jornadas em seis perfis.
7. [x] Revisar integração, validate no fechamento, docs/ADR/AGENTS/evidência.
8. [ ] Commit/envio autorizado ao PR em rascunho; acompanhar CI sem bloquear
       próximo incremento após validação local. Sem merge/deploy.

## Critérios e matriz de validação

Aceite: um item reutilizado em duas sessões; estado/texto compartilhados após
consulta explícita; pendência derivada e retomada sem cópia; ordem manual; CAS
antigo preserva rascunho; excluir sessão conserva item/prosa; item excluído fica
neutro/removível. Apoio S2 revogado/adotado não apaga prosa própria nem reaparece
por resposta tardia. Original e outra campanha permanecem íntegros.

Quatro famílias SDK:

1. Identidade/proprietário/token/C4, SDK direto negado, 27 itens/páginas,
   cursor de outro tipo/escopo e listas sem leitura de corpos.
2. Ciclo/CAS/ordem, duplicidade e retomada idempotentes, duas sessões, desvínculo
   isolado, excluir sessão conserva texto; item tombstonado neutro/removível.
3. Próprio separado de S2: revogação/adoção retira apoio sem impedir editar item,
   nenhuma cópia automática, resposta antiga não ressurge, original/outra mesa.
4. Recibo histórico/fingerprint, pedido perdido/cancel/fence e C4v4 em TODOS os
   namespaces novos, preservando outra campanha e inventários exatos v1/v2/v3.

Três jornadas × seis perfis: (1) preparar pista/missão, vincular duas sessões,
compartilhar estado, ordenar/retomar/excluir sessão, teclado/foco/320 px/S1 dirty;
(2) reconhecimento após reload, conflito, apoio revogado sem perder prosa e item
neutro/removível; (3) cancelamento perdido, reload, fence e closer C4 preservando
outra campanha. A revisão do roteiro inicial encontrou seis navegações no antigo
J2; traces reais da CI S2B mostraram 4–6 s por navegação. A divisão evita consumir
26–30 s do prazo global de 45 s antes das interações, conservando todas as
asserções e sem ampliar timeout/retry. Unidade cobre DTO/limites/transições/CAS
e corridas; desktop mantém sua largura, mobile J1 verifica 320 px nos três temas.

Testes afetados durante ajustes; npm ci --prefix functions antes do validate de
fechamento. Não repetir toda matriz S1/S2 sem risco concreto, não reduzir limites.
Resultados locais, SDK/fixture, CI e piloto humano têm evidências separadas.

## Estimativa e riscos

Referência humana O/C/P, confiança baixa, sem horas realizadas:

| Parcela                         | Otimista | Central | Pessimista |
| ------------------------------- | -------: | ------: | ---------: |
| Backend + unidades e C4         |     18 h |    30 h |       48 h |
| Cliente + unidades e composição |     16 h |    28 h |       46 h |
| QA SDK/nativo/revisão/evidência |     12 h |    20 h |       34 h |
| Total sem sobreposição          |     46 h |    78 h |      128 h |

A 20h/semana solo equivale a 2,3/3,9/6,4 semanas humanas para ESTE incremento,
sem espera de CI, participantes, comércio ou rollout. Não é saldo medido nem
previsão de lançamento. Substitui a referência antiga S3 8/12/20 h: catálogo
reutilizável, duas ordens/CAS, recuperação com prosa e compatibilidade C4 ampliam
seu escopo. Não somar novamente unidades na parcela QA.

Riscos: foco de dois diálogos, alvo de sessão ficar obsoleto, confirmação histórica
sobre edição posterior, cursor sem revisão dos itens, corpo antes do gate,
recibo/cancel vazando texto, tombstone confundido com corrupção e rollout misto.
Critérios negativos acima são obrigatórios. Jogadores, revelação, condução F3,
consequências automáticas, IA, backup/histórico e edição do original ficam fora.

## Evidência local em 2026-10-21

npm run validate exit0: 194 arquivos/1.998 testes frontend, 85 scripts,
409 Functions; cobertura 90,64/85,09/90,55/93,26 e build/smoke verdes.
Quatro famílias SDK, seis execuções positivas. Navegador: 18 combinações únicas
positivas, 21 execuções com uma falha inicial de roteiro preservada e corrigida
só no afetado; dois dirigidos adicionais comprovam Escape. Revisão cruzada
encerrou três corridas/CAS sem P1/P2 restante. [Entrega e resultados brutos](../../../entregas/2026-10-21-writer-v2-pistas-e-missoes.md).
CI do próprio head será acompanhada separadamente; sem merge/deploy.
