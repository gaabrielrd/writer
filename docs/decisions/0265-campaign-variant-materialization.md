# ADR 0265 — Materialização privada das variantes de lore

- Data: 2026-10-29.
- Estado: aceita para o núcleo interno.
- Referência: [plano 235](../tasks/writer-v2/execucao/235-materializacao-das-variantes-de-lore.md).

## Contexto

A restauração já prepara próprios e base congelada, mas as variantes e seus
corpos ainda não existem nos caminhos ordinários. Uma variante pode usar
uma âncora histórica distinta da base ativa. Arquivo assinado e metadados
de disponibilidade do arquivo não concedem acesso às origens atuais.

## Decisão

Criar uma geração por encarnação da restauração, com identidade determinística
separada da base e das âncoras. Materializar loreVariants/loreVariantBodies
usando bodyPlan/variantChunkId e portable-relations-v1 existentes. Reiniciar
revisões em 1 e datas na criação da restauração; preservar texto, estados,
previousMode, participação, retainedLegacy e ordem das relações.

Uma relação opaca permanece opaca, inclusive unresolved v3. Descritores cujo
alvo perdeu autorização antes da cópia viram somente targetKey/available false.
Autorizar a base ativa e a testemunha w:anchor da variante antes de abrir seu
DTO e repetir o guard na escrita. Resolver origens dos alvos por testemunhas
de variantes ou itens ativos, sem prosa viva. Congelar o digest dessa decisão
durante os lotes de um corpo e no journal; mudanças impedem avanço/auditoria.

Mapear a âncora à base ativa apenas quando testemunhas completas coincidem
e o item foi materializado. Demais âncoras apontam para base histórica derivada
da encarnação e anchorKey; o produtor dessas bases é o próximo incremento.
Não vincular à base/campanha antiga nem recapturar a aventura atual.

variantMaterialization opcional cifra até 8 KiB no job, sem texto crescente.
Cada chamada varre até 25 metadados, lê no máximo um DTO de até 4 MiB e escreve
até três corpos mais overlay. O codec preserva o limite nativo de 900.000 bytes;
nenhum texto é truncado. Overlay nasce após seus corpos; raiz da geração nasce
depois dos filhos e permanece preparing. O controle loreVariantState e o
activeLoreGenerationId só serão publicados na futura ativação.

variantWrites/ORDINAL usa o journal nativo compartilhado com row e
authorizationHash, metadados mínimos sem relação/prosa. Journal, alvos e recibo
têm mesmo nascimento nativo. Auditoria registrada confere máscaras, hashes,
imutabilidade e autorização. Cada chamada audita um journal, pois sua origem
pode envolver até 50 alvos; não multiplica esse custo pelo limite de 25.
Essa auditoria não substitui a auditoria física final.

Cancelar retira cifra/chave atomicamente e coleta geração/variantes antes de
base/próprios/índices/chunks. A coleta usa metadata/birth, sem prosa e sem exigir
acesso atual à origem; filho estrangeiro impede apagar o pai. Jobs anteriores
sem campos novos continuam válidos. Layouts C4 1–4 permanecem imutáveis;
integração de temporários ao C4 apropriado antecede qualquer ativação.

## Consequências e limites

A prova campaign-variants-materialized-only é parcial. Não concede acesso,
não prova presença das âncoras nem libera leitores ordinários. Bases históricas,
mídia/pins, vínculo organizacional autorizado, C4 dos temporários, auditoria
física, ativação/aposentadoria dos journals e Estúdio/ciclos ainda são necessários.

Um corpo grande relê o DTO autorizado por lote, com memória limitada pelo DTO,
sem acrescentar conteúdo ao checkpoint. Perda de acesso após copiar um lote
interrompe a preparação; cancelar continua possível. Testes de leitores
ordinários liberam raízes/controle somente em fixtures, nunca em produção.
