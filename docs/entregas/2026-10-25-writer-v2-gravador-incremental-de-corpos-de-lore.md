# Writer V2 — núcleo incremental de gravação dos corpos de lore

- Data: 2026-10-25.
- Marco: P1 / M38c12 D3, núcleo do gravador; D3 ainda em implementação.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md).
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e limite da entrega

O núcleo prepareBookRestoreStreamBody gera um plano nativo por avanço. Requer
job autorizado em resources, raiz ausente e payloadInventoryVersion:1 já ativo.
O host deve confirmar suas escritas pelo journal/recibo/CAS na mesma transação.
Não é endpoint novo nem a integração completa de advanceBookRestoreLore.

Fragmentos D2 autenticados, chunks em montagem e nós Merkle usam os três conjuntos
já inventariados: bookResourceChunks, bookResourceBodies e bookLoreSegments.
IDs de domínio e DTOs privados separam staging de dados legíveis; nenhum manifesto
público aponta para staging. Controles têm metadata/cursor limitado; prosa do
acumulador parcial fica somente no artefato privado de até 64 KiB, com journal
e recibo de cada alteração. Origem/unidade são verificadas antes de sua gravação.

O processo prepara um fragmento de até 80 KiB por passo, empacota um fragmento
e um acumulador por passo, confere SHA da montagem, constrói nós por nível e
copia uma parte final imutável com seu caminho Merkle. Partes são reconferidas
em lotes de até 16 antes do header. O pointer conserva nascimento do header e
barreira das partes. Não mantém árvore, ficha ou catálogo de provas em RAM.

Leaf/branch do codec existente foram reexportados sem mudar seu formato.
Manifesto, bytes, provas e bodyId do gravador coincidem com prepareBookResourcePayload,
incluindo duplicação de nós ímpares. Fragmentos vazios não causam set sem mudança
em acumulador parcial: Firestore pode conservar updateTime nesses casos.

A descoberta do teste grande revelou também o teto na fronteira Structure →
Resources. A estrutura agora abre somente metadata D1 do primeiro lore e deixa
o corpo para a fase seguinte. Não ampliou o leitor integral ou autorizou fallback
após ponteiro inválido. Legados continuam no caminho anterior.

## O que continua pendente

O núcleo ainda não está ligado ao orquestrador de geração v2. Os testes usam um
coordenador explícito que grava job/journal/recibo nativos e chama os serviços
reais de validação, D2, estrutura, codec e cleanup. Esse harness não prova que
advanceLore completo já prepara a ficha grande.

D3 deve integrar os sete campos, datas lógicas originais e páginas de 64 relações
com descrições grandes; selecionar lore indexado também em Resources/Counts;
reconciliar por unidades, drenar staging com contabilidade compatível e provar
leitura/recaptura/roundtrip. A raiz geral continua ausente; não é ativação, UI
final, rollout ou conclusão de P1/V2. O namespace existente não dispensa conferir
o inventário geral de exclusão/coleta de P1.

## Critérios verificados

- [x] Corpos >8 MiB/128 partes com checkpoint limitado e partes finais de 64 KiB.
- [x] Árvores com 1/2/3/5/6/9 partes iguais ao codec original.
- [x] Fragmentos remapeados, montagem parcial e partes finais imutáveis.
- [x] SHA da montagem confere medida D2 antes do manifesto.
- [x] Captura de bytes/cursor antes do primeiro await do gravador.
- [x] Corpo alterado não passa a barreira SHA nem cria header.
- [x] Cancelamento/cleanup real em stage/pack/tree/emit/verify/header/pointer/done.
- [x] Recriação de controle/fragmento/acumulador/nó/parte/header/recibo recusada.
- [x] Cleanup preserva documento recriado em vez de adotá-lo como original.
- [x] Fronteira da estrutura não recompõe lore grande.
- [ ] Integração de geração completa, relações extensas e reconciliação.
- [ ] Drenagem do staging antes de ativação geral e roundtrip.
- [ ] P1/validate/inventários/legacy/drain/rollout e fases/gates do Writer V2.

## Evidência real

**84 Node distintos positivos** em três arquivos: 26 do núcleo novo, 17 da
estrutura e 41 do codec. Não é alegação de lote único de 84:

- Primeiro lote novo: 14/15; caso grande falhou na fronteira estrutural anterior.
  Corrigido o uso de metadata e repetido somente o caso afetado: 1/1.
- Após acrescentar captura pré-await, fragmentos/recriações, o lote de três
  arquivos teve 82/83 positivos. Uma comparação do fixture confundia Uint8Array
  do double com Buffer; corrigida a comparação de bytes.
- Um patch com âncora errada não aplicou alterações; o teste de comparação foi
  repetido ainda sem a correção e continuou vermelho. A âncora foi conferida e
  corrigida, sem alterar o contrato.
- Depois da correção e do novo caso de saída vazia, somente os dois casos
  afetados foram executados: 2/2, zero skipped. Os 84 casos distintos estão
  positivos, com stamps nativos simulados; não comprova o orquestrador completo.

O harness usa uma fonte real selada/upload/validada e reabre D2 por serviço novo
a cada fragmento. Seu coordenador inscreve o inventário com namespaces vazios,
cria recibos do mesmo formato e confirma os planos por prepareBookRestoreArtifacts.
Cleanup passa pelo serviço de produção. É teste do núcleo e do protocolo nativo,
não substitui a integração de advanceLore, generation v2 e Counts.

**3/3 SDK positivos**, zero skipped, 182884.5849 ms, Firestore 1.22.0 verificado,
projeto demo isolado em loopback, Admin e serviços reais. O mesmo coordenador
explicitamente de teste confirma planos/journals/recibos; não é o advanceLore
completo de produção.

1. Página de 64 relações com descrição grande, montagem parcial com updateTime
   real diferente do nascimento, árvore ímpar de três partes e leitura nativa
   idêntica ao codec original. Controle, fragmento e header confirmados existentes
   são negados pelo SDK para dono, outro usuário e anônimo.
2. Fragmentos vazios produzidos por entrada de um byte mantêm as invariantes
   updateTime/journal. Cancelamento e cleanup de produção removem todos os
   conjuntos payload e seus journals, sem raiz ativada.
3. Controle nativo apagado/recriado não é adotado pelo próximo avanço nem
   apagado pelo cleanup. Raiz permanece ausente.

Não é piloto, Auth/Callable/App Check real, retry forçado de transação,
integração de geração completa, drenagem pré-ativação ou roundtrip.

Formato, lint, arquitetura, sintaxe, documentação e diff positivos no fechamento. Sem nova fronteira
browser/UI neste núcleo; não repetidos Vitest/Chromium/build globais. As provas
do navegador de D2 não são evidência de materialização/roundtrip completo.
Validate global permanece no fechamento de P1 conforme orientação.
Sem dependência, Rule, endpoint, CI, push, PR, merge, deploy ou operação de produção.

## Arquivos

- BookRestoreStreamBody: estágios e planos nativos limitados.
- BookResourcePayload: leaf/branch existentes reexportados.
- BookRestoreStructure: metadata na fronteira de lore indexado.
- BookRestoreStreamBodyFixture: coordenador nativo de testes explicitamente isolado.
- Testes Node/SDK e documentação de D3 em andamento.

## Como conferir

Rodar functions/test/bookRestoreStreamBody.test.mjs, o teste de estrutura e
bookResourcePayload.test.mjs com node --test. Os testes SDK estão em
tests/firestore/bookRestoreStreamBody.rules.test.mjs e exigem emulador demo
isolado em loopback. A UI final não foi conectada a este núcleo.
