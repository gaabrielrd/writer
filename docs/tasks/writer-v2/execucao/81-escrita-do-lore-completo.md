# P1 / M38c3 — Escrita do lore completo

## Resultado exigido

Criar, editar e excluir lore de qualquer tamanho aceito pelo contrato portátil,
sem truncar, normalizar ou reenviar campos grandes intocados. Toda troca ativa
usa geração nova, CAS da origem observada, clock e privacidade atômicos. Relações
extensas recebem alterações delimitadas, não um request gigante. A etapa 3 do
[plano 80](80-consumidores-do-lore-completo.md) só termina com todos os passos.

## Constatações e decisão técnica

A base v1 agrupa campos num JSON imutável. Regravar a base inteira ao renomear
uma ficha reenviaria outros campos e pode ultrapassar o limite de transação.
Validar um campo JSON grande de uma vez também não atende o protocolo em unidades.

Preparar uma geração de edição com base anterior e substituições explícitas
por campo. O futuro descriptor v2 deve achatar as substituições: um ponteiro
por campo conhecido, sem cadeia de overlays crescente. Base anterior continua
autorizada até não ser mais necessária; ausência/remoção não equivale a vazio.
Datas lógicas têm overlay declarado, preservando createdAt existente e avançando
updatedAt no commit. Readers v1 permanecem compatíveis; readers v2 precisam ser
integrados antes do primeiro commit v2. Nenhum v2 é habilitado por esta etapa inicial.

Relações continuam em páginas de 64 e corpos em partes de 64 KiB. Copiar no
servidor os ponteiros das páginas intocadas; enviar só páginas alteradas, também
em partes quando seus textos forem grandes. Contagem/presença são explícitas.
Geração de relações pode ser conservada quando nenhuma relação mudou.

O upload não publica a ficha. Cada unidade exige dono/livro/encarnação/token da
origem e checkpoint/CAS/recibo; Merkle/SHA não são autorização. O selo privado
do campo só vem após UTF-8/JSON/domínio completos. A geração ativa muda somente
quando todos os campos/páginas necessários estiverem certificados no servidor.

## Sequência de implementação

1. M38c3a: validador incremental puro para os campos e página de relações,
   sem guardar prosa no checkpoint. Reutilizar a regra de IDs do schema portátil.
   Proteger Rules contra criação/alteração/remoção SDK de payloadStorage/stubs,
   inclusive ponteiro presente e inválido. Conservar CRUD inline/clock/privacidade.
2. Upload privado por campo: início por intenção imutável, manifesto calculado
   por escopo/operação, chunks com prova e hash/validação incrementais,
   recibos e selo. Registrar inventário/lease antes de qualquer byte; implementar
   cancelamento, fence permanente e cleanup limitado antes de habilitar produtor.
   Jobs/recibos não guardam prosa; checkpoints são privados e não grants.
3. Integrar geração v2 e readers, copiar páginas não alteradas por unidades e
   trocar cabeça por CAS. Conservar campos ausentes, valores literais, datas e
   referências; adotar leases, clock e revogação de publicação no mesmo commit.
   Replay confirma o evento próprio e não reaplica uma edição antiga.
   Resolver presença/isPublic/datas da fonte no servidor por leitura limitada
   antes da troca; não inferir privacidade pela ausência de campos no stub nem
   confiar na alegação do cliente para decidir revogação.
4. Criação/exclusão e coleta: reserva permanente impede recriação por replay;
   coletar só artefatos de origem nativa comprovada, sem referências ativas ou
   leases de preparação. Verificar a origem antes de cada delete, preservar
   recriados e manter fence/recibos sem corpo. Coordenar inventário do livro.
5. Cliente: diff por campo/página, upload limitado, montagem já existente e CAS
   congelado. Não normalizar campos intocados no resave. Pedidos incertos devem
   continuar descobríveis/confirmáveis; decidir recuperação do rascunho no
   contrato do host antes de mudar sua persistência.
6. Integrar todos os escritores Admin existentes e Rules conjuntamente, drenar
   versões antigas, testar Node/SDK/cliente/hosts e documentar cada incremento.
   Só depois considerar edição/exclusão entregues; validate integral no fim de P1.

## Escopo inicial M38c3a

Arquivos: novo bookLoreFieldValidation em functions/src, teste Node próprio,
firestore.rules e testes SDK de book-local-lore; check de sintaxe e documentação.
Sem callable, corpo novo, novo namespace, crédito, troca ativa, UI ou dependência.

