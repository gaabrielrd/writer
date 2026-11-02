# Writer V2 — núcleo do índice portátil de lore

- Data: 2026-10-25.
- Marco: P1 / M38c12 A.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md), aberto.
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

Preparado o núcleo compartilhado necessário para substituir a recomposição de
lore no backup. Valida JSON lógico por até 64 KiB por avanço e devolve ranges
em bytes, presença, datas, privacidade e contagens, sem guardar prosa ou listas
inteiras no checkpoint. Referências de lore saem na ordem original em cada
unidade; não são resolvidas por nome ou por acesso global.

Strings/escapes/UTF-8/BOM, ausência/vazio, aliases e relações duplicadas continuam
literais. Objeto lógico e descrição de relação acima de 8 MiB/128 partes são
processados pelos testes. 10 mil relações não geram catálogo no estado. IDs
qualificados máximos cabem no limite fixo de checkpoint.

GenerationError foi extraído para módulo sem I/O e continua sendo a mesma
classe reexportada por generation. As entradas originais do validador mantêm
estado v1 e páginas até 64 relações. Só a entrada portátil separada aceita uma
coleção lógica extensa; não há ampliação de upload nativo.

## Critérios verificados

- [x] Campos conhecidos/obrigatórios/opcionais com domínio do schema existente.
- [x] Ranges de bytes exatos, UTF-8/escapes e metadados sem defaults.
- [x] Texto grande em campo/descrição e 10 mil relações por unidades.
- [x] Contadores, IDs/enum/datas, truncamento e JSON não canônico recusados.
- [x] Checkpoint pequeno, fechado, sem prosa/lista e entrada imutável.
- [x] ID máximo e cursor em escape/UTF-8 parciais preservados.
- [x] Modo portátil não aceito pelas APIs anteriores de página/campo.
- [x] GenerationError público e comportamento dos produtores atuais preservados.
- [x] Execução real em navegador sem Buffer/Node e retomada após recarga.
- [ ] Fonte C1 lógica → saída de backup por spans, com provas/autorização finais.
- [ ] Validação local/servidor e restauração integral grandes integradas.
- [ ] Remap >8 MiB, rollout/roundtrip/validate e demais requisitos de P1/V2.

## Arquivos

Novos functions/src/generationError.mjs, bookPortableLoreIndex.mjs/.d.mts e teste
Node. Generation reexporta o erro puro; BookLoreFieldValidation reutiliza a mesma
gramática em entradas separadas. Plano, ADR/AGENTS/arquitetura/testing/execução
registram o contrato e a sequência B–D. Sem alteração de UI, APIs, Rules,
namespace, crédito, mídia ou dependência.

## Evidência real

**335 testes Node distintos positivos:** 333 no lote de sete arquivos
generation, bookLoreFieldUpload, bookLoreSourceInspection, bookLorePublication,
bookLoreFieldValidation, bookLoreBaseIndex e bookPortableLoreIndex. Depois,
dois novos casos dirigidos de ID máximo e cursores contraditórios passaram.
São 47 casos novos e 288 regressões; nenhum skipped. O índice foi revalidado
sozinho após reforço das invariantes. Testes de fontes grandes do upload e da
publicação também passaram.

**Três jornadas Chromium reais**, em contexto isolado e somente loopback:

1. JSON lógico com 10005778 bytes, 153 unidades e 130 referências; checkpoint
   máximo de 548 bytes nesse cenário, sem o marcador de prosa nem Buffer.
2. Serialização do estado, recarga da página e continuação no meio de um ID
   UTF-8; uma referência exata, sem prosa no checkpoint.
3. Erro público puro com mesma identidade/reason e modo portátil recusado na
   API anterior de página.

Essas jornadas validam o módulo, não o fluxo de backup, UI ou piloto humano.
Script externo writer-v2-portability-qa/m38c12a-browser.mjs.

**Bundle browser dirigido:** Vite 8.3.3, 12 módulos, sem imports Node. Artefato externo m38c12a-browser/portable-lore-index.js.
Declaração .d.mts conferida por TypeScript com --ignoreConfig/--noEmit,
module/moduleResolution nodenext, target ES2022 e types node, sem skipLibCheck
no check final.
Lint JS, sintaxe, formato/docs/arquitetura/diff e hooks conferidos no fechamento.

O primeiro comando de TS isolado precisou de --ignoreConfig, exigido pela
versão instalada quando há tsconfig e arquivos explícitos. Um teste de cursor
repetia o valor original em vez de alterá-lo; corrigido e validado.
ESLint não tem configuração para .d.mts; essa declaração foi validada pelo TS.
Nenhuma regra suprimida ou limite de cobertura reduzido.

## Pendências e continuidade

O backend de backup continua lendo o documento físico e os validadores atuais
ainda têm seus limites antigos: este marco não foi conectado ao produtor.
Próximo passo obrigatório é B do plano 131, com fonte lógica autorizada e índice
de saída/leituras lineares. Depois C/D precisam integrar captura/validação e
remapeamento/materialização, inclusive crescimento após remap, sem substituir
o requisito por uma fonte pequena ou aumentar uma transação.

Inventário de namespaces/escritores/exclusão, migração/certificação das fontes
antigas, ativação/roundtrip/validate de P1/F2-09 e fases 3–5/gates continuam.
Não atribuir proveniência retroativa ao chat clássico; campanhas continuam
exclusivamente nas origens universo/aventura.

Validate global fica no fechamento de P1, conforme orientação do operador.
Sem Vitest/SDK nem build geral neste marco; Node/Chromium/bundle dirigido cobrem
o módulo puro e regressões afetadas. Sem CI/push/PR/merge/deploy/operação em
produção. Master e dev server preservados. Plano 131, P1 e Writer V2 abertos.
