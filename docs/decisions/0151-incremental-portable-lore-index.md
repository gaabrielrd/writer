# ADR 0151 — Índice incremental do lore portátil

- Status: núcleo A e composição B implementados/validados localmente; C/D pendentes.
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

O núcleo A não criou endpoint, namespace, Rule, dependência ou produtor remoto.
O parser é compartilhável entre navegador/servidor; bundle e Chromium comprovam
o isolamento. B acrescenta composição individual no cliente C1, descrita abaixo.
Arquivo final/validadores/restauração ainda exigem C/D; não habilitar P1 por A/B.

B integra fonte lógica, leitura única dos corpos e pressão de consumo.
C/D devem integrar arquivo, validação local/servidor e remapeamento/materialização
sem cap artificial.
Inventário/cleanup antecedem qualquer novo recurso persistido. Compatibilidade,
backup de histórico, ativação/roundtrip e validate global continuam obrigatórios.

[Evidência](../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md):
335 Node distintos positivos (47 novos e 288 regressões), três jornadas Chromium,
bundle browser de 12 módulos e declaração TS conferida. Sem SDK/CI/remoto/deploy.

## Composição B — fonte C1 autorizada

WritePortable fixa token C1 da versão 1, com clock da coleção/nascimento do livro
e identidade da ficha, independentemente do modo de tokens do host. Cada unidade
usa as APIs existentes e confere DTO/base64/manifest/escopo, autorização nativa e
SHA completo do corpo. Header original é reconferido ao terminar; VerifyPortable
é somente reautorização de metadata antes do futuro selo, não prova de bytes ou
disponibilidade atual de todos os corpos.

A base é varrida uma vez. Observador RAM de bytes em BookLoreBaseIndex permite
emitir os campos efetivos sem recompor/reler a ficha; datas numéricas continuam
na metadata. Em v2, omitir campos substituídos e anexar overrides presentes/datas.
Páginas de relações são validadas individualmente e concatenadas pelo interior
de seus arrays, conservando ordem/duplicados. Datas e presença são lógicas, sem
defaults de apresentação. Propriedades do objeto podem ter ordem diferente;
strings e ordem das listas não são normalizadas.

O índice A acompanha data e a composição calcula hash/contagens da saída e seu
offset em bytes. Prova é pequena, privada, congelada e só em RAM. Saída contém
somente envelope lógico, sem tokens, storage/job/control. Consumo é aguardado
a cada parte de 64 KiB; parsers/hash/unidade/buffer são limitados, sem catálogo
ou prosa integral. Sem chamada remota de escrita, job, chave ou namespace novo.

Bytes anteriores a EOF/hash/domínio/header são provisórios. Falha/abort/ator
alterado não retorna prova; o compositor C deverá abortar seu sink temporário.
Não há retomada durável do arquivo ou ativação de restauração em B. Reutilizar
leitura de unidade no cliente anterior conserva sua montagem/concorrência.

[Evidência B](../entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md):
147 Node, 114 Vitest distintos, cinco SDK e três jornadas Chromium positivos;
tipos/build/smoke/bundle/checks locais. C/D/P1/fases/gates continuam abertos.