O validador recebe no máximo 64 KiB por chamada e usa estado constante: sintaxe,
máscara de chaves, UTF-8 parcial e apenas ID/categoria/chave curtos. Suporta strings
arbitrariamente extensas, aliases, structuredDetails, isPublic/category e páginas
de relações com targetEntityId/relationType/description. Nenhum teto total de
8 MiB ou 128 partes. Não monta JSON inteiro nem usa checkpoint como autorização.

Aceites: fronteiras de UTF-8/escape/chaves/literais; JSON canônico; domínio igual
ao schema existente; ausente/vazio/duplicado preservados; erro/truncamento antes
do selo; estado sem prosa e sem crescimento com texto/quantidade de aliases.
SDK deve negar ponteiros/stubs mesmo com clock/revogação corretos, manter inline,
e continuar negando acesso a corpos. Um bloqueio de Rules não entrega o editor.

Etapas 2–6 e M38c/P1/F2-09/Writer V2 abertos. Somente commits locais, CI ignorada.

## Evidência de M38c3a

[Entrega](../../../entregas/2026-10-23-writer-v2-validacao-dos-campos-de-lore.md) e
[ADR 0093](../../../decisions/0093-streamed-lore-field-validation.md): 93 casos
Node e sete SDK distintos positivos. Controles positivos isolam os denies de
payload dos outros gates. Estado não guarda texto livre nem listas completas;
EOF continua sem valor de autorização/hash/selo. Nenhum produtor foi habilitado.
Próximo passo é o 2; o conjunto de escrita continua pendente.

## Execução do passo 2 — M38c3b

Implementar serviço interno bookLoreFieldUpload (start/get/append/seal/cancel/
cleanup), contratos, store e limpeza, sem callable ou cliente habilitado ainda.
Neste incremento a origem é uma ficha existente, inline ou payload, com
readToken observado. Criação por reserva e adoção da geração vêm nos passos 3/4.
Nenhuma alteração da ficha ativa, clock, privacidade, créditos ou publicação.

Registrar job sob users/uid/bookLoreFieldUploads e lease permanente sob
books/bookId/bookResourceLeases antes de gravar bytes. Inventário v1 enumera
chunks e header próprios por provas imutáveis. IDs derivam de UID/livro/lore/
upload/alvo/hash/Merkle; colisões ou chunks órfãos existentes impedem início.

Estados uploading, verifying, sealed, cancelling e cancelled. Uma chamada
append recebe uma parte de até 64 KiB, verifica Merkle, avança SHA e parser
incrementais e grava chunk/prova/estado/recibo/CAS atomicamente. Jobs/recibos
são metadata; o estado SHA privado separado pode conter buffer interno, nunca
é retornado e deve ser excluído no EOF/cancelamento. Sem teto de 8 MiB/128 partes.

Após SHA/EOF, verificar provas nativas dos chunks em lotes de até 16. O último
recibo de append fixa partSealBirth antes dessa varredura; só depois criar
header imutável. Leitores internos devem conferir esse limite além do header,
impedindo adotar parte recriada depois de já ter sido verificada. Esse ponteiro
interno não deve ser exposto ao navegador. Provas/recibos têm âncoras nativas
pareadas e vínculo com a identidade original do job/lease.

Reenvio confirma o recibo sem reaplicar bytes, inclusive depois de revogação
ou cancelamento. get também confirma somente metadata própria. Operações novas
append/seal reautorizam livro/lore/clock/encarnação em cada unidade. Cancelamento
usa intenção/hash próprios, cria fence mesmo antes do start e revoga a lease
antes da limpeza. Cleanup independe do acesso atual, mas preserva livro/artefato
recriado; usa metadata, no máximo 16 chunks por unidade e header por último.
Manter fences/recibos sem corpo após cancelar; recusar lease adotada.

Modificar generic reader somente com partSealBirth opcional e compatível,
adicionar módulo ao check e manter namespaces SDK negados. Testar estados,
rollback, replay/CAS, corrupção, revogação, cancel antes/durante/depois,
SHA/JSON inválidos, grandes campos, recriações e SDK real. Sem SDK global,
produção, deploy ou UI. Passos 3–6 e Writer V2 continuam pendentes.

## Evidência de M38c3b

[Entrega](../../../entregas/2026-10-23-writer-v2-upload-privado-dos-campos-de-lore.md)
e [ADR 0094](../../../decisions/0094-private-lore-field-uploads.md): 124 Node
distintos em três arquivos e três cenários SDK positivos, incluindo 141 partes,
retry concorrente real, revogação, barreira nativa e limpeza da tentativa.
Serviço interno do passo 2 validado para ficha existente; não há endpoint,
criação por reserva, adoção ou UI. Próximo passo é o 3, com readers v2 e troca
ativa certificada. Incorporar inventário à exclusão do livro antes do rollout.

