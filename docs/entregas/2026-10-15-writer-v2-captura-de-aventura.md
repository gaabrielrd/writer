# Writer V2 — Captura de aventura e base privada de campanha

- **Data:** 2026-10-15
- **Branch:** codex/writer-v2
- **Plano:** [F2-07 B](../tasks/writer-v2/execucao/15-captura-de-aventura.md)
- **Estado:** concluído tecnicamente em f97455d; validação local, CI e regras verdes.

## Objetivo

Criar duas mesas da mesma aventura própria sem alterar o original nem receber
edições posteriores automaticamente. A escolha do operador foi capturar a aventura
completa e somente fichas de lore explicitamente referenciadas.

## Funcionalidades entregues

- **Preparação retomável:** iniciar na aventura, acompanhar/pausar, retomar no
  Estúdio ou cancelar e concluir a limpeza, inclusive sem a origem.
- **Base congelada:** partes, cenas, blocos, planejamento, audiências, arquivo,
  cenas sem parte, texto legado, arcos, marcos, cronologia e ilustrações próprias.
- **Lore referenciado:** união deduplicada dos vínculos explícitos de cenas e
  narrativa. Não inclui fichas apenas citadas pelo nome nem relações transitivas.
- **Leitor privado:** material, narrativa, lore e arquivo com paginação e leitura
  integral verificada. Relações e referências indisponíveis não revelam seus alvos.
- **Recuperação:** pedido/checkpoint/identidades preservados antes da rede, mesmo
  pedido após resposta perdida e descoberta dos controles após reload. Preparações
  incompletas não aparecem como campanhas prontas.
- **Isolamento:** alterações do original não atualizam a base; mudanças próprias de
  título, descrição, estado, universo organizacional e checklist preservam procedência.

## Critérios de aceite

- [x] Duas campanhas capturam bases próprias sem gravar no original.
- [x] Mudança da origem entre etapas aborta duravelmente, sem misturar versões.
- [x] Retry/CAS não duplica recurso, campanha, vínculo ou pin de imagem.
- [x] Corpo grande/Unicode é remontado integralmente, com hash/bytes e sem truncamento.
- [x] Leitura reautoriza origem/fichas; SDK direto nega controle, corpo e mídia.
- [x] Limpeza é limitada e retomável mesmo sem aventura ou schema de origem suportado.
- [x] Conta/alvo tardios não substituem a sessão atual; teclado e 320 px funcionam.
- [x] Validate, revisão, documentação/ADR e evidência locais concluídos.
- [x] CI do head f97455d, acompanhado em paralelo no PR 21 e confirmado verde.

## Arquivos alterados

| Arquivo/área                                                    | Mudança                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| src/features/campaign-bases                                     | Transporte, contratos, adaptador de recuperação, controlador, criação, preparações e leitor |
| adventures/AdventurePage, studio/StudioPage, campaigns          | Integrações públicas, procedência original e gestão de metadados próprios                   |
| functions/src/campaignCapture.mjs e campaignCaptureItems.mjs    | Captura por checkpoint, ativação atômica, pins e limpeza                                    |
| functions/src/campaignBaseContracts.mjs e campaignBaseRead.mjs  | Identidade, limites, autorização e projeção antes dos corpos                                |
| functions/src/campaignCaptureHttp.mjs, index.mjs e package.json | Mídia no-store, doze callables e verificação de sintaxe                                     |
| firestore.indexes.json                                          | Índices dos filtros/ordem e dispensa de índices dos campos grandes                          |
| e2e/visual/campaign-base.visual.ts e fixtures                   | Corpus real da fixture, isolamento por UID, reload e paridade de campanhas originais        |
| Testes colocalizados, functions/test e tests/firestore          | Interface, transporte, servidor, HTTP real e SDK/regras reais                               |
| AGENTS, README, arquitetura, testes, planos e ADR 0031          | Regras, estado real e limites de operação                                                   |

## Testes

Unitários dirigidos de captura/HTTP: **13/13**; leitor **11/11**. Frontend cobre
transporte, integridade de chunks, paginação, relações, recuperação de start/passos/
ativação, controles locais após reload e troca de UID/alvo. Integrações cobrem
Aventura/Estúdio/Campanha e preservação de procedência durante edição própria.

SDK conjunto inicial: **13/13** (captura, leitor e gestão). Depois dos ajustes de
replay/schema, repetidos somente os nove afetados, com Firestore real no emulador:

```text
ℹ tests 9
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 21624.7227
```

Prova inclui escritores reais, ordem B da narrativa, vínculos de cena/arco/marco/
evento, texto legado, negação direta para dono/estranho/anônimo, CAS, pin, revogação
e replay após excluir/recriar o mesmo ID. Storage é injetado; não comprova bucket
ou credenciais de produção. Emulador encerrado após a execução.

