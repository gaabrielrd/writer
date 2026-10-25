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

## Adoção interna — M38c3i

[Plano 86](86-adocao-atomica-das-geracoes-de-lore.md) implementou CAS de cabeça/
geração/leases lógicas/clock/privacidade/recibo, com consentimento explícito,
segunda edição real e aposentadoria/coleta por prova nativa.
[Evidência](../../../entregas/2026-10-23-writer-v2-adocao-atomica-das-geracoes-de-lore.md):
277 Node e três SDK distintos positivos.

Criação/exclusão, inventário do livro e todos os writers/consumidores/backup/
cliente ainda obrigatórios antes do rollout. Nenhum endpoint/UI habilitado.

## Exclusão do livro — M38c3j

O [plano 87](87-exclusao-dos-recursos-de-lore-do-livro.md) integra preparações
e recursos de lore ao inventário v3 de exclusão do livro. Controles/leases/
recibos permanecem fences; cliente reconhece hasLoreResources.

Criação/exclusão individual e roteamento de preparações ainda sem a marca
continuam obrigatórios antes de habilitar uploads/escrita ao cliente. Demais
writers/consumidores/backup/cliente e rollout mantêm M38c/P1/F2-09/V2 abertos.

## Exclusão individual — M38c3k

O [plano 88](88-exclusao-individual-do-lore-completo.md) implementa a retirada
e limpeza internas por ficha: inspeção/CAS, clock/privacidade e tombstone
atômicos, cleanup limitado e handoff nativo para o inventário do livro.
[Evidência](../../../entregas/2026-10-24-writer-v2-exclusao-individual-do-lore-completo.md):
303 Node e cinco SDK distintos positivos.

Criação por reserva e integração completa de writers/consumidores/backup/
cliente continuam obrigatórias. Não habilitar o editor/endpoint ainda.
M38c/P1/F2-09/V2 permanecem abertos.

## Reserva de criação — M38c3l L1

O [plano 89](89-criacao-do-lore-por-reserva-permanente.md) implementa somente
a reserva vazia, cancelamento/fences e integração à exclusão do livro.
[Evidência](../../../entregas/2026-10-24-writer-v2-reserva-permanente-da-criacao-de-lore.md):
336 Node e três SDK distintos positivos.

Criação completa exige L2 com uploads/inventário/cancelamento de filhos antes
de gravar bytes, e L3 com composição/auditoria/ativação/sucesso histórico.
Nenhuma cabeça ou endpoint/UI de criação foi habilitado. Demais writers/
consumidores/backup/cliente e P1/F2-09/V2 permanecem pendentes.

## Uploads da criação — M38c3m / L2

[Plano 90](90-uploads-vinculados-a-criacao-de-lore.md) prepara campos/páginas
pela reserva nativa, sem cabeça existente, e amplia o cancelamento antes de
habilitar esses bytes. [Evidência](../../../entregas/2026-10-24-writer-v2-uploads-vinculados-a-criacao-de-lore.md):
294 Node e quatro SDK distintos positivos.

L3 deve integrar tentativas/filhos reserved ao cleanup, compor/auditar sem base
e ativar cabeça/geração/leases/clock/datas/recibo atomicamente, preservando sucesso
histórico. Criação completa e integrações de writers/consumidores/backup/cliente
continuam pendentes. M38c/P1/F2-09/V2 abertos.

## Composição da criação — M38c3n / L3A

[Plano 91](91-composicao-do-lore-a-partir-da-reserva.md) amplia cancelamento
de tentativas/filhos reserved antes de compor sem base. Origem creation
não usa cabeça/inspeção fictícias e o inventário distingue sua procedência.

Próximo L3B: ativação atômica e prova histórica do criador, com reader,
segunda edição, retirada e exclusão do livro preservando sucesso.
Adoção creation segue bloqueada, sem endpoint/UI. Demais integrações e
M38c/P1/F2-09/V2 permanecem abertos.

## Ativação da criação — M38c3o / L3B

