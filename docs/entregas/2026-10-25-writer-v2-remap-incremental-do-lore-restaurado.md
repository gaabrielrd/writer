# Writer V2 — remap incremental e medição do lore restaurado

- Data: 2026-10-25.
- Marco: P1 / M38c12 D2.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md).
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O reader interno openMappedIndexedLore fixa a origem C2 original e o destino
da restauração. O remapeador existente gera as novas identidades e resolve
a precedência de IDs locais qualificados pelo índice nativo original. Origem
externa ausente desse índice permanece literal, sem ganhar autorização.

Campos não relacionais são copiados por bytes, sem DTO/defaults. O transformador
de relações usa o parser portátil existente; a nova notificação opcional position
informa a posição de abertura/fechamento das strings sem alterar os callbacks
anteriores. Somente targetEntityId é substituído. Descrições, tipos de relação,
ordem de chaves/listas, duplicados, UTF-8/BOM e escapes permanecem literais.

Um alvo atravessando unidades fica retido como ID parcial no estado sintático;
nenhum prefixo do ID antigo é emitido. Cada avanço consome até 64 KiB e resolve
até 64 alvos. O fragmento resultante tem até 80 KiB, considerando crescimento
dos IDs e um alvo começado na unidade anterior. Não é parte de armazenamento
nativo: D3 ainda deve empacotar/atestar sob inventário antes de expor manifesto.

O cursor privado de até 16 KiB contém contexto/offset/contagens, sintaxe/ID parcial
e estado SHA do algoritmo já usado na validação. Não monta prosa, lista ou catálogo
de provas. Summary final mede byteLength/contentHash do JSON literal do campo
projetado e, para relações, sua contagem. Ausência continua present:false.

Cada unidade tem provas próprias de D1 e das resoluções locais. Verify(tx)
reconfere as observações antes da escrita consumidora. Cursor/hash/summary/
sourceToken são metadata do host; persistência deve passar pelo journal/recibo
nativo D3. Um cursor arbitrário do cliente não é prova de tudo que veio antes.
O descriptor expõe sourceMetadata, sem apresentar ranges originais como ranges
da saída remapeada.

Sem endpoint, Rule, namespace, recurso remoto ou dependência novos. O leitor
integral anterior conserva seu orçamento. Não ativa/restaura livro grande por
esse leitor isolado. D3/roundtrip e fechamento de P1 continuam obrigatórios.

## Critérios verificados

- [x] Remap exclusivo de alvos, com prosa literal e ordem arbitrária das chaves.
- [x] IDs partidos em qualquer byte, inclusive UTF-8/aspas, sem vazar prefixos.
- [x] Até 64 alvos/64 KiB de entrada e 80 KiB de saída por avanço.
- [x] Descrição/prosa acima de 8 MiB e mais de 128 unidades.
- [x] Fonte abaixo de 8 MiB com saída acima de 8 MiB após remap.
- [x] Medição/hash finais exatos e retomada por cursor serializado.
- [x] Precedência local qualificada e externo literal, sem promover grants.
- [x] Ausências, vazio, false, data zero e duplicados preservados.
- [x] Origem/índice/recibo/prova/cancelamento reconferidos no consumidor.
- [x] Cursor congelado antes de await, sem adotar mutações posteriores do chamador.
- [ ] Empacotamento/materialização nativa, inventário/rollback/ativação: D3.
- [ ] Roundtrip completo, inventários/legacy/drain/rollout/validate de P1.
- [ ] Fases/gates restantes, validações humanas e operação comercial.

## Evidência real

**255 Node distintos positivos**: 231 regressões em seis arquivos de gramática/
índices/leitura/remapeador e 12/12 do transformador novo. O arquivo da projeção
teve 11/12 positivos na primeira execução; o caso de crescimento criou um texto
inicial já maior que o teto desejado no fixture. Corrigida somente a montagem
do fixture e repetido apenas esse caso: 1/1, zero skipped. Assim os 12 casos
distintos de projeção estão positivos; não é alegação de lote único de 255.

