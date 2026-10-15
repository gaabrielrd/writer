# F2-07 B — Capturar aventura própria como base de campanha

**Estado:** contrato fechado para implementação após o fechamento local de A.
**Origem:** [campanhas e variantes](14-campanhas-e-variantes.md).
**Decisões do operador:** aventura completa e somente lore referenciado.

## Resultado e limites

Criar uma campanha privada com base imutável de uma aventura do próprio usuário.
Preparação incompleta não aparece como campanha pronta no Estúdio. O original
permanece intacto; alterar sua prosa depois não altera a base da mesa.

Capturar metadados autorais, partes, cenas, blocos, textos, planejamento, ordem,
audiências, ilustrações/alt/legendas, arcos, marcos, cronologia e referências.
Preservar cenas sem parte e arquivo com seus estados, sem compor itens arquivados.
Texto legado de parte, quando existir, permanece separado da composição por cenas.
Não copiar histórico, recuperação, checklist, metas, atividade, créditos ou recibos.

Somente IDs explícitos de scenes/references e narrativeLinks de lore entram na
união deduplicada. Confirmar a existência da cena/arco/marco/evento de origem.
A ficha deve pertencer ao universo próprio autorizado vinculado à aventura na
captura. Referência órfã fica indisponível; nunca resolver por nome/alias ou buscar
fichas transitivamente pelas relações. data-lore-id é decoração não persistida do
editor atual e não constitui uma terceira fonte de referências.

O resumo da criação explicará essa regra e o progresso real. Relações só projetam
alvos capturados e autorizados; se o alvo faltar, omitir a relação inteira, inclusive
ID, descrição e tipo. Não consultar o original para completar uma relação.

## Persistência, identidade e ativação

- users/{uid}/campaignPreparations/{captureId}: fingerprint, origem/token, fase,
  checkpoint, contagens e pedidos estáveis; sem cópia desnecessária de corpos.
- users/{uid}/campaignBases/{generationId}: manifesto e filhos/chunks privados,
  destino permanente desde o início. Estados preparing/ready/aborted/deleting.
- campaigns/{campaignId}: criado somente na ativação final, com procedência
  original, adventureId e activeBaseId. Vincular a geração pronta atomicamente.

IDs da campanha e geração são estáveis por criação; sourceKey identifica recurso
pela origem/tipo/ID, nunca pelo título. Bases prontas não são editáveis. Não mover
centenas de documentos na ativação nem criar root parcial visível. SDK direto
nega controle, corpos, manifesto, recibos e imagens; acesso passa pelo servidor.

Título até 300 e descrição até 4.000 caracteres são da campanha. Estado inicial
planning. O universo organizacional é escolha explícita, com o da aventura como
valor inicial; pode ser outro universo próprio ou null. Ele não altera a procedência.
Seu uso/contador entram apenas no commit final, com validação estrita de A.

## API fechada

| Operação                 | Contrato                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| getCampaignCaptureSource | adventureId; resumo e token autorizado, sem corpos                                                  |
| startCampaignCapture     | operationId, adventureId, expectedSourceToken, title, description, universeId; preparação estável   |
| getCampaignCapture       | captureId; estado/progresso para retomada autorizada                                                |
| listCampaignCaptures     | adventureId opcional, cursor, limit; preparações próprias pendentes para retomar noutro dispositivo |
| advanceCampaignCapture   | captureId, operationId, expectedCheckpoint; uma etapa limitada                                      |
| activateCampaignCapture  | captureId, operationId, expectedCheckpoint; cria campanha e ativa geração                           |
| cancelCampaignCapture    | captureId, operationId, expectedCheckpoint; revoga preparação e avança a limpeza retomável          |
| listCampaignBaseItems    | campaignId, kind, parentKey opcional, archive, cursor, limit; somente metadados                     |
| readCampaignBaseItem     | campaignId, sourceKey, cursor, limit; conteúdo autorizado em chunks                                 |
| readCampaignBaseImage    | campaignId, imageKey; mídia autenticada da identidade capturada                                     |

O cliente não informa owner, caminhos, contadores ou manifestos. Campos fechados,
autorização por pedido e recibos mínimos. Mesmo ID com outro payload falha; retry
não duplica corpos, fichas, campanha, universo ou uso de imagem. Replay reautoriza.
Ativação repetida não recria campanha removida nem retorna DTO antigo como revisão
atual. Estado concluído pode indicar o ID para navegação e GET autorizados.

### DTOs, filhos e checkpoints

CaptureSource contém adventureId, title, universeId, sourceToken e
loreSelection: referenced. Contagens ainda não verificadas são null. Não anunciar
deduplicação concluída antes da varredura. CaptureProgress contém captureId, state,
phase, checkpoint inteiro monotônico, processed, counts por tipo, sourceAvailable,
cleanupComplete,
campaignId|null e reason|null. Counts descrevem processados, sem percentual inventado.

