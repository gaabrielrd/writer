# F2-07 C4 — Exclusão integral e retomável da campanha

**Estado:** concluído tecnicamente em `0006a66`, com CI/regras verdes em 2026-10-18.
Validate verde: 1.813 frontend, 81 scripts e 358 Functions; cinco famílias SDK
únicas validadas e 12 combinações de navegador mais duas revalidações dirigidas.
**Dependência:** C3B concluído tecnicamente em `947cfc3`, com CI e regras verdes.
**Evidência:** [entrega C4](../../../entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md),
[ADR 0036](../../../decisions/0036-campaign-deletion.md).
**Origem:** [campanhas](14-campanhas-e-variantes.md),
[adoção](19-adocao-explicita-de-base-da-campanha.md) e
[ADR 0035](../../../decisions/0035-campaign-base-adoption.md).

## Objetivo e recorte

Excluir explicitamente uma campanha independente ou criada de aventura própria,
revogando novas leituras/mutações antes da limpeza física limitada e retomável.
Remover descrição, notas, checklist, retomada, bases, variantes, candidatas,
gerações e vínculos de ilustração dessa campanha. Preservar aventura, universo,
lore original, biblioteca e usos de outras campanhas. Não depender da autorização
da origem para apagar os recursos particulares.

O início confirmado é irreversível. Fechar o diálogo ou pausar etapas não desfaz
a intenção. A limpeza conserva apenas marcadores/recibos mínimos contra replay,
sem texto, chave, ciphertext, relações ou descriptor. Não prometer remoção de
todo documento opaco que não tenha vínculo seletivo à campanha.

Sem nova decisão de produto indispensável: o contrato F2-07 já exige exclusão
explícita e limpeza integral. As escolhas abaixo são técnicas, dentro desse
escopo. Não ampliar para campanhas compradas, exclusão de conta ou universo.

## Contrato público fechado para revisão

Seis APIs específicas, sem endpoint genérico de jobs:

```ts
getCampaignDeletionSource({ campaignId }) -> DeletionSource | null
startCampaignDeletion(StartInput) -> DeletionMutation | StartCanceled
resolveCampaignDeletionStart(StartInput & { intent: 'cancel' })
  -> DeletionMutation | StartCanceled
getCampaignDeletion({ campaignId } | { captureId }) -> DeletionLookup
listCampaignDeletions({ cursor?, limit? })
  -> { items: DeletionProgress[], nextCursor: string | null }
advanceCampaignDeletion({ deletionId, operationId, expectedCheckpoint })
  -> DeletionMutation
```

União de lookup fechada: exatamente uma chave. No ramo captureId, somente o
servidor deriva a campanha reservada pelo algoritmo existente de B. Não criar
preparação ou calcular IDs no cliente; não inferir exclusão por aventura/nome.

```ts
type StartInput = {
  campaignId: string;
  campaignToken: string;
  expectedRevision: number;
  operationId: string;
};
type DeletionSource = {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  revision: number;
  title: string;
};
type DeletionIdentity = {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  deletionId: string;
};
type DeletionProgress = DeletionIdentity & {
  state: 'deleting' | 'deleted';
  phase:
    | 'recovery'
    | 'controls'
    | 'bases'
    | 'lore-generations'
    | 'campaign-children'
    | 'activity'
    | 'finalizing'
    | 'complete';
  checkpoint: number;
  complete: boolean;
  revoked: true;
  createdAt: number;
  updatedAt: number;
};
type DeletionReceipt = {
  operationId: string;
  action: 'start' | 'advance';
  expectedCheckpoint: number | null;
  confirmedCheckpoint: number;
};
type DeletionMutation = {
  receipt: DeletionReceipt;
  progress: DeletionProgress;
};
type StartCanceled = {
  kind: 'canceled';
  schemaVersion: 1;
  ownerId: string;
  request: StartInput;
};
type DeletionLookup = {
  schemaVersion: 1;
  ownerId: string;
  lookup: { campaignId: string } | { captureId: string };
  deletion: DeletionProgress | null;
};
```

Inteiros seguros não negativos; revisão inicial ≥1; token da encarnação pelo
createTime preciso existente. Datas seguem workDate. complete só é verdadeiro
com state deleted e phase complete. Sem contagens caras ou estimadas. Source
valida dono/schema/encarnação/disponibilidade, sem gate de aventura ou universo;
título só na resposta de confirmação, nunca no journal/job.

