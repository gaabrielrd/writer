# ADR 0107 — Ativação nativa e sucesso histórico da criação de lore

- Data: 2026-10-24.
- Estado: aceito para backend interno, sem habilitar endpoint/UI.
- Plano: [92 / L3B](../tasks/writer-v2/execucao/92-ativacao-atomica-da-criacao-de-lore.md).
- Antecedentes: [ADR 0104](0104-permanent-book-lore-creation-reservation.md),
  [0105](0105-native-creation-field-uploads.md) e
  [0106](0106-creation-lore-composition-and-attempt-cleanup.md).

## Contexto

L1/L2/L3A reservam o ID, preparam campos/páginas e certificam uma geração sem
cabeça. A ativação precisa encerrar a reserva como sucesso permanente, impedir
cancelamento posterior e permitir leituras/reedições pela cabeça original.
Confirmar esse sucesso não pode depender de prosa nem do livro/ficha atuais,
que podem ser editados, retirados ou excluídos.

## Decisão

O mesmo fluxo interno de adoção reabre reserva/livro nativos e compilação pronta,
com cabeça/tombstone ausentes. Todos os planos/leitores precedem os writes.
Transação cria cabeça, ativa geração/leases lógicas, avança clock/flag/datas do
livro e grava recibo de edição e comprovante/prova do criador conjuntamente.
CreateTime da cabeça é o nascimento dessa transação; nunca o da reserva.

createdAt/updatedAt da ficha são o timestamp da confirmação, monotônico diante
do livro e da preparação. isPublic ausente/null conserva ausência privada;
false/true são explícitos e limitados ao campo auditado. Nova ficha não revoga
nem republica a edição anterior do livro e não gera débito.

Comprovante/prova privados em adoptions/current e adoptionProofs/current são
imutáveis, acoplados por nascimento e fixam token/contexto do criador,
tentativa/startHash/token, geração/token/nascimento, operação e hash da adoção.
Validação histórica confirma binding/prova da tentativa, intenção/contexto,
job/recibo/prova originais e evento nativo adopt-preparation da geração.
Geração pode estar active ou retired; corpos, cabeça e raiz não são abertos.
Confirmação da edição adopted de criação exige também esse comprovante do
criador, da mesma tentativa/token/nascimento, antes de aceitar replay.

Extraímos os contratos puros de contexto de geração e prova dos recibos sem
alterar hashes existentes ou seus reexports. Prova de tentativa tem núcleo
não recursivo que recebe o criador já validado; não chama EditStore. Assim,
CreatorStore pode validar sucesso sem recursão por FieldStore/CreatorStore.

Criador retorna adopted e metadata de confirmação; não retorna prosa, pointers
ou credenciais. Cancel, novos uploads e novas tentativas exigem reserva viva e
recusam o sucesso. Tentativas não utilizadas ainda podem ser canceladas por
sua prova histórica e a exclusão do livro usa os protocolos existentes.

Reader de ID reservado exige comprovante nativo e createTime da cabeça igual
ao da ativação original, createdAt original e livro original autorizado.
Cabeça recriada é recusada mesmo com bytes idênticos. Alterações posteriores
preservam esse nascimento. A primeira geração de criação valida a cabeça pelo
comprovante de ativação; edições seguintes mantêm seus contratos existentes.

Retirada e exclusão do livro preservam todos os comprovantes/leases/controles
permanentes. Confirmar start/get/retry antigos não recria cabeça ou livro e não
concede leitura atual. A etapa creations da exclusão reconhece adopted e não
tenta cancelar sucesso; recursos não utilizados são drenados nas etapas próprias.

## Consequências e portões

A fronteira de L3A que bloqueava adoção creation é substituída por esta
ativação com prova nativa. Não há callable/UI, dependência, Rule ou índice novo.

Antes de expor ao cliente ainda são obrigatórios os demais writers/regras,
drenagem das versões antigas, consumidores/IA/captura/publicação, backup lógico/
indexado, recuperação/host e roteamento de preparações sem flag.
Ativação de restauração e fechamento de P1/F2-09 continuam separados.
Não há publicação comercial, deploy ou aprovação de piloto por fixtures.
