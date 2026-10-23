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
