# ADR 0151 — Índice incremental do lore portátil

- Status: núcleo A implementado e validado localmente; integração B–D pendente.
- Data: 2026-10-25.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md).

## Contexto

A captura privada ainda serializa a cabeça física de lore. O leitor do arquivo
e o validador servidor recompõem JSON de até 8 MiB, com até 128 spans por item.
Esse modelo não transporta todas as fontes lógicas atuais nem o JSON que cresceu
após remap. A leitura por faixas depende de índice sem prosa e de validação
incremental; não basta aumentar o limite ou montar o item a cada página.

## Decisão

BookPortableLoreIndex valida o objeto data lógico, não o envelope/framing nem
uma cabeça física. Processa até 64 KiB por unidade, com posições em bytes UTF-8.
Campos são os mesmos do schema portátil: nome/categoria obrigatórios, opcionais
explícitos, datas válidas, aliases/estrutura/relações literais. Nada de defaults,
normalização, nomes globais resolvidos ou ponteiros de armazenamento.

Checkpoint fechado tem teto de 16 KiB e tamanho independente da prosa/quantidade
de relações: sintaxe/UTF-8 parciais, máscara de campos, ranges, flags/datas,
contagens e ID corrente. Não contém strings de nome/resumo/detalhes/descrição,
listas completas ou corpo. IDs/chaves/categoria curtos são metadata de domínio.
Emite referências ordenadas por unidade, sem acumular catálogo. Saída depende
somente dos bytes consumidos e do estado; entrada não é mutada.

Reutilizar a gramática dos campos existente. Sua classe GenerationError agora
vive em módulo puro sem I/O e continua reexportada de generation, preservando
identidade, código e reason. A gramática tem entrada distinta para a coleção
portátil inteira de relações (estado v2); as APIs anteriores aceitam somente
estado v1 e mantêm o contrato de páginas com até 64 relações. O novo modo não
autoriza uploads ou altera limites das páginas nativas.

O índice prova apenas domínio/sintaxe quando percorrido desde a origem; não
prova SHA, bytes externos, encarnação, framing, acesso ou ativação. Ranges/IDs
não são grants. Os próximos marcos precisam vinculá-lo à fonte/arquivo/item/
checkpoint originais, conferir integridade e reautorizar por unidade/ao selar.

## Consequências e limites

Não há endpoint, namespace, Rule, dependência ou produtor novo. O parser pode
ser compartilhado por navegador/servidor; bundle browser e Chromium comprovam
esse isolamento. Isso não modifica a captura/restauração ainda limitada nem
certifica uma fonte nativa. Não habilitar P1 por causa do núcleo isolado.

Planos B–D devem integrar fonte lógica, leitura linear, pressão de consumo,
validação local/servidor e remapeamento/materialização sem cap artificial.
Inventário/cleanup antecedem qualquer novo recurso persistido. Compatibilidade,
backup de histórico, ativação/roundtrip e validate global continuam obrigatórios.

[Evidência](../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md):
335 Node distintos positivos (47 novos e 288 regressões), três jornadas Chromium,
bundle browser de 12 módulos e declaração TS conferida. Sem SDK/CI/remoto/deploy.