O formatter detectou antes dos testes um await dentro de callback não async no
teste; a sintaxe foi corrigida. A revisão também fixou a cópia do cursor antes do
primeiro await do hash. O teste altera o cursor do chamador durante a execução e
confere que o trecho originalmente pedido continua sendo consumido.

Os testes de serviço usam stamps nativos simulados. Incluem fonte pequena cujo
JSON cresce além de 8 MiB, prova por unidade, checkpoints recarregados e limites,
identidade qualificada local/external, recriação do índice/recibo/prova,
cancelamento e ausência. Não comprovam SDK/lock/retry ou ativação.

**13/13 Vitest**: captura C1 de base v2 grande/overrides/deleções → arquivo
selado → upload/integridade/validação servidor → leitor projetado. Hash/tamanho
do campo grande e relações remapeadas exatas, campos removidos continuam ausentes
e raiz restaurada ausente. Histórico do fixture é deliberadamente vazio.

**2/2 SDK positivos**, zero skipped, 399298.3364 ms, Firestore 1.22.0 verificado,
projeto demo isolado em loopback, Admin/serviços de produção e cliente C1
compilado em memória. Fonte abaixo de 8 MiB cresce acima desse limite; hash,
tamanho e mil relações exatos após mais de 128 avanços. A preparação nativa
avança entre duas unidades: prova/reader antigo é recusado e reader novo retoma
o cursor da mesma origem/destino com a mesma identidade de projeção.

O segundo caso confere observação local qualificada presente/ausente, recriação
do índice, cancelamento, outro usuário e nenhuma escrita consumidora após
invalidação. O alvo existe antes de recriar; o ausente é confirmado ausente.
São serviços reais no emulador; não é login real/Callable/App Check, persistência
durável do cursor D3, retry forçado de transação ou ativação de livro.

**Três jornadas Chromium reais**, módulo puro de produção servido localmente:

1. Descrição de 9900063 bytes preservada literalmente; checkpoint máximo de
   411 bytes, fragmento máximo de 65536 bytes neste fixture; sem Buffer.
2. Recarga e retomada de estado serializado no meio de um alvo UTF-8; saída
   contém somente o novo ID e conserva o tipo de relação literal.
3. Duas mil relações em 32 avanços, máximo de 64 alvos, EOF completo e callback
   com substituição inválida rejeitado. Sem pageerror.

Declaração TS do observador e lint dos arquivos afetados positivos.
Formato/docs/arquitetura/sintaxe/diff positivos no fechamento. O check final
apontou formatação no arquivo SDK; aplicada e confirmada sem alterar comportamento.
Validate/coverage/build globais ficam para o fechamento de P1 conforme orientação.
Sem CI/push/PR/merge/deploy ou operação Auth/Callable/App Check de produção.

## Arquivos e limites do protocolo

- BookLoreFieldValidation e declaração: observação opcional de posições.
- BookRestoreLoreTransform: projeção incremental dos alvos por gramática comum.
- BookRestoreLoreProjection: cursor limitado e medição/hash por campo.
- BookRestoreContentRead: composição interna de fonte/remap/provas por unidade.
- Testes Node, bridge Vitest, cenários SDK e documentação do marco.

A saída de D2 é fragmento lógico provisório; não gravar um fragmento de 80 KiB
como chunk nativo de 64 KiB. D3 deve tratar montagem, SHA/Merkle, procedência,
persistência protegida do cursor e cleanup limitado sob inventário antes de
escrever recursos novos. Não reconstruir a ficha a cada parte nem guardar sua
prosa no checkpoint para contornar o protocolo.

## Como conferir

Rodar functions/test/bookRestoreLoreTransform.test.mjs e
functions/test/bookRestoreLoreProjection.test.mjs com node --test.
O bridge fica em src/features/lore/tests/bookLoreArchive.integration.test.mjs.
SDK mapped lore em tests/firestore/bookLorePortable.rules.test.mjs exige
emulador demo isolado em loopback. Não há nova tela/rollout de restauração grande.

Plano 131/P1/F2-09/V2 e demais fases/gates continuam abertos.