[Plano 92](92-ativacao-atomica-da-criacao-de-lore.md) confirma cabeça/geração/
leases lógicas/clock/datas/recibo/criador atomicamente. Reader reconhece
nascimento original; reedição/retirada/exclusão preservam sucesso histórico.
L1/L2/L3A/L3B cobrem a criação interna, sem endpoint/UI expostos.

Próximo obrigatório: integrar os demais escritores Admin/regras e roteamento
das preparações sem flag, depois consumidores/backup/cliente/recuperação e
rollout coordenado. Criação na interface e o conjunto M38c/P1/F2-09/V2
continuam pendentes. Validate integral no fechamento de P1.

## Roteamento da exclusão sem marca — M38c3p

[Plano 93](93-roteamento-integral-da-exclusao-de-livros.md) elimina a decisão
cliente por flags: todo livro é finalizado pelo protocolo servidor. SDK não
remove raiz nem grava deletedBooks. Backend descobre preparações privadas
sem marca e conserva checkpoint/controles. A pendência de roteamento do plano 87
foi coberta; rollout conjunto/drenagem continuam obrigatórios.

Próximo: demais escritores Admin/regras, consumidores/backup/cliente e
certificação/ativação de P1. Outros namespaces de exclusão ainda exigem
auditoria própria. M38c/P1/F2-09/V2 permanecem abertos.

## Pré-requisito do writer de análise — M38c4a / A1

[Plano 94](94-leitura-logica-da-analise-de-lore.md) substitui leitura de stubs
por contexto lógico e budgets explícitos; respostas e reutilização de corpo
revalidam origem nativa. Apply não adiciona campos inline a uma cabeça payload
e preserva atomicidade ao recusar lote misto antes de débito.

54 Node e seis SDK positivos. Próximo A2 exige preparar campos/gerações e
adotar os até 50 itens com crédito/recibo no mesmo commit, sem perder campos/
relações intocados. Não declarar writer payload entregue por esta guarda.
Demais escritores/consumidores/backup/cliente e M38c/P1/F2-09/V2 abertos.

## Cliente manual — M38c5a/M38c5b/M38c5c

Capture/diff/codec e coordenação por unidade já têm integração privada de RPC
pelo [plano 101](101-transporte-autenticado-da-edicao-de-lore.md).
Callable bookLoreEdit limita métodos/IDs/filhos manuais e usa UID autenticado;
sessão regional preserva conta/contexto, pedido/CAS/bytes e cleanup independente.
SDK real em Chromium percorre HTTP no harness local, com dados fictícios.

Passo 5 continua aberto: host visual e recuperação protegida após recarga
ainda precisam ser integrados. Criar/excluir/análise no cliente, demais
escritores/consumidores/backup e rollout conjunto também permanecem necessários.
Exportação de endpoint não habilita implantação; P1/F2-09/V2 continuam abertos.

## Recuperação protegida — M38c5d

Operador aprovou a cópia cifrada no dispositivo para edição manual. O
[plano 102](102-reserva-e-chave-da-recuperacao-do-lore.md) implementa reserva/
prova/chave servidor e reautorização da mesma encarnação, sem rebase.
Metadata/fence/revogação e HTTP/Rules passaram em Node e SDK nativos.

Passo 5 segue aberto: journal cifrado por partes, checkpoints/retomada,
Web Locks/IDB, descoberta dos pedidos incertos e host visual ainda necessários.
Chave não pode ser persistida no navegador; revogá-la não cancela filhos.
Ciclo de vida integrado e demais integrações/rollout continuam pendentes.

## Journal local — M38c5e

[Plano 103](103-journal-cifrado-das-edicoes-de-lore.md) implementa descoberta
e armazenamento cifrado por partes, chave fresca, CAS/oncomplete e recuperação
literal/de pedido exato após recarga. Cleanup/diagnóstico metadata não exigem
chave. 51 Vitest distintos e quatro cenários Chromium positivos; último selo
local abortado pode ser concluído depois de validar bytes/intenção/origem.

