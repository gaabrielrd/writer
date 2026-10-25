# Writer V2 — composição portátil do lore por unidades

- Data: 2026-10-25.
- Marco: P1 / M38c12 B.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md), aberto.
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O leitor C1 oferece writePortable e verifyPortable. A composição individual
recebe livro/ficha e um consumidor de partes; produz JSON portátil fechado
sem reconstruir a ficha inteira em RAM. Inline, payload v1/v2 e criação nativa
usam a mesma autorização. O token C1 da versão 1 fixa também o clock da coleção,
mesmo quando o host usa tokens de editor da versão 2.

Uma base payload é varrida uma vez pelo parser existente com observador RAM de
bytes. Só campos efetivos entram na saída; bookId físico e datas substituídas
são omitidos. Overrides presentes, datas lógicas e interiores das páginas de
relações são anexados sem normalizar strings, aliases ou ordem das relações.
Exclusões explícitas permanecem ausentes; datas/consentimento não recebem defaults.
Páginas nativas continuam com até 64 relações e contagem/domínio próprios.
Cada override também é validado como um único valor JSON do campo; um corpo
com hash correto não pode injetar membros adicionais no objeto composto.

Cada corpo consumido tem SHA integral verificado, inclusive base com campos
substituídos. O índice A valida data durante a saída. Partes de 64 KiB aguardam
o consumidor antes de buscar a próxima unidade; não há leitura antecipada.
Ao final, EOF/domínio/hashes/header original precisam conferir para devolver
prova privada com hashes, contagens, offset de data e spans. Tokens/índices
não vão para o JSON produzido e não concedem autorização de restauração.

Abort, troca de ator, erro do consumidor, fonte alterada e corrupção impedem
a prova final. Bytes já emitidos são provisórios: o orquestrador futuro deve
abortar seu sink em erro e selar somente após todas as conferências. Não há
retomada durável do arquivo nem produtor remoto novo; nenhuma chave/job/namespace
foi criado. VerifyPortable reautoriza metadata da origem, sem baixar prosa ou
certificar novamente disponibilidade dos corpos/bytes do arquivo.

## Critérios verificados

- [x] Inline/v1/v2/criação com projeção lógica literal e envelope fechado.
- [x] Fontes >8 MiB/128 partes, nome grande e aliases sem limites públicos.
- [x] Overrides/deleções, datas ausentes e base substituída sem vazamento.
- [x] Relações presentes/ausentes/vazias, 130 itens/duplicados e descrição grande.
- [x] Leitura de cada parte de transporte uma única vez e revalidação sem chunks.
- [x] Contagem/hashes/spans/offsets em bytes, incluindo ID Unicode/aspas.
- [x] Pressão de consumo, actor/abort/erro do sink e resposta tardia.
- [x] Corrupção de cauda, clock/head/livro recriados, tombstone e parte ausente.
- [x] Erros/reexports e consumidores do parser/leitor antigos preservados.
- [x] Chromium e SDK nativos percorrem o cliente compilado/serviço C1 real.
- [ ] Conexão ao orquestrador de arquivo, validação local/servidor e restauração.
- [ ] Remap grande/roundtrip/rollout/validate global e demais P1/V2/gates.

## Arquivos

BookLoreBaseIndex ganha observador opcional de bytes, sem alterar metadata ou
o contrato dos observadores decodificados. BookRestoreInput extrai apenas erros/
closed puros e mantém os reexports antigos de BookRestoreUploadContracts.
Declarações TS descrevem os parsers compartilhados.

BookLoreReadUnits centraliza a validação do DTO/escopo/manifest/base64 da unidade,
reutilizada pelo leitor integral anterior e BookLorePortableClient. O serviço
público bookLoreReadSession expõe as duas operações novas e tipos de prova/write.
Testes Node/Vitest/SDK e documentação atualizados. Sem Rule, endpoint, dependência,
UI, billing, mídia ou dado remoto novos.

## Evidência real

**147/147 Node** em bookLoreBaseIndex, bookRestoreUpload,
bookLoreSourceInspection e bookLorePublication: dois novos casos do observador
e 145 regressões. Callback mantém ranges/metadata e entrada imutável; datas
numéricas continuam na metadata. Upload/erros/CAS/fences, inspeção e publicação
grande também positivos.

