# ADR 0125 — Barreira permanente para escritores legados de lore

- Data: 2026-10-24.
- Estado: implementada localmente; rollout coordenado pendente.
- Plano: [110 / M38c5l](../tasks/writer-v2/execucao/110-coordenacao-dos-escritores-legados-de-lore.md).

## Contexto

A proteção por presença de payloadStorage já impede o SDK de sobrescrever
uma ficha lógica. Ela não impede o formulário antigo de editar uma ficha
inline irmã no mesmo livro. Esse formulário normaliza texto e não participa
da preparação nativa. Admin também ignora as Rules.

hasLoreResources é controlado pelo servidor e preservado nas regras da raiz.
Reserva nativa de criação, adoção de geração e remoção o fixam em true. Ele
permanece mesmo após cancelamento/coleta: false/ausência não devem ser
restaurados para liberar um cliente antigo.

## Decisão

Usar esse marcador como barreira permanente por livro, sem um segundo flag.
Rules permitem CRUD inline somente se o valor estiver ausente ou for false.
true ou valor presente inválido recusam create/update/delete, inclusive durante
deleting e com clock/privacidade corretos. O leitor do autor não muda.

O serviço cliente recusa mutações antigas antes de qualquer write. Criação
com ID já existente continua como leitura/confirmação pelo contrato anterior;
exclusão de ID ausente continua sem efeito. Isso não comprova que o corpo atual
seja o resultado original daquele pedido. Nenhum desses casos regrava conteúdo.

A aplicação Admin legada de análise aplica a mesma barreira a qualquer lote
com destino local. O erro ocorre antes de writes e débito. Recibo legado já
aplicado continua confirmável com seu hash antigo; reserva de aplicação nativa
continua na rota preparada, com grants/CAS/recibos/clock/crédito atômicos.
Lote exclusivamente global conserva a autorização do universo.

Criação assistida permanece limitada à criação de livro novo, por tx.create;
não é um resave de ficha existente. Seus budgets de proposta não são limites
de autoria manual. Restore continua em preparação privada, sujeito ao próprio
protocolo; este incremento não o certifica nem ativa.

## Consequências e portão de rollout

A barreira protege inline e payload juntos, incluindo versões antigas que
não executam o guard do serviço. Não remove nem converte texto automaticamente.
Uma disputa de transação deve reler o marcador e recusar o callback antigo.

Não fazer deploy isolado destas Rules: após a primeira reserva nativa, o
formulário antigo deixa de poder gravar lore daquele livro. Entregar os caminhos
nativos de criação/edição/exclusão e recuperação, migração dos demais writers,
exclusão integrada de recursos/chaves e drenagem antes de ativar no compêndio.
A recusa compatível é uma proteção intermediária, não substitui a experiência
completa exigida pelo plano 81.

Não há novo namespace, dependência, chamada externa, publicação ou débito.
P1/F2-09/Writer V2 e gates humanos/comerciais permanecem abertos.