Passo 5 continua aberto: snapshot do coordenador não é checkpoint restaurável.
Persistir/reconstruir cursores e controles de todos os jobs e compor reserva/
journal/host são os próximos passos. Sem integração automática na edição visual,
fechamento/coleta local ou ciclo de vida da chave na exclusão do livro.
Demais writers/consumidores/backup/ativação/rollout e P1/F2-09/V2 abertos.

## Checkpoints e reconstrução — M38c5f

[Plano 104](104-checkpoints-restauraveis-da-edicao-de-lore.md) acrescenta
checkpoint privado distinto do status e restore validado com controles
paginados. Cursores, pedidos exatos e callbacks de reconciliação sobrevivem
à reconstrução; sessão Auth força UID e guards, sem RPC inicial.

143 Vitest distintos e dois cenários Chromium positivos em rodadas.
Passo 5 continua aberto: ligar checkpoints ao journal cifrado/atômico e
controles completos de cleanup sem chave, depois compor reserva/host.
Fechamento/coleta/ciclo de vida, demais writers/consumidores/backup/ativação/
rollout e P1/F2-09/V2 seguem necessários. Sem recuperação visual anunciada.

## Checkpoints no journal — M38c5g

[Plano 105](105-persistencia-cifrada-dos-checkpoints-de-lore.md) persiste
root/páginas em gerações cifradas, com swap/acks atômicos e coleta limitada.
Reload recompõe operação sem depender de checkpoint na memória externa;
cancel monotônico e contexto são preservados. 50 Vitest distintos e dois
cenários Chromium positivos em rodadas.

Passo 5 segue aberto: compor write-ahead/acks automáticos e controles de todos
os jobs metadata sem chave, reserva/host e fechamento nativo antes de descarte.
Ciclo de vida da chave, demais writers/consumidores/backup/ativação/rollout
e P1/F2-09/V2 continuam pendentes; validate integral no fechamento de P1.

## Controles e cleanup sem chave — M38c5h

[Plano 106](106-controles-e-cancelamento-de-lore-sem-chave.md) persiste mapa
paginado completo e worker metadata com pedido exato antes de RPC.
Reconcilia pai/filhos/inspeção ou confirma adoção própria, sem chave/decrypt,
com guarda de conta e preservação de draft/produtor incerto/recibos.
114 Vitest distintos e dois cenários Chromium positivos em rodadas.

Passo 5 segue aberto: composição automática de write-ahead/acks, reserva e
host ainda precisa integrar as APIs; não habilitar legado sem mapa como
recuperável. Descarte/ciclo de vida, demais writers/consumidores/backup/
ativação/rollout e P1/F2-09/V2 continuam necessários.

## Coordenador persistido — M38c5i

[Plano 107](107-coordenador-persistido-da-edicao-de-lore.md) compõe core,
journal e port com checkpoint antes de RPC, resultado metadata sem prosa,
swap/ACK atômicos e recuperação automática; cancela sem depender de chave
ou produtor pendente. Antecessora é preservada no retry corrompido.
Bootstrap e host visual/ciclo de vida integrado seguem próximos; demais
writers/consumidores/backup/ativação/rollout e P1/F2-09/V2 seguem abertos.

## Reserva descobrível e liberação explícita — M38c5j

[Plano 108](108-reserva-descobrivel-e-encerramento-da-edicao-de-lore.md)
compõe reserva nativa/journal/controller pela sessão Auth, com ticket metadata
antes de reserve e descoberta após resposta perdida. IDB v2 mantém cópias v1.
Cancel conserva chave e rascunho; liberação explícita fecha jobs antes de
revogar. Sem texto inventado se a primeira cópia ainda não confirmou.
Host visual/purga local/ciclo de exclusão da chave e demais writers/Rules/
consumidores/backup/ativação/rollout seguem pendentes; P1/F2-09/V2 abertos.

## Host literal e descarte local — M38c5k

[Plano 109](109-interface-e-descarte-da-edicao-manual-de-lore.md) implementa
componentes reais de edição/recuperação e purga explícita após jobs/chave,
com batches/fence/tombstone. Texto e presença intocados são preservados;
cancel mantém cópia, apply e descarte exigem cliques próprios.
Entrada produtora permanece pendente do passo 6: writers Admin/Rules e
drenagem coordenados. Depois integrar ao compêndio; não habilitar v2 antes.
Ciclo da chave na exclusão, consumidores/backup/ativação/rollout e P1/F2-09/V2
continuam abertos; validate integral no fechamento de P1.