Recibo vincula o pedido original; progresso pode estar adiantado. Exigir identidade
integral e checkpoint ≥ confirmedCheckpoint, sem substituir os inputs preservados.
Start exige expectedCheckpoint null e confirmedCheckpoint 0. Advance com expected n
exige confirmed n+1 seguro. Negar recibo com delta zero, overflow ou ação diferente,
mesmo que o progresso atual seja maior. Replay conserva esse recibo original.
Não chamar uma prova de exclusão de confirmação histórica de operação antiga.

## Persistência e concorrência

- `campaignDeletionReservations/{campaignId}`: reserva global privada permanente,
  somente schema/dono/campanha/token/deletionId/estado/datas. Impede reutilização
  do ID por qualquer UID após remover a raiz.
- `users/{uid}/campaignDeletions/{deletionId}`: job com identidade, fase,
  checkpoint e cursores internos limitados. Sem arrays ilimitados ou prosa.
- `campaignDeletionOperations` e `campaignDeletionStartFences` sob o UID:
  fingerprints, recibos e intenção inicial, sem título/descrição/descriptor.

Start lê recibo/fence, reserva, raiz e vínculo. Confere token/revisão e grava
reserva/job/recibo, marca deleting e retira vínculo organizacional na mesma
transação. Uso/contador existente deve ser consistente, sem clamp; universo
ausente pode ter uso órfão retirado sem recriar universo. Replay não desvincula
outra vez. Concorrência com atualização/adoção é serializada pela raiz/reserva.

Dois starts diferentes não criam dois jobs: um ganha a reserva; o outro tem erro
definitivo e conserva seu controle até encerrar a tentativa sem recibo com fence.
Não substituir silenciosamente o pedido local pelo job vencedor. Resolver inicial
com recibo existente confirma o job; sem recibo cria fence que vence start atrasado.
Mesmo operationId com payload diferente falha. Após início não há cancelamento.

CreateCampaign, criação/ativação B e todo escritor/leitor de campanha consultam a
reserva na transação pertinente antes de criar, servir conteúdo ou repetir recibo
que apresente recurso atual. Estudo das fontes confirma que os leitores canônicos
já usam Functions. Fechar SDK get/list da raiz campaigns, além dos filhos e dos
namespaces novos. Histórico B pode continuar servindo só seu recibo mínimo próprio.

## Etapas de limpeza

| Fase              | Recursos                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| recovery          | Sanitizar campaignVariantOperations e resoluções remotas; remover chaves, relações e descriptors                                  |
| controls          | Sanitizar preparações B/comparações/adoções e limpar decisions; guardar somente roteamento terminal necessário                    |
| bases             | Todas as campaignBases próprias da campanha; pins, images, bodies, links, loreReferences e items; depois header                   |
| lore-generations  | Todas as gerações e seus loreVariants/loreVariantBodies, inclusive antigas, inativas e parciais                                   |
| campaign-children | notes/noteState, workChecklist/workProgress, layout legado loreVariants/loreVariantBodies/loreVariantState e filhos v1 conhecidos |
| activity          | Linha determinística de retomada e revisão global de atividade, se a linha existia                                                |
| finalizing        | Conferir certificado das passadas e remover só a raiz marcada da encarnação reservada                                             |
| complete          | Reserva/job terminais mínimos e recibo final, disponíveis sem raiz                                                                |

Não seguir apenas os ponteiros ativos: variantes atuais podem emprestar corpos de
gerações antigas e anchors de bases antigas. Enumerar prefixos físicos próprios
por metadados, sem carregar prosa ou paths enviados pelo navegador. Não usar os
canceladores públicos B/C3A: eles protegem bases ativadas/adotadas. Extrair somente
o helper interno necessário, autorizado pelo job de exclusão.