**114 Vitest distintos positivos**: 75 do leitor/sessão, 26 novos do produtor e
13 do bridge de publicação. Execuções dirigidas, não um lote final único de 114.
O lote de quatro arquivos teve 112 positivos e uma falha do fixture Unicode;
o arquivo do produtor foi corrigido e, após a regressão adicional de override,
reexecutado com 26/26 positivos. O teste de injeção aceita o corpo malformado
sem a correção (vermelho confirmado); com a validação individual, rejeita e passa.
A primeira captura do vermelho falhou ao decodificar stdout UTF-8 como cp1252;
o harness foi corrigido e repetido, sempre restaurando o código no finally.
Bridge usa C1 e serviços de produção com stamps nativos simulados, não cloud.

**5/5 SDK novos**, emulador Firestore 1.22.0 verificado/demo/loopback, sem skipped.
Admin real + serviço C1 + cliente compilado em memória: v1 >8 MiB/128 partes
com cada unidade lida uma vez, projeção literal e revalidação sem prosa; v2;
criação com provas nativas; mudança de clock depois da saída; parte recriada.
O SDK proprietário continua sem ler chunks diretamente pelas Rules.
A callable/Auth/App Check em produção não foi executada; UID é fornecido pelo
harness ao serviço. Lote de cinco: 76732.9308 ms. Após a revisão dos overrides,
os três casos afetados (v2/criação/clock) foram repetidos: 3/3, zero skipped,
58274.1594 ms. Os outros dois são evidência da execução anterior, sem novo lote geral.

**Três jornadas Chromium reais** com serviço C1 de produção em memória e somente
loopback: saída v2 de 10005932 bytes, 153 partes, 161 unidades nativas distintas,
base/overrides/deleções e 130 relações; revalidação metadata em contexto fresco;
pressão de consumo e troca do objeto de ator com o mesmo UID sem completar.
Os três foram repetidos após a correção dos overrides, novamente positivos.
Não é UX de backup, login real, piloto ou retomada durável.

Typecheck/build/smoke positivos, 2988 módulos; avisos existentes de chunks/imports
dinâmicos. Bundle browser dirigido do cliente com 23 módulos positivo, sem APIs
Node. Lint JS/TS sem erros; ESLint informa que as duas declarações .d.mts
não têm configuração, por isso foram verificadas em tsc isolado sem skipLibCheck.
Sintaxe, formato/docs/arquitetura/diff positivos. Hooks conferidos no commit.
O build geral precedeu a última correção; depois dela, typecheck, compilação SDK
e as três jornadas Chromium foram repetidos. Validate global fica no fechamento
de P1 conforme orientação do operador.

Primeiro TS pediu declaração do validador; adicionada sem any. Lint removeu
assertion redundante. O primeiro SDK falhou no before: build Vite retorna lista
de outputs em modo biblioteca; o harness normalizou essa lista e os cinco casos
passaram depois. Fixture de payload derivava ID operacional ASCII do ID Unicode:
o teste de envelope usa inline com ID Unicode válido, sem afrouxar validação.
Nenhuma regra suprimida, fallback criado ou limite de cobertura reduzido.

Scripts/logs externos writer-v2-portability-qa/m38c12b-sdk.mjs,
m38c12b-sdk-emulator.log e m38c12b-browser.mjs. O teste SDK permanente compila o
cliente atual em memória e não depende desses artefatos externos.

## Continuidade obrigatória

B entrega a composição individual e sua prova, ainda sem trocar o produtor do
arquivo final. BookBackupResourceRead/BookResourceCapture e os validadores/
restauradores atuais mantêm o caminho anterior e seus limites. Próximo passo
é C: integrar captura e validação incremental local/servidor antes do selo.
D precisa ler/remapear/materializar por spans, inclusive quando o JSON cresceu
após remap >8 MiB. Não usar um writer isolado como prova de backup/restauração
integral ou habilitar P1 antes dessas integrações.

Inventário de namespaces/escritores/exclusão/coleta, fontes legadas, ativação,
roundtrip e validate de P1/F2-09, fases 3–5 e gates humanos/comerciais continuam.
Somente commit local; sem CI/push/PR/merge/deploy ou operação em produção.
Master e dev server preservados. Plano 131 e Writer V2 abertos.