## Matriz de escritores inspecionados — M38c5l

| Caminho                                   | Comportamento após a barreira                                                                              | Evidência e pendência                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| SDK antigo e loreService local            | Nega mutação inline e payload com hasLoreResources true/inválido; false/ausente conserva legado            | Rules/cliente dirigidos; entrada nativa no compêndio ainda pendente              |
| applyLoreAnalysis legado                  | Lote com qualquer destino local é recusado antes de write/débito; recibo já aplicado permanece confirmável | Node e SDK de análise; não é migração automática do pedido                       |
| Aplicação nativa preparada da análise     | Continua por grants/adoption batch e troca atômica, sem rota legada de escape                              | Node e SDK nativos; orquestração visual da análise ainda própria                 |
| bookLoreCreation / EditAdoption / Removal | Servidor fixa marcador permanentemente; criação o faz na reserva, antes de corpos                          | Contratos existentes inspecionados; este incremento não recertifica todo o ciclo |
| assistedBook                              | Somente livro novo com tx.create; raiz preexistente impede sobrescrita e cobrança                          | Regressão Node adicionada; budgets pertencem à proposta gerada                   |
| bookRestoreLore / Artifacts               | Materialização privada pela reserva/artefatos de restore                                                   | Inspecionada, sem alteração ou certificação/ativação neste incremento            |
| universes                                 | Escrita global autorizada separada do livro                                                                | Regressões global-only preservadas; não recebe grant local implícito             |

A barreira é preparada para implantação coordenada. Não significa drenagem
real, integração de todos os consumidores, editor ativado ou CRUD entregue.
Faltam entradas nativas de criação/exclusão, orquestração dos demais writers,
ciclo de chaves na exclusão do livro, contextos/publicação/backup completos,
rollout e validate de P1. Ver [plano 110](110-coordenacao-dos-escritores-legados-de-lore.md)
e [ADR 0125](../../../decisions/0125-legacy-lore-writer-barrier.md).

## Criação manual — transporte e recuperação / M38c5m

[Plano 111](111-transporte-e-recuperacao-da-criacao-de-lore.md) e
[ADR 0126](../../../decisions/0126-manual-lore-creation-recovery-origin.md):
quatro operações do criador na callable existente e referência manual em
uploads/composição. Chave se vincula à reserva original antes de existir ficha;
após adoção exige nascimento original da cabeça. Cancel conserva draft/chave
já existentes sem novo upload. Journal anterior mantém sua lista de 18 métodos.

143 testes distintos positivos (32 novos), incluindo cinco SDK; ver a
[entrega](../../../entregas/2026-10-24-writer-v2-transporte-e-recuperacao-da-criacao-de-lore.md).
Isto amplia os caminhos de servidor da matriz M38c5l, sem certificar todos
os writers/consumidores. Próximo é coordenar criação no cliente com ticket
descobrível e recuperação cifrada antes de qualquer produção. Entradas nativas
no compêndio, exclusão/ciclo de chaves, demais consumidores/backup/rollout e
validate de P1 continuam obrigatórios. P1/F2-09/V2 e fases restantes abertos.

## Coordenador cliente da criação — M38c5n

[Plano 112](112-coordenador-cliente-da-criacao-de-lore.md) e
[ADR 0127](../../../decisions/0127-client-native-lore-creation-coordinator.md):
criação por unidades com dados congelados, ready sem cabeça, apply explícito,
checkpoint privado restaurável e controles até 50. Cancel usa a reserva
nativa sem esperar produtor e confirma adoção própria por metadata.
Conflito preserva controles/texto e não autoriza liberar chave ou purgar.