O estado SHA privado separado pode conter buffer interno; nunca retorná-lo e
excluí-lo no EOF/cancelamento. Job e recibos ficam somente com metadata.
sealed/prepared informa evento, não disponibilidade física/grant atuais.

## Execução do passo 3a — M38c3c: readers da geração v2

Preparar o contrato e os leitores antes de produzir uma geração v2 ativa.
Arquivos previstos: novo bookLoreGenerationContracts.mjs; bookLoreStorageRead,
bookLoreRead/Contracts e check de Functions; bookLoreReadContracts/Client do
cliente; fixture e testes Node, Vitest integrado e SDK; ADR e documentação.

Storage v2 contém generationId, base v1 opcional, fields achatado dos sete
campos não relacionais (ponteiro selado ou null para remoção), dates autoritativas,
relations com generationId/sealBirth próprios e sealBirth da geração.
Campos name/category não podem ser removidos e devem existir quando não há base.
Nenhuma cadeia de overlays ou ponteiro físico chega ao navegador.
Ponteiros novos de campo/página carregam partSealBirth obrigatório; base v1 e
páginas antigas conservam contrato e origem anteriores. Segmentos novos usam
schemaVersion 2, sem relaxar a validação dos segmentos v1.

Cabeçalho de transporte v2 usa base opcional, fields de manifestos/remoções,
dates e relações públicas somente de contagem/presença. Seção field identifica
explicitamente o campo; as seções base/relations v1 permanecem compatíveis.
Cada unidade reautoriza o livro e o token nativo/clock antes de ler bytes,
abre o header da base e do corpo solicitado e valida nascimento, imutabilidade e
Merkle. Cada unidade lê somente um chunk, nunca todos os campos.
Datas do descriptor e stub devem coincidir; não inferir data pela base antiga.

Cliente verifica cada seção por SHA/UTF-8/JSON canônico, aplica somente campos
explícitos e remoções, datas/presença, relações e valida domínio completo.
Confere novamente o cabeçalho/token no final; não retorna ficha parcial.
Conservar limites de 64 KiB e concorrência quatro, sem teto total menor.

Aceites: base grande intocada, campo grande acima de 8 MiB/128 partes,
ausência/vazio/false/duplicatas, criação lógica sem base, datas ausentes,
relações da geração anterior e novas páginas com cutoff, contexto revogado,
recriação de header/parte/segmento, descriptor inválido e transporte corrompido.
SDK deve provar nascimento/partSealBirth e revogação reais. Não há produtor,
adoção/CAS, ativação de restauração, UI, deploy ou nova dependência nesta etapa.
Depois implementar adoção certificada com inventário/leases e resolver
privacidade/datas por leitura limitada no servidor; passos 3b–6 seguem abertos.

## Evidência do passo 3a — M38c3c

[Entrega](../../../entregas/2026-10-23-writer-v2-leitura-das-geracoes-de-lore.md)
e [ADR 0095](../../../decisions/0095-flat-lore-generation-readers.md):
72 Node, 85 Vitest e três SDK distintos positivos. Storage e transporte v2,
leitores e montagem cliente preparados, com base/campo grandes, datas/remoções,
relações independentes e prova nativa por unidade. Nenhum produtor foi habilitado.

Próximo incremento do passo 3: resolver metadata lógica da origem no servidor
por unidades e implementar a adoção certificada, CAS/leases/privacidade/clock.
Criação/exclusão/GC, inventário do livro, cliente de escrita e integração Admin
seguem obrigatórios. Conclusão do passo 3 e de P1/F2-09/V2 continua pendente.

## Execução do passo 3b — M38c3d: metadata lógica da origem

Antes de adotar uma edição, resolver privacidade/datas/presença da fonte no
servidor, inclusive quando a base excede 8 MiB. Não inferir pelo stub v1 nem
aceitar alegação do cliente. Arquivos previstos: prefixo no validador de campo,
novo indexador da base, serviço/store/contratos da inspeção privada, fixture e
testes Node/SDK, Rules do namespace, check e documentação.

O indexador puro processa até 64 KiB por unidade, reutiliza domínio/UTF-8/JSON
canônico dos campos e valida bookId/datas. Estado limita-se a sintaxe,
presença/offsets, ID esperado e pequenos valores de controle, sem prosa.
Base v1 exige seus campos/datas; o resultado não é autorização nem prova SHA.

Serviço interno começa por bookId/loreId/sourceToken, cria job privado e estado
SHA separado, e lê a origem autorizada por unidade. Nunca recebe bytes,
isPublic ou datas do cliente. Jobs/progresso/recibos não guardam prosa; estado
SHA pode conter buffer e é excluído no EOF/cancelamento. V1 lê e confere toda
a base. V2 aplica presença/datas declaradas e lê isPublic substituído numa
unidade própria; inline usa a projeção validada, limitada pelo documento nativo.
Relações ficam somente com contagem/presença; isso não certifica suas páginas.