Cada etapa confere reserva/job e, quando existe raiz, token/marca de exclusão.
Raiz ausente permite continuar pela reserva; raiz com outra identidade interrompe
sem apagá-la. Não remover uma base/geração antes dos filhos. Falha conserva fase
e checkpoint; uma coleção vazia pode confirmar transição limitada. Não repetir
destruição/decrementos ao confirmar resposta perdida pelo mesmo recibo.
Coleções apagadas ficam vazias; controles/recibos sanitizados continuam presentes
por contrato. Certificar a passada limitada e a whitelist de cada registro sob a
reserva/barreira, sem exigir query vazia deles nem varredura ilimitada no commit
final. Nenhum escritor canônico pode inserir conteúdo depois dessa certificação.

## Pins e biblioteca

Os arquivos são da biblioteca; bases mantêm pins tipados. Remover um registro de
imagem por transação. Imagem pending de captura parcial ainda não tem pin:
conferir ausência do uso pela chave derivada e remover só o registro, sem exigir
contador ou decrementar. Uso inesperado é inconsistência, sem inferir reparo.
Imagem ready exige imageId/useKey derivada/kind/campanha/base conferidos; retirar
pin, decrementar useCount e remover registro capturado atomicamente. Estado
desconhecido falha. A família SDK de imagens inclui candidata interrompida antes
de preparar o pin, além de captura pronta.
Nunca compor vários planos count-1 da mesma imagem na mesma transação sem
agregação: a opção menor é um pin por etapa.

Biblioteca ausente permite remover somente uso órfão conferido. Biblioteca
existente com uso/contador inconsistente interrompe, sem zero inventado. Preservar
arquivo e usos da aventura/outra mesa, inclusive imagem compartilhada entre várias
bases. Não há cópia Storage exclusiva da campanha para excluir neste contrato.

## Retenção mínima e fechamento de caminhos antigos

Recibos de studio/campaign/notes/work/capture e comparação já têm hashes/IDs e
pequenos resultados; alguns não têm campaignId consultável. Conservar somente o
que não contém conteúdo e impede replay. Inventariar campos reais antes do código;
não tratar a palavra data como prova de ausência de texto.

Sanitizar requests completos dos fences C3A, chaves/headers/relatedSourceKeys C2,
result.request de resolução remota e contexto de preparações/comparações/adoções.
Remover título, descrição, sourceToken/contexto, certificados, decisões e
descritores; reduzir recibos de decisão à whitelist mínima. Roteamento terminal
próprio pode conservar campanha/token/IDs do controle, sem relações ou prosa.
Job completo é substituído por whitelist terminal, sem cursores ou contexto.
O relógio campaignAuthorization/current pertence ao UID e não é removido.

Resolvers C2/remoto e de início C3A/C3B, que hoje escrevem sem raiz, precisam
conferir reserva antes de qualquer criação/replay mutante. Endpoints com apenas
captureId/comparisonId/adoptionId leem primeiro máscara de dono/campanha do controle
e a reserva, antes do registro completo. Sanitização conserva esse roteamento.
Reasons fechados campaign-deleting/campaign-deleted impedem reconstrução de
descriptors após a limpeza. Cada escritor inclui essa fronteira em testes.
Mídia reautoriza antes e depois do I/O; resposta iniciada antes da exclusão não
entrega bytes se o gate mudou enquanto lia Storage. Preservar private/no-store.

## Cliente e jornadas

Nova feature pública campaign-deletions, com transporte/contratos/journal/hook,
diálogo e descoberta global no Estúdio. Campanha oferece ação Excluir campanha;
cartão no Estúdio usa menu de ação fora do link inteiro atual. Abrir confirmação
busca Source atual; resumo de lista não autoriza exclusão. Congelar o Source
mostrado na confirmação, sem atualizar token/revisão silenciosamente enquanto o
diálogo estiver aberto. Mudança exige nova consulta e confirmação. Dialog destrutivo
explica notas/bases/variantes/checklist e preservação do original/biblioteca;
botão Excluir definitivamente, sem exigência adicional de digitar uma palavra.