209 Vitest positivos (50 novos), com campos grandes e relações paginadas;
[evidência](../../../entregas/2026-10-24-writer-v2-coordenador-cliente-da-criacao-de-lore.md).
Sessão Auth compõe o port, sem fallback SDK. Não há persistência automática
da criação ou entrada nova no compêndio. Ticket antes de RPC, chave/cópia cifrada,
checkpoint durável, cancel/descarte/host e demais portões continuam obrigatórios.
P1/F2-09/V2 e fases restantes abertos; validate integral no fechamento de P1.

## Preparação protegida da criação — M38c5o

[Plano 113](113-preparacao-e-copia-protegida-da-criacao-de-lore.md) e
[ADR 0128](../../../decisions/0128-protected-lore-creation-preparation.md):
ticket metadata antes de RPC, chave/cópia cifrada imutável, IDB v3 aditivo e
cancel/release/descarte limitados. Hash pode aguardar o input sem bloquear
cancel; reserva perdida é retomada sem outra intenção nem rascunho inventado.
Sessão Auth captura actor/host e compartilha provider HTTP da chave.

221 Vitest e quatro jornadas Chromium positivos; veja a
[evidência](../../../entregas/2026-10-24-writer-v2-preparacao-protegida-da-criacao-de-lore.md).
Cópia inicial não persiste checkpoint produtor: próxima integração precisa
write-ahead privado, controles e ponte de resultado antes de advance/apply.
Host/entrada no compêndio, exclusão/lifecycle, outros writers/consumidores/
backup/rollout e validate integral de P1 continuam pendentes. P1/F2-09/V2,
fases 3–5 e gates humanos/comerciais abertos; sem envio remoto.

## Checkpoint protegido da criação — M38c5p

[Plano 114](114-checkpoint-protegido-da-criacao-de-lore.md) e
[ADR 0129](../../../decisions/0129-protected-lore-creation-checkpoints.md):
checkpointJournal na preparação mantém gerações cifradas e controles até 50,
ponte de resultado sem prosa e swap/ACK/coleta atômicos. Purge inclui inventário
fixo de checkpoints, preservando draft/active/alheios conforme a operação.
Reabrir exige input/grant originais e validação do core, sem RPC de edição.

250 Vitest distintos em rodadas e quatro jornadas Chromium positivos;
[evidência](../../../entregas/2026-10-24-writer-v2-checkpoint-protegido-da-criacao-de-lore.md).
Armazenamento não conclui o executor: ainda compor advance/apply, bloqueio por
dívida local e confirmação nativa de adoção própria no encerramento. Host,
exclusão/lifecycle, consumidores/backup/rollout e validate integral de P1
seguem obrigatórios. P1/F2-09/V2 e fases/gates restantes abertos.

## Executor durável da criação — M38c5q

[Plano 115](115-executor-duravel-da-criacao-de-lore.md) e
[ADR 0130](../../../decisions/0130-durable-lore-creation-executor.md):
createLore/resumeLoreCreation compõem preparação/checkpoint/core no mesmo
handle Auth, confirmando wire e resultado sem novo produtor com dívida local.
Ready conserva cabeça ausente e apply permanece explícito. Prova metadata
correlaciona pai/edição/hash/token/geração e evento antes de fechar recuperação
aplicada, inclusive sem chave e com resposta retida.

274 Vitest distintos positivos em rodadas (24 novos), cinco jornadas Chromium e
[evidência](../../../entregas/2026-10-24-writer-v2-executor-duravel-da-criacao-de-lore.md).
Host/criação visual e exclusão nativa do cliente precedem entrada no compêndio.
Lifecycle, demais writers/consumidores/backup/rollout e validate de P1 continuam
pendentes. P1/F2-09/V2/fases 3–5 e gates humanos/comerciais abertos.

## Interface da criação protegida — M38c5r

[Plano 116](116-interface-da-criacao-protegida-de-lore.md) e
[ADR 0131](../../../decisions/0131-protected-lore-creation-ui.md):
host e lista exportados usam executor Auth, dados literais e confirmação
distinta de preparar/criar. Ticket confere conta/livro antes de retomar;
listar não abre prosa. Cancel/discard não esperam chave/produtor e preservam
ficha aplicada; navegação/foco e perfil/actor protegidos.