CAS e recibos/âncoras nativas vinculam cada unidade ao job original. Reenvio
confirma evento próprio, sem reexecutar a fonte; avanço novo sempre reautoriza.
Cancelamento mantém fence permanente e pode ocorrer sem acesso atual à origem,
inclusive antes de começar. Certificado final permanece metadata histórica;
abertura interna exige origem atual e prova nativa. Não concede leitura de
conteúdo nem comprova disponibilidade física de todas as partes/páginas agora.

Aceites: base acima de 8 MiB/128 partes, campos em todas as fronteiras, datas e
presença literais, base v1/v2 e inline, override/remoção de isPublic, SHA/JSON
inválido, corrupção nativa, retry/rollback/CAS, revogação e cancelamento.
Namespace SDK permanece negado e não haverá callable, UI ou adoção neste
incremento. Próximo: consumir a inspeção na adoção CAS com leases/clock/
privacidade e inventário; criação/exclusão/GC e cliente continuam pendentes.

## Evidência do passo 3b — M38c3d

[Entrega](../../../entregas/2026-10-23-writer-v2-inspecao-da-origem-do-lore.md)
e [ADR 0096](../../../decisions/0096-private-lore-source-inspection.md):
205 Node distintos e quatro SDK positivos. Inspeção privada calcula metadata
lógica da origem por unidades, sem receber valores do cliente, com validação,
SHA, provas nativas e cancelamento. Fonte/clock permanecem intactos.

Ranges identificam a base original; não são índice dos campos v2 substituídos.
Certificado ready não comprova disponibilidade atual de todos os corpos/páginas
e não concede leitura. Consumir a abertura interna na futura adoção com provas,
leases/inventário e CAS/clock/privacidade atômicos. Criação/exclusão/GC e cliente
seguem pendentes; passo 3 completo e P1/F2-09/V2 continuam abertos.

## Dependência de adoção — M38c3e

A inspeção de metadata está pronta, mas a limpeza atual de livros não cobre
corpos/segmentos/leases de lore. O [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md)
prepara inventário, reserva e coleta antes de habilitar troca ativa.
Seu núcleo de fontes passou em 102 Node e quatro SDK distintos, conforme a
[entrega](../../../entregas/2026-10-23-writer-v2-alcance-e-coleta-do-lore.md).

Adoção completa permanece pendente: reservar uploads em preparing, certificar
campos/páginas, coordenar leases e trocar cabeça/clock/privacidade/recibo juntos.
Materialização inline, criação/exclusão e integração cliente/writers continuam
obrigatórias. Nenhuma etapa de P1/F2-09/V2 foi encerrada por esse pré-requisito.

## Reserva privada — M38c3f

O [plano 83](83-reserva-dos-uploads-de-lore.md) ligou uploads selados à geração
preparing com cancelamento/coleta coordenados e provas nativas. Fonte,
clock e publicação permanecem intactos. [Evidência](../../../entregas/2026-10-23-writer-v2-reserva-dos-uploads-de-lore.md):
113 Node e cinco SDK distintos positivos, em rodadas dirigidas.

Agora falta compilar campos/páginas, materializar inline e ligar as referências;
adotar leases/cabeça/clock/privacidade/recibo atomicamente; integrar exclusão e
demais writers/cliente. Nenhum endpoint/UI/ativação foi habilitado.

## Composição em payload — M38c3g

O [plano 84](84-composicao-das-geracoes-de-lore.md) compõe e audita fonte v1/v2
com base/campos achatados e diff de páginas, sem mutar a origem.
[Evidência](../../../entregas/2026-10-23-writer-v2-composicao-das-geracoes-de-lore.md):
69 Node e três SDK distintos positivos.

Materialização inline ainda obrigatória antes de concluir a preparação completa;
adoção, leases adopted, exclusão, consumidores e cliente continuam pendentes.

## Materialização inline — M38c3h

[Plano 85](85-materializacao-das-fichas-inline.md) integrou campos/páginas
herdados de inline ao compositor, por uploads privados e cleanup coordenado
de filhos ainda não reservados.
[Evidência](../../../entregas/2026-10-23-writer-v2-materializacao-das-fichas-inline.md):
134 Node e três SDK distintos positivos em rodadas dirigidas.

Preparação agora cobre inline/payload; adoção CAS, leases adopted, exclusão,
demais writers/consumidores/backup/cliente ainda seguem pendentes.