Antes de start há Cancelar; depois, Fechar, Continuar limpeza e Pausar após esta
etapa. Explicit start/continue pode executar etapas limitadas sequenciais enquanto
aberto; parar em resposta incerta, conflito, pausa, troca de UID/alvo ou fechamento.
Known, GET, reload e eventos nunca avançam automaticamente. Não manter Web Lock
durante HTTP. Reserva/mudança/limpeza local usam lock por UID/campanha e CAS do
envelope integral. Congelar controle mostrado, releitura exata imediatamente antes
de cada RPC e após awaits; resposta antiga não libera controle mais novo.
GET explícito pode substituir leitura pendurada por novo proprietário; resposta e
finally antigos não podem apagar dados ou loading da nova leitura. StepPending em
checkpoint-conflict tem saída explícita: GET autoritativo da mesma identidade com
checkpoint maior e ação Encerrar tentativa e usar progresso atual. Trocar por
Known sob CAS integral, sem afirmar execução do passo antigo ou avançar sozinho.

Ao confirmar ou observar prova autoritativa, desmontar editores/leitores, limpar
RAM/mídia e invalidar awaits. Emitir pulse opaco entre abas, sem título/conteúdo.
Outros dispositivos detectam em foco/GET; não prometer apagar bytes já recebidos.
O painel de exclusão fica fora do subtree desmontado e funciona sem raiz/origem.
Listagem pagina 25/50, diferenciando janela vazia com cursor do fim.

Oferecer encerramento explícito dos controles antigos somente após validar lookup
integral de exclusão com revoked true e mesmo dono/campaignId. A reserva permanente
revoga todas as encarnações desse UID/CID para esse encerramento local: token
antigo continua no journal, sem transplante, e não precisa coincidir com o da
exclusão. Essa exceção não serve para recuperar texto, executar mutações ou
reconhecer outra encarnação. Não expor prova de exclusão de outro UID. Cada feature
expõe encerramento do próprio journal pela interface pública, sem ciclo ou acesso
interno entre features. CAS de cada snapshot; IDB exige oncomplete antes de liberar
controle/chave. Não replay de mutação, decrypt ou migração de AAD. Não afirmar se
o pedido antigo executou. Null/erro/lista vazia/origem negada não autorizam limpar.

Gestão A também participa: seu journal tem título/descrição, campaignId e revisão,
sem token. Expor encerramento pela interface pública da feature, com snapshot
integral/Web Lock, substituindo clear apenas por operationId nesse caminho.
Não repetir updateCampaign. Start B não tem campaignId/token local: usar lookup captureId no servidor, que
prova a impossibilidade permanente de nova escrita nesse ID, sem afirmar criação
histórica. C1/C2/C3 preservam seus tokens originais, com a exceção de encerramento
permanente acima. Texto próprio pendente não é salvo
implicitamente pela exclusão; controles de outra campanha/UID são preservados.

## Fronteiras de composição e invalidação

campaign-deletions é folha: importa apenas auth/shared entre features, inclusive
tipos; não importa os recursos que serão encerrados. A composição fica em
campaigns/components/CampaignDeletionControls.tsx e num wrapper público de
preparações da mesma feature. O Estúdio usa esse wrapper. O host importa C4 e
closers públicos B/C1/C2/C3A/C3B, usando o closer A interno. A prova validada e os
snapshots confirmados pertencem ao host; cada closer recebe só seu snapshot e
guarda de sessão, sem importar tipos de C4. Falha ou controle substituído mantém
aquele journal e apresenta encerramento parcial, sem rollback dos já encerrados.

Leitores/editores recebem invalidação por um adaptador neutro compartilhado,
shared/services/invalidationPulse.ts: ator e scope opaco, sem interpretar campanha,
token ou permissões. Publicação/assinatura e geração em memória servem somente
para limpar apresentação/inutilizar awaits. Não transporta prova, título ou texto,
não autoriza limpar journals, decifrar ou enviar mutação. Necessidade demonstrada:
vários leitores independentes precisam receber a mesma invalidação sem importar
C4 ou criar ciclos. Capturar indisponibilidade de BroadcastChannel e manter
invalidação local/revalidação em foco; não prometer realtime entre dispositivos.

O check:architecture atual não detecta ciclos. Acrescentar regras verificáveis por
análise de imports/reexports/dynamic imports, com testes e sem dependência nova:
C4 só importa auth entre features; somente campaigns pode importar C4 entre
features. Studio importa a composição pública de campaigns. shared continua sem
dependências de domínio. Não basta declarar ausência de ciclo sem conferir essas
arestas. A nova regra entra no AGENTS só após implementação e validação.

## Budgets