77 Vitest distintos positivos em rodadas e três jornadas Chromium; veja a
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-criacao-protegida-de-lore.md).
Entrada no compêndio permanece pendente da exclusão nativa do cliente e
composição coordenada. Lifecycle, demais writers/consumidores/backup/rollout
e validate de P1 seguem necessários. P1/F2-09/V2/fases/gates restantes abertos.

## Transporte autenticado da retirada — M38c5s

[Plano 117](117-transporte-autenticado-da-retirada-de-lore.md) e
[ADR 0132](../../../decisions/0132-authenticated-lore-removal-transport.md):
bookLoreRemoval fecha sete métodos/IDs próprios e preserva edição/journals.
Sessão Auth consulta metadata sem prosa e congela wire sem retry.

168 casos distintos positivos, incluindo dois SDK reais em emulador;
[evidência](../../../entregas/2026-10-24-writer-v2-transporte-da-retirada-de-lore.md).
Journal/executor recuperável e confirmação visual precedem compêndio.
Lifecycle/consumidores/backup/rollout/validate integral e demais gates abertos.

## Retirada recuperável — M38c5t

[Plano 118](118-retirada-recuperavel-de-lore.md) e
[ADR 0133](../../../decisions/0133-recoverable-lore-removal.md):
createRemoval/resumeRemoval/recoveries compõem journal metadata próprio e
executor Auth. Wire durável antes da RPC, apply explícito, cancel independente
e consulta do evento original. ACK tardio não reabre produtor nem desfaz retirada.

43 Vitest positivos e três jornadas Chromium, com cinco stores antigos
preservados; [evidência](../../../entregas/2026-10-24-writer-v2-retirada-recuperavel-de-lore.md).
Próximo: confirmação/listagem visual e compêndio. Lifecycle, consumidores/
backup/rollout/validate integral e demais fases/gates permanecem abertos.

## Interface da retirada recuperável — M38c5u

[Plano 119](119-interface-da-retirada-recuperavel-de-lore.md) e
[ADR 0134](../../../decisions/0134-recoverable-lore-removal-ui.md):
host/lista exportados com revisão C1 e confirmação, prova própria, dívida
e cancelamento independente. Nenhum reenvio ao abrir/verificar; callback único.

67 Vitest distintos positivos e quatro jornadas Chromium; veja a
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-retirada-recuperavel-de-lore.md).
Antes do compêndio, adaptar também visibilidade/exclusão em lote por captura
e revisão nativas. Lifecycle/consumidores/backup/rollout/validate e demais
fases/gates permanecem abertos. Sem CI/envio remoto/deploy.

## Unidade de retirada conjunta — M38c5v

[Plano 120](120-retirada-conjunta-de-lore.md) e
[ADR 0135](../../../decisions/0135-atomic-lore-removal-batches.md):
retirada conjunta interna por origem/inspeção original, um clock/privacidade
e prova de nascimento comum. Token observado fica fixado no histórico;
recibos singulares não comprovam grupo.

103 casos distintos positivos em rodadas, incluindo cinco SDK; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-retirada-conjunta-de-lore.md).
Coordenador da seleção completa e orçamento das unidades precedem
transporte/recuperação/UI/compêndio. Limite transacional não limita autoria.
Lifecycle/consumidores/backup/rollout/validate e demais fases/gates abertos.

## Origem independente por ficha — M38c5w

[Plano 121](121-origem-independente-por-ficha-de-lore.md) e
[ADR 0136](../../../decisions/0136-independent-book-lore-source-tokens.md):
opção tokenVersion 2 fixa nascimento do livro e identidade nativa da ficha,
conservando origens intactas ao alterar outra ficha. Default v1/pedidos/
journals continuam exatos; não promover nem recapturar após aprovação.
Coleção ainda depende do clock global e verifica começo/fim.