Chromium: **36/36**, 81.814,501 ms, sem retries, skips, falhas ou flaky. Após
acabamento de painéis e guard de alvo: somente seis afetados, **6/6**, 15.648,012 ms.
Regressão de lore existente **1/1**, 5.422,018 ms; controles de fixture **5/5**.
Capturas finais em 320 px conferidas nos três temas, com teclado e sem overflow.

Negativos preservados: botão longo expandia a lista em 320 px; GET de preparação
aceitava aventura diferente; fixture rejeitava edição válida de campanha original.
Correções locais passaram nos casos afetados. O label do teste de paginação foi
ajustado ao sufixo real “Adicional”, mantendo ausência antes e presença após carregar.
Revisões independentes de captura e leitor não deixaram P0/P1/P2 acionáveis.

## Validações executadas

`npm run validate` final **exit 0**:

```text
Test Files  163 passed (163)
     Tests  1547 passed (1547)
  Duration  115.52s
All files  | 91.12 | 84.66 | 90.31 | 93.57 |
ℹ tests 77
ℹ duration_ms 7766.7771
ℹ tests 289
ℹ pass 289
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 1927.7315
✓ built in 1.22s
Smoke test do bundle OK.
```

Cobertura: 91,12% instruções, 84,66% ramos, 90,31% funções e 93,57% linhas.
Skills, arquitetura, docs, styleguide, formato, lint, tipos e sintaxe verdes.
Dependências de functions previamente instaladas com npm ci. Primeira tentativa
parou no formato da tabela do plano, antes de lint/testes; corrigida e comando
completo repetido. Avisos preexistentes de chunk grande, importação mista DOCX
e start() de infraestrutura permanecem, sem falha.
Documentação posterior recebe somente formato/check:docs/diff dirigidos.

Artefatos externos preservados em writer-v2-campaign-base-validate-final.log,
writer-v2-campaign-base-final-sdk.log, writer-v2-campaign-base-final-emulator.log
e writer-v2-capture-qa (results, post-panels, native-summary e captures-final).
Saídas anteriores e negativos permanecem separados; não são contados como aprovação.

## Fora do escopo e pendências

Variantes, notas próprias estruturadas, comparação/atualização explícita e exclusão
integral da campanha seguem em F2-07. Histórico/metas/atividade não são copiados.
Comércio, edição adquirida, sessões, portal, backup e pilotos humanos têm gates próprios.

Imagens aceitas são imutáveis pelos escritores da aplicação. Não se presume
versionamento do bucket: sobrescrita externa torna a identidade indisponível.
HTTP de mídia usa private, no-store, provado por callable real em sucesso/erro.
Leitura da base exige aventura própria atual; lore também exige universo/ficha
originais. Trocar o universo organizacional não contorna esses gates.

F2-05/F2-06/A têm CI verde em 624c912; essa prova não substitui o CI deste incremento.
PR 21 permanece em rascunho. Nenhum merge, deploy ou alteração no checkout master.

## Como verificar manualmente

1. Na aventura própria, escolha criar campanha, confira nome/universo e inicie.
2. Continue a preparação, pause/reabra e ative somente quando pronta.
3. Leia partes, cenas, blocos, narrativa, fichas referenciadas e arquivo.
4. Edite o original e confira que a base pronta preserva seu texto anterior.
5. Crie outra campanha; edite dados/checklist de uma e confira a outra intacta.
6. Simule resposta perdida e reload; confirme o mesmo pedido no Estúdio.
7. Altere/remova a origem durante preparação; confira aborto e limpeza retomável.

## Registro e envio — 2026-10-15

Implementação registrada em f97455de4b5f5fc3de2f1b0a449f066cfccc02d3 e envio
confirmado por ls-remote na branch codex/writer-v2. Pre-commit preservou lint-staged;
pre-push confirmou tipos e 1.547 testes em 163 arquivos, 102,63 s. O
[PR 21](https://github.com/gaabrielrd/writer/pull/21) continua aberto em rascunho.

O [CI deste head](https://github.com/gaabrielrd/writer/actions/runs/38726372126)
aprovou validate Node 22/24, auditoria e navegador de produção; os oito shards
visuais ainda executavam no último snapshot. As
[regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/38726372115)
terminaram verdes. Não presumir aprovação agregada enquanto esses jobs executam.
C1 notas começa sob a sequência autorizada de testes dirigidos e CI em paralelo.

## Confirmação remota — 2026-10-15

Os runs de f97455d terminaram verdes: validate Node 22/24, auditoria, navegador de
produção, oito shards visuais, gate agregado e regras. Logs de produção confirmam
7/7, 14,2 s; Firestore confirma 112/112, zero falhas/skips, 46.125,841265 ms.
Não inferir contagens de retries dos shards pelo estado success. A captura B está
concluída tecnicamente; F2-07 continua nas notas/variantes/atualização/exclusão.
