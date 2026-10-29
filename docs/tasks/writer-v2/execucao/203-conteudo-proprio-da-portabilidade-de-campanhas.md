# P3 — conteúdo próprio da campanha em partes verificadas

- Data: 2026-10-29.
- Base: edaf21e; sequência dos [planos 201](201-portabilidade-privada-de-campanhas.md)
  e [202](202-inventario-proprio-da-portabilidade-de-campanhas.md).
- Estado: leitor interno validado por testes direcionados, parte do passo 2. P3/D/F2-09 abertos; macro 8/35.

## Objetivo

Ler os dados próprios como DTOs fechados e versionados, por partes limitadas,
depois de conferir a prova de inventário da unidade e seus pais/controles.
Preservar texto literal, estados, datas e ordens sem exportar documentos
operacionais, sem truncar e sem reunir a campanha inteira na memória.

## Conteúdo e regras

| Tipo                     | Dados portáveis                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| campaign                 | título, descrição quando presente, status, datas, intenção provenance.kind e declaração universeId quando presente          |
| progress                 | ausência explícita ou campos próprios editorialState/wordGoal nulos e updatedAt quando presente; sem contadores/checkpoints |
| note                     | título, content e datas                                                                                                     |
| session                  | título, summary, status, scheduledDate, order e datas                                                                       |
| checklist                | título, completed e datas                                                                                                   |
| preparation-item         | kind clue/quest, título, status, order e datas                                                                              |
| preparation-body         | kind e body fechado conforme clue/quest, sem envelope operacional                                                           |
| session-reference        | sessionId, target fechado kind/sourceKey e datas, somente descritor                                                         |
| session-preparation-link | sessionId, itemId, order e datas                                                                                            |

IDs próprios são coordenadas lógicas para remapeamento; revisão, ownerId,
campaignToken, tokens de captura e caminhos físicos não entram no DTO.
Declarações de universo, procedência e alvo S2 não são grants nem provas de
origem. A base congelada/atestado e a autorização atual continuam no passo 3;
não consultar ou exportar texto/nome de lore, aventura ou universo neste leitor.

Controles session-reference-state/session-preparation-state e tombstones são
conferidos pela mesma prova, mas retornam outcome omitted, sem chunk. Vínculo
ativo cuja sessão/item foi excluído também é omitido como inactive-parent,
sem recriar o pai. Catálogo/corpo próprio ativo continua exportável depois de
excluir uma sessão. A composição futura contabiliza essas omissões nas provas
internas, sem escrever controles/tombstones como conteúdo portátil.

## Contrato interno

Refatorar somente o necessário do inventário para reutilizar a leitura de uma
unidade por ID e a mesma função de prova/dependências. Preservar todos os tokens
e o DTO paginado existentes. Nenhum novo endpoint/cliente/job/arquivo habilitado.

readCampaignBackupOwnContent aceita somente campaignId, sourceToken, kind, id,
itemToken e index seguro não negativo. Validar/congelar antes de await. campaign
exige id igual à campanha; progress exige current. Nesses singleton, itemToken
é sourceToken, pois a âncora cobre ambos, inclusive ausência do progresso.

Para coleções: conferir C4/raiz/âncora, metadata e dependências, recalcular
itemToken e compará-lo antes de ler campos de texto. Na mesma transação, ler
somente máscara fixa de conteúdo; conferir identidade nativa igual à unidade
provada. Pedido obsoleto recusa com campaign-backup-item-changed sem ler prosa.
A ausência de recurso provado também recusa; não adotar recurso recriado.

DTO é schemaVersion 1, kind, id, present e data fechado. present false é permitido
somente para progress ausente. Projeções nested body/target/provenance também
são fechadas. Validar os limites atuais do domínio e UTF-8 literal antes de
serializar, preservando vazio, BOM, Unicode, espaços e escapes. Não remover
URL/texto escrito pelo usuário sob pretexto de filtrar metadata.

Resposta de chunk: envelope privado de origem/unidade, outcome chunk, index,
chunkCount, byteLength, contentHash SHA-256 e chunkBase64. Cada parte tem até
65.536 bytes decodificados, cortados nos bytes UTF-8 do JSON; a reconstrução usa
concatenação integral antes de decodificar. Nunca decodificar uma parte isolada
como texto. Sem cap global novo; escape JSON pode aumentar um campo permitido.

A unidade máxima é limitada pelos campos existentes do domínio (notas/resumos
150.000 caracteres/512 KiB; body S3 até 512 KiB antes do escape). Nenhuma coleção
ou projeto inteiro é montado como array. Índice fora das partes recusa sem
truncar, inclusive outcome omitted aceito apenas no índice 0.

## Arquivos e sequência

1. Reutilizar prova e elegibilidade de unidade em campaignBackupInventory.mjs.
2. DTO puro em campaignBackupOwnContent.mjs e leitor em campaignBackupOwnRead.mjs.
3. Extrair fixtures nativas compartilhadas para helpers/campaignBackup.mjs;
   preservar todos os testes anteriores e adicionar percursos reais do leitor.
4. Validar dados/chunks/revogação/recibos fora do arquivo, revisar diff e documentar.
   Testes direcionados por ajuste; validate integral no fechamento de P3.

## Critérios de aceite

- [x] Os nove tipos portáveis preservam todos os campos definidos, com IDs para remap.
- [x] Nenhum controle/revisão/token/grant/segredo/ponteiro físico no DTO, nem campo
      extra em body/target/provenance; controles/tombstones têm omissão explícita.
- [x] Provas de inventário continuam estáveis, incluindo dependências por sessão.
- [x] C4, ownership, fonte/unidade/pai obsoletos bloqueiam antes de qualquer texto.
- [x] Partes limitadas reconstróem exatamente JSON/UTF-8/hash, incluindo campos
      máximos, escapes, BOM e caracteres cruzando fronteiras.
- [x] Recursos próprios ativos sobrevivem à ausência da origem e de sessões;
      não recriar pai/item excluído a partir de vínculo residual.
- [x] Testes afetados e checks estáticos/documentais reais registrados; sem CI,
      envio remoto ou reinício do servidor manual.

## Limites e não escopo

Ainda não compõe arquivo, segunda passagem integral, prova de procedência,
autorização da base/universo, mídia, restauração, UI, jobs ou limpeza nova.
Inventário C4 segue v1–v4 até a evolução explícita antes de produtores persistentes.
Apenas ler DTOs não satisfaz o passo 2 inteiro nem P3/D/F2-09.