601 casos distintos positivos em rodadas (38 novos), três SDK e seleção
com 53 origens; [evidência](../../../entregas/2026-10-25-writer-v2-origem-independente-de-lore.md).
Cliente/sessão Auth oferecem opção, sem migrar consumidores ou ativar UI.
Próximo coordenador deve fixar seleção/progresso/controle duráveis, preservar
conflitos individuais e não inferir atomicidade conjunta de sucessos isolados.
Compêndio/lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/
gates permanecem abertos. Sem CI/envio remoto/deploy.

## Seleção durável para retirada — M38c5x

[Plano 122](122-selecao-duravel-para-retirada-de-lore.md) e
[ADR 0137](../../../decisions/0137-durable-book-lore-removal-selection.md):
manifesto/páginas metadata e executor compõem retiradas individuais com origem
original, prova fresca e cancel independente de produtor retido. Não há teto
total de 50 nem alegação de grupo atômico; coleta continua protocolo próprio.
Resultado local salvo não substitui confirmação nativa.

70 Vitest positivos (31 novos), quatro jornadas Chromium reais de IDB/
reinício/concorrência e [evidência](../../../entregas/2026-10-25-writer-v2-selecao-duravel-de-retirada-de-lore.md).
Cliente/sessão Auth exportados sem UI montada. Próximo: seleção/retomada visual,
visibilidade nativa e composição final, preservando todas as ações existentes.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates seguem
abertos. Somente commit local, sem CI/envio remoto/deploy.

## Interface da retirada de seleção — M38c5y

[Plano 123](123-interface-da-retirada-de-selecao.md) e
[ADR 0138](../../../decisions/0138-book-lore-removal-selection-ui.md):
host/lista exportados compõem coordenador, revisão C1 v2 e confirmação.
Nomes só em RAM, origens fixas, retry explícito, dívida/cancel/driver tardio
protegidos. Callback exige todos os resultados conferidos e retorna somente
IDs retirados, sem inferir grupo atômico ou coleta de bytes.

65 Vitest positivos (34 novos), quatro jornadas Chromium/retake de teclado,
três temas/mobile/foco e [evidência](../../../entregas/2026-10-25-writer-v2-interface-da-retirada-de-selecao.md).
Sem montagem no compêndio: visibilidade nativa em lote e composição completa
continuam necessárias, sem remover ações existentes. Lifecycle/consumidores/
backup/rollout/validate de P1 e demais fases/gates seguem abertos.
Somente commit local, sem CI/envio remoto/deploy.

## Consulta do aceite original manual — M38c5z

[Plano 124](124-consulta-do-aceite-original-da-edicao.md) e
[ADR 0139](../../../decisions/0139-book-lore-edit-original-outcome.md):
consulta metadata separada confirma o recibo/evento originais sem reenviar
apply, decrypt ou fonte atual. Identidade manual derivada, escopo e tokens
fixos; ausência nunca autoriza replay. Criação tem consulta própria.

147 testes dirigidos positivos: 60 Vitest, 84 Node (incluindo HTTP) e três
SDK Firestore reais; [evidência](../../../entregas/2026-10-25-writer-v2-consulta-do-aceite-original.md).
Dependência implementada, não a visibilidade em lote. Seleção/retomada de
visibilidade, composição completa de compêndio, lifecycle/consumidores/backup/
rollout/validate de P1 e demais fases/gates seguem abertos.
Somente commit local, sem CI/envio remoto/deploy.

## Visibilidade da seleção, marco A — M38c6a

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md) e
[ADR 0140](../../../decisions/0140-lore-manual-unit-gate-and-local-flush.md):
gate metadata após write-ahead/antes de RPC, com revalidação tardia, e
flushLocal de dívida/checkpoint sem dirigir produção. Cold apply não é reenviado
por flush. Cancel fresco sem chave conclui com produtor retido no gate.

155 casos distintos positivos (dez novos), lint/tipos/build/smoke positivos;
[evidência](../../../entregas/2026-10-25-writer-v2-controle-de-unidades-da-visibilidade.md).
Sem montagem de UI. Manifesto/ledger/executor/revisão/retomada de visibilidade,
composição de compêndio e demais lifecycle/consumidores/backup/rollout/validate
de P1 e fases/gates seguem abertos. Somente commit local, sem CI/remoto/deploy.