Estados da preparação: preparing, prepared, activated, aborted, deleting, deleted.
Prepared é captura íntegra aguardando ativação. Fases: parts, scenes, blocks,
sceneReferences, arcs, milestones, events, narrativeLinks, lore, images,
finalizing, complete, cleanup. Checkpoint compara em transação e incrementa em cada
etapa confirmada; cursores internos limitados guardam o pai/posição correntes, sem
lista crescente de todos os IDs. Recibo associa operationId, fingerprint,
expectedCheckpoint e resultado mínimo. Concorrente com outro pedido no mesmo
checkpoint falha; mesmo pedido já confirmado não executa a etapa outra vez.

Get/retomada autoriza o dono da preparação, inclusive após perda da origem.
Advance detecta perda/mudança, persiste aborted e responde com motivo source-changed
ou source-unavailable, sem erro que reverta o estado. Após perda de autorização,
não devolver título/contagens derivados da origem, somente controle próprio.
Cancel repetido continua a próxima página de limpeza; cada página tem recibo e
checkpoint. Cancel em activated falha: excluir campanha pronta é outra operação.
Deleted implica cleanupComplete true. Ativação retorna kind: activated com Campaign
confirmada na primeira execução; replay retorna kind: already-activated e campaignId,
apenas enquanto a campanha ainda existir e pertencer ao usuário.

Filhos flat sob campaignBases/{generationId}: items/{sourceKey} para metadados,
bodies/{bodyKey} para campo/índice/conteúdo, loreReferences/{referenceKey} para
identidade canônica e disponibilidade e images/{imageKey} para identidade de mídia
e pin. Criar uma loreReference e incrementar seu total na mesma transação; várias
cenas/marcos nunca geram várias cópias da mesma ficha. Corpo e campos grandes ficam
fora dos metadados listáveis. Relações brutas ficam internas e nunca em chunks
transmitidos ao cliente; o servidor projeta apenas relações autorizadas.

Listagem retorna items e nextCursor, limitada também a 4 MiB, sem aliases, corpos
ou relações. Leitura retorna item autorizado, chunks [{index, content}], nextCursor
e projectionToken. Chunks correspondem só aos campos textuais projetados; campos
estruturados/relações passam pelo mesmo gate antes da resposta. Não transmitir
JSON bruto com relações que dependeriam de filtragem no navegador. Quando necessário,
remontar o recurso limitado no servidor antes de projetar/dividir a resposta.

Cursor fechado é vinculado a UID/campanha/geração ativa/tipo/pai/posição e token de
projeção; campos extras falham. ProjectionToken identifica a base e a projeção
autorizada atual. Mudança invalida páginas já compostas no cliente. Reautorizar
cada página e seus alvos de relações; item indisponível não entrega nome/alias/ID
de alvo removido. Janela sem itens disponíveis pode retornar vazia com nextCursor,
sem anunciar fim falso nem expor quais registros internos foram percorridos.

Kind é part, scene, block, arc, milestone, event ou lore. ParentKey omitido lista
o tipo em toda a base; null restringe às raízes/sem parte; string restringe ao
agrupador capturado correspondente. Archive é active (padrão), archived ou all;
esse filtro participa do cursor. Summaries têm sourceKey, kind, parentKey, title,
archived, orderKey e somente os metadados específicos necessários: stage de cena,
type/audience/role de bloco e dateLabel de evento. Principal é bloco role: main;
adicional é role: additional. Não duplicar seu corpo na captura: o manifesto do
principal pode apontar internamente para o corpo já capturado da cena.

Part pode ter manifesto de conteúdo legado, mostrado separadamente. Cada manifesto
público tem field, sha256, bytes e chunkCount; nenhum caminho/bodyKey Storage sai no
DTO. Leitura associa cada chunk a field e index e devolve metadados estruturados
projetados fora dos chunks. A UI verifica identidade, índice, UTF-8, bytes e hash
antes de mostrar o campo inteiro; relação nunca integra seu JSON bruto. Resumo e
páginas usam projeção vigente, sem contagens de lore indisponível. Item específico
indisponível não retorna título/corpo/aliases/relações.

ListCampaignCaptures pagina controles próprios em preparing/prepared/aborted/deleting,
25 por padrão e 50 no máximo, também limitado a 4 MiB. Filtra opcionalmente aventura;
cursor vincula UID/filtro/posição. Campos próprios do pedido e estado permitem
retomada sem depender do adaptador do dispositivo anterior, sem corpos derivados.
Get/list não mudam estado; cancel/advance/activate são as mutações explícitas.

