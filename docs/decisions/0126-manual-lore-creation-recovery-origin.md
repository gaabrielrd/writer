# ADR 0126 — Origem da recuperação na criação manual de lore

- Data: 2026-10-24.
- Estado: implementada localmente; cliente e rollout pendentes.
- Plano: [111 / M38c5m](../tasks/writer-v2/execucao/111-transporte-e-recuperacao-da-criacao-de-lore.md).

## Contexto e decisão

A criação manual precisa proteger o rascunho antes de existir ficha. O protocolo
de edição exige uma cabeça observada e seu nascimento; fabricar uma ficha vazia
ou reutilizar esse grant como se a reserva fosse uma ficha seria incorreto.

Reutilizar a callable bookLoreEdit com quatro operações de reserva de criação:
start/get/cancel/advanceCleanup, mapeadas somente ao serviço nativo existente.
IDs manuais têm prefixo lore-creation e 64 dígitos hexadecimais. Upload/composição
aceitam somente a referência de criação desse namespace. Inspeção continua
restrita à ficha existente; jobs/filhos reservados da análise não são expostos.
UID vem da autenticação; DTOs nativos continuam fechados.

A lista BOOK_LORE_MANUAL_ROUTES contém 22 métodos. Preservar
BOOK_LORE_EDIT_ROUTES com os 18 métodos anteriores, porque o journal atual
usa essa lista para validar seus controles. Acrescentar transporte de criação
não pode fazê-lo aceitar controles que ainda não sabe persistir/limpar.
As listas são imutáveis e a separação tem regressão de contrato cliente.

A intenção de recuperação recebe creation opcional com creationId/startHash/
jobToken; sourceToken deve coincidir com esse token. Campo ausente conserva
o objeto/hash anterior. Schema do registro/view e endpoint da chave permanecem
compatíveis; requestHash liga toda a referência sem expor a chave em metadata.

## Prova da origem

Antes da cabeça, a origem é a reserva original de criação. Conferir contexto,
marcador pareado, token/hash, loreId derivado, nascimento da reserva e do livro,
autor atual, estado não deleting, hasLoreResources true e ausência de tombstones.
sourceBirth nesse modo representa o nascimento da reserva; em edição permanece
o nascimento da ficha. A presença de creation na intenção distingue os modos.

Nova chave só pode nascer enquanto a reserva está viva, sem cancelamento ou
adoção e sem cabeça. Chave já criada pode ser devolvida após cancelamento,
inclusive cleanup concluído, desde que a mesma origem continue autorizada.
Isso conserva o texto próprio cifrado e não libera uploads na reserva fechada.

Após adoção, exigir comprovante nativo de criação/edição/geração e o nascimento
original da cabeça ativa. Ficha ausente, retirada ou recriada com JSON idêntico
não reabre o ciphertext. Outra encarnação/dono/estado do livro ou reserva/prova
recriada também não concede chave. Ler metadata histórica e revogar a própria
chave continuam sem grant da origem; revogação nunca cancela jobs implicitamente.

Leitura usa somente metadata e provas; nunca abre prosa para autorizar a chave.
A chave original continua sob prova/fingerprint, HTTP autenticado/App Check,
private/no-store e sem regeneração em caso de ausência/recriação.

## Consequências e próximos passos

Servidor pode preparar criação literal por uploads/páginas, composição e adoção
nativas, preservando autorização, clocks e recibos. Não há novo endpoint,
namespace de armazenamento, dependência, migração ou publicação.

Ainda é necessário compor a criação no cliente com ticket antes de RPC,
reserva incerta confirmável, cópia cifrada, checkpoint, cancelamento e descarte
coordenados. Nenhuma entrada do compêndio é ativada neste incremento.
Também continuam exclusão nativa no cliente, ciclo físico de chaves ao excluir
livro, outros writers/consumidores/backup, drenagem e validate de P1.
Não implantar isoladamente; P1/F2-09/Writer V2 e demais fases permanecem abertos.