Metadados padrão 25/máximo 50, limit+1, cursor pela última chave examinada.
Limpeza comum até 25 documentos físicos; pins um por transação. Até 384 leituras,
64 escritas, 4 MiB selecionados lidos, 2 MiB de escritas e 4 MiB de resposta.
Não avançar cursor além do que foi confirmado; recurso indivisível acima do limite
falha preservando checkpoint. Nenhum corpo autoral carregado para apagar.

## Revisão antes do código

Revisões independentes fecharam imagens pending sem pin, certificado final
compatível com controles sanitizados, prova permanente cobrindo encarnações
antigas do mesmo UID/CID, gestão A sem token, StepPending vencido, delta exato de
recibo, Source congelado, GET substituível e mídia antes/depois do I/O. A fronteira
folha/composição/invalidação neutra resolve os ciclos identificados antes do código.
Nenhum teste ou implementação C4 foi executado para fechar este planejamento.

## Sequência e validação

1. Revisar este contrato com backend, frontend e QA; resolver inconsistências
   técnicas antes do código, preservando escopo e portões (feito).
2. Implementar reserva/guard e início/recibos; fechar escritores/leitores atuais
   e criação/ativação/replay, com testes dirigidos.
3. Implementar fases/pins/sanitização/finalização e provas de orçamento/identidade.
4. Implementar controle/recuperação e composição pública, com negativos A→B/UID.
5. SDK real, navegador dirigido, revisão e validate no fechamento do incremento.
6. ADR/arquitetura/testing/AGENTS/entrega, commit/push; CI em paralelo, sem deploy.

Cinco famílias SDK reais: independente com >25 filhos/contador/atividade;
capturada com múltiplas adoções/bindings/legado e origem revogada; imagens
compartilhadas e contador corrompido; corridas/replay/encarnação/recriação; chaves/
descriptors/resolvers tardios/lookup B e negação SDK get/list/write. Unitários
instrumentam máscaras, zero leitura de prosa, budgets e respostas perdidas.
Nessas mesmas famílias, distinguir fence inicial antes de criar job de resposta
perdida após commit: cancelar start nunca desfaz início confirmado. Lookup B após
sanitizar preparação e apagar raiz deve seguir válido, com start/activate tardios
negados e somente histórico B mínimo preservado. Suspender separadamente
readGeneration e derivação de imagem, iniciar exclusão durante o I/O e provar
zero bytes servidos depois da reautorização. Não acrescentar famílias por isso.

Duas jornadas nos seis projetos, 12 combinações: independente/confirmar/remover
do Estúdio e capturada/perda de resposta/reload/retomar/encerrar controles antigos.
Controle desktop adicional somente se adaptadores não demonstrarem integração
A→B real de lock/IDB; não multiplicar a matriz por negativos já unitários/SDK.
Preservar timeouts, retries, isolamento e limites de cobertura.

Aceite exige ausência de conteúdo/chaves/descriptors nos recursos da campanha,
recibos mínimos seguros, uso/contador exatos, outra mesa/original intactos, acesso
revogado antes da limpeza e retomada sem origem/raiz. Índices, Storage real,
produção e manutenção Admin externa não são comprovados pelo emulador.
Implantação futura precisa atualizar guardas/escritores/regras conjuntamente antes
de habilitar exclusão. Este plano não autoriza merge/deploy ou exclusão real de
dados do operador durante a implementação.

## Fechamento local — 2026-10-18

Implementação, SDK, navegador, revisão e validate encerrados localmente. Prova
permanente própria permite encerrar controles antigos sem adotar a identidade ou
o checkpoint de um journal C4 diferente. A confirmação local conserva seu CAS
integral; rascunhos inválidos ou substituídos permanecem. Consultas e respostas
válidas notificam revogação antes desse CAS. Reabertura de diálogos tem proprietário
próprio, sem permitir que finally antigos prendam ou liberem a consulta nova.

Ver [entrega](../../../entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md) para
contagens, repetições afetadas e limitações. Após corrigir somente a expectativa
SDK antiga do Estúdio, CI e regras do próprio head `0006a66` passaram: validate
Node 22/24, auditoria, produção 7/7, doze shards visuais e agregador, regras 135/135.
Nenhuma implantação/exclusão real de
dados do operador foi executada.
