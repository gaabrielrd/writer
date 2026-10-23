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