O token inicial inclui snapshots precisos, com segundos/nanos, da aventura e do
universo, vínculo e revisões relevantes de cenas/narrativa/lore/privacidade.
Cada avanço e ativação comparam a mesma observação. Mudança aborta sem adotar
nova base; persistir aborted antes de responder, sem rollback por exceção na mesma
transação. A leitura de uma base pronta não compara esse token de conteúdo.

## Orçamentos e mídia

Metadados em páginas de 25, máximo 50, sem corpos. Processar um recurso com corpo
por transação, até 2 MiB de JSON preparado; chunks UTF-8 de 64 KiB, sem cortar
Unicode nem truncar conteúdo. Leitura padrão quatro chunks, máximo oito, resposta
até 4 MiB. Cursor só avança sobre recurso confirmado; tamanho incompatível produz
erro explícito, sem saltar o recurso. Validar hashes e contagens capturadas.

Uma imagem por etapa, metadados antes dos bytes, limite técnico de 16 MiB por
arquivo. Escrita de book-covers é exclusiva do servidor nas regras atuais; imagens
aceitas não têm edição de bytes no fluxo existente. Conservar o arquivo por uso
tipado campaign-base com geração e chave próprias; biblioteca não pode removê-lo
durante preparação/base pronta. A identidade capturada é imageId/path/generation,
sem usar updateTime da biblioteca, pois o próprio pin altera o contador.

Conferir geração/existência/estado antes e depois do I/O; alteração externa torna
a mídia indisponível, sem trocar silenciosamente os bytes. Retirar/trocar a imagem
no bloco original não altera a base. Não usar assets.save, URL permanente nem a
prévia viva da aventura. O leitor entrega derivado autenticado limitado, com
no-store, token da base e reautorização após I/O, sem caminho Storage no DTO.

## Autorização e ciclo de vida

Separar autorização vigente do token de captura: editar nome/prosa/lore original
normalmente não atualiza nem bloqueia snapshot pronto. Leitura exige campanha
própria, aventura original existente/own e não deleting. Lore também exige universo
original e ficha existentes/autorizados. Remoção ou perda de procedência não entrega
corpo, nome, alias ou relações antigas. A mesma regra vale para leitura/comparação
e variantes futuras, sem transformar conteúdo derivado em nota independente.

Nesta etapa own-only, mudança de privacyVersion pode ser reautorizada se o mesmo
UID continua dono integral. Não aplicar essa exceção a futuros grants, compras ou
participantes. Trocar o vínculo organizacional não troca essas origens.

Bases prontas ficam até exclusão explícita; cancelar/abortar prepara limpeza em
lotes com remoção de chunks e usos tipados. Revogar antes de limpar e tornar cada
passo retomável/idempotente. Sem TTL silencioso de conteúdo pronto. Exclusão integral
da campanha e substituição de base serão fechadas nas etapas seguintes de F2-07.
Limpeza autoriza o dono da preparação mesmo se a origem já sumiu; não pode depender
de ler seu corpo. Não recriar imagem/universo removidos para compensar contadores.

## Interface, execução e aceite

B1 implementa servidor/contratos, captura, ativação, leitura e limpeza de preparação,
com testes unitários e SDK real. B2 implementa serviço/adaptador/controlador, diálogo
de criação da aventura e leitor da base na campanha, usando interfaces públicas.
Apresentar progresso, resposta incerta, retomada/cancelamento, origem indisponível e
arquivo separado. Vincular respostas a UID/alvo/geração; sem cache derivado persistente.
Não reaproveitar o lore de livro com bookId fictício ou seus rótulos de publicação.
Estender o modelo/GET/listagem do Estúdio à procedência original suportada, sem
expor preparação parcial. Gestão de metadados de A preserva essa procedência e o
activeBaseId; indisponibilidade da origem não impede editar notas/metadados próprios.
Leitor da base aplica seu gate separado. Procedências de edição comprada continuam
recusadas até sua implementação autorizada na fase 4.

Antes do código de B1, A deve ter validate local e registro Git. Em B1 provar origem
mudando entre etapas, dois pedidos concorrentes, falha após pin, retomada/aborto,
ativação repetida, corpo grande/Unicode, composição/arquivo, referências órfãs,
relação externa, imagem trocada e conta errada. SDK prova negação direta e transação
de campanha/universo/usos. B2 prova criação→leitura de duas mesas independentes,
original preservado, reload/retry, troca de conta, teclado/320 px/três temas.

Variantes inteiras, comparação/atualização explícita e exclusão integral têm planos
posteriores; comércio, portal, sessões, IA e backup permanecem em tarefas próprias.
Testes dirigidos após ajustes, validate no fechamento, revisão, documentação e
evidência reais. CI acompanha em paralelo, sem merge/deploy presumidos.
