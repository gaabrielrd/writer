# ADR 0092 — Lore completo nos serviços cliente

- Status: aceito para leitura; escritores e ativação pendentes
- Data: 2026-10-23
- Plano: [M38c, etapa 2](../tasks/writer-v2/execucao/80-consumidores-do-lore-completo.md)
- Complementa: [ADR 0091](0091-private-complete-lore-reads.md)

## Contexto

As APIs privadas transportam lore inline ou em payloads, mas o cliente ainda
mapeava stubs sem nome como fichas vazias ou os omitia ao ordenar por name.
Precisamos conferir a representação inteira antes de entregá-la aos consumidores,
preservando o caminho de livros inline que não depende das novas Functions.

## Decisão

bookLoreReadClient recebe RPC e guarda de contexto. Confere DTOs fechados,
escopo, tokens, índices, manifests, base64 canônico, comprimento, SHA integral,
UTF-8 estrito e JSON canônico. Reutiliza validateBookBackupJSONItem do schema
portátil puro, por declaração TS; não duplica seu domínio nem aplica o limite
do serializador de 8 MiB. Ausências, valores vazios e duplicados permanecem no
objeto lógico antes de mapear para o modelo de apresentação existente.

A base payload deve declarar o mesmo livro e não conter relações. As páginas de
relações exigem offset/count exatos, com até 64 entradas por página. Não há teto
total de entidades, relações ou 128 partes. O header final deve ser igual ao
inicial sob seu token. Lista monta todos os itens pelos tokens listados e repete
a varredura de IDs/tokens ao final; não entrega lista parcial ou mistura de
encarnações. Nenhum fallback de falha para vazio ou inline.

Quatro partes no máximo por lote; entidades e páginas de relações são montadas
sequencialmente. Promise.allSettled drena o lote inteiro, inclusive em erro, antes
de encerrar a operação ou permitir o refresh seguinte. Não persistir texto,
chaves ou corpos em cache novo; o payload montado fica somente em memória.

## Integração e compatibilidade

get/list de livros usam leituras Firestore confirmadas pelo servidor para
detectar a representação. Livro inteiramente inline mantém leitura SDK sob
Rules e guarda da conta, sem precisar das novas APIs. Ao detectar payload, get
monta a ficha e list reconstrói a coleção inteira pelo protocolo privado.
A consulta de livro não usa orderBy(name); ordenar só após montar as fichas.
Universos mantêm caminho e ordem anteriores, e aventuras seu contrato próprio.

A criação idempotente retorna os dados existentes fora da transação e hidrata
payload, sem regravar nem incrementar o clock. Guardas fixam o objeto exato da
conta desde o início, inclusive quando outro login usa o mesmo UID. Os escritores
legados de update/delete bloqueiam payloads antes de qualquer write; isso não
substitui as Rules nem o novo protocolo de edição/exclusão da etapa 3.

Assinaturas de livros acompanham raiz, coleção e conta. Aguardam confirmação
servidor da raiz e dos documentos; cache inicial ou escrita pendente não prova
autorização/estado atual. includeMetadataChanges permite receber a confirmação
mesmo quando só muda metadata. Uma ausência inicial vinda do cache não encerra
erroneamente uma assinatura cujo livro existe no servidor.

A assinatura exige dono, estado e clock válidos. Refreshes são coalescidos e
serializados; epoch, guarda da conta original e unsubscribe invalidam respostas
tardias. Mudança do clock reinicia a leitura de payload mesmo sem outro evento
de coleção. Revogação, erro de snapshot ou troca de conta limpam a apresentação
e encaminham erro; não mantêm resultado parcial como sucesso.

## Evidência e limites

[Entrega M38c2](../entregas/2026-10-23-writer-v2-lore-completo-no-cliente.md):
149 testes distintos em nove arquivos, incluindo produtor de restauração,
API real e cliente TS em memória. Um harness de raiz permite somente testar
a leitura; não prova certificação/ativação de job, SDK real ou jornada browser.

O teste integrado usa ambiente Node; setup DOM fica condicional para suportar
esse ambiente sem alterar os testes jsdom. Casos do compêndio e editor também
passaram. Bundle e smoke confirmam que o schema puro compila para o navegador;
não substituem o roundtrip final de P1 ou testes humanos.

Sem nova dependência, Rule, produtor, raiz ativada ou deploy. Leitura de lore de
livro exige conexão com o servidor; falha não autoriza recorrer ao cache antigo.
Antes de habilitar os payloads, entregar escritores/Rules/GC, leitores backend,
backup lógico, exclusão ativa e certificação/ativação. Etapas 3–7 de M38c,
P1/F2-09 e Writer V2 permanecem abertas. Somente commits locais, CI ignorada.
