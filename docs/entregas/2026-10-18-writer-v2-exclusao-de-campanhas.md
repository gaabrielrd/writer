# Writer V2 — Exclusão integral e retomável de campanhas

- **Data:** 2026-10-18
- **Branch:** `codex/writer-v2`
- **Plano de origem:** [F2-07 C4](../tasks/writer-v2/execucao/20-exclusao-integral-da-campanha.md)
- **Estado:** concluído tecnicamente em `0006a66`, com CI/regras verdes no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).
- **Decisão:** [ADR 0036](../decisions/0036-campaign-deletion.md).

## Objetivo

Permitir excluir definitivamente uma campanha própria, revogando o acesso antes
da limpeza limitada e retomável. Preservar aventura, universo, biblioteca e outras
mesas, inclusive quando a origem da campanha já estiver indisponível.

## Funcionalidades entregues

- Confirmar a campanha observada e iniciar a exclusão com reserva permanente,
  desvínculo organizacional e recibo atômicos. O mesmo ID não pode ser reutilizado.
- Retomar limpeza de notas, preparação, bases, candidatas, gerações e variantes
  antigas sem depender da aventura ou da existência da raiz. Pausar ou fechar
  interrompe a continuação após a etapa em andamento; consultas não iniciam passos.
- Remover somente os usos tipados das ilustrações pertencentes à campanha,
  mantendo arquivos e usos das outras mesas. Contador inconsistente interrompe a
  etapa sem confirmar progresso ou inventar um decremento.
- Confirmar pedidos cuja resposta se perdeu, sem repetir limpeza. Encerrar início
  não confirmado impede seu envio atrasado; não desfaz uma exclusão já iniciada.
- Ocultar conteúdo após confirmação remota mesmo se um controle novo impedir o
  CAS local. Consultas antigas, troca de conta e reabertura de diálogos preservam
  a propriedade das operações e dos estados de carregamento.
- Conferir explicitamente os controles antigos do navegador após prova própria de
  exclusão permanente. Confirmação integral preserva rascunhos alterados por outra
  aba; C2 é encerrado sem pedir chave ou decriptar, após oncomplete do IndexedDB.

## Critérios de aceite

- [x] Revogação ocorre antes da limpeza; escritores e replay não recriam recursos.
- [x] Limpeza alcança gerações adotadas, bindings antigos e candidata parcial.
- [x] Prosa/chaves/descriptors são removidos; recibos conservam somente metadados mínimos.
- [x] Pins, contador de retomada e vínculo organizacional mantêm suas invariantes.
- [x] Outra mesa, origem, biblioteca e relógio privado do UID são preservados.
- [x] UI cobre pedidos incertos, confirmação explícita, temas, teclado e 320 px.
- [x] Revisões, testes dirigidos, SDK real, navegador e validate local verdes.
- [ ] CI do próprio novo head verde; os checks do C3B não substituem este portão.

## Arquivos alterados

| Área                                                 | Mudança                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `features/campaign-deletions`                        | Transporte, validação fechada, journal, operação e diálogos  |
| `features/campaigns` e `studio`                      | Composição pública, prova/closers e invalidação dos leitores |
| Captura, notas, lore, comparação e adoção            | Encerramento por snapshot e proteção de respostas tardias    |
| `shared/services/invalidationPulse.ts`               | Pulso neutro por ator/escopo, sem prova ou conteúdo          |
| `functions/src/campaignDeletion*.mjs`                | Reserva, fases, sanitização, pins, certificação e recibos    |
| Escritores/leitores existentes e índice de callables | Guarda de reserva antes de conteúdo/replay                   |
| Regras/índices e verificador de arquitetura          | Namespaces privados e fronteira folha/composição             |
| Testes colocalizados, Functions, SDK e navegador     | Negativos, integração e jornadas observáveis                 |

## Testes e validações executadas

`npm run validate` final **exit 0**, incluindo skills, arquitetura, documentação,
styleguide, formato, lint, testes, tipos, sintaxe, build e smoke:

```text
Test Files  177 passed (177)
     Tests  1813 passed (1813)
  Duration  136.02s
Statements : 90.39% (15552/17204)
Branches   : 84.45% (13334/15789)
Functions  : 90.01% (4059/4509)
Lines      : 92.98% (14242/15317)
Scripts: 81/81, duration_ms 9177.6218
Functions: 358/358, duration_ms 2556.8603
Build: 1.35s
Smoke test do bundle OK.
```

Os testes do servidor incluem 11 casos C4 e regressões dos escritores antigos.
Regressão adicional dirigida de progresso/leitura de base: **26/26**, 342,1401 ms.
No cliente, jornadas de confirmação, GET pendurado, UID, A→B, prova independente,
fechamento parcial e IndexedDB simulada exercitam os adaptadores reais do produto.
Dois testes da fronteira Firebase usam mocks somente do SDK/app e conferem as seis
operações, região, payload, respostas e erro/repetição explícita do mesmo pedido.

SDK Firestore/regras reais: **cinco famílias únicas validadas**. A primeira
execução teve 4 passes/1 falha, zero skips, 107.439,3056 ms. A falha comparava o
epoch antes da revogação da origem com o estado depois da exclusão. Corrigiu-se
somente a posição do baseline no teste, após revogação/antes do início C4. Apenas
essa família foi repetida: **1/1**, zero falhas/skips, 43.099,2961 ms. As outras
quatro aprovações foram preservadas; não houve um segundo lote completo 5/5.
Emuladores demo encerrados. Assets foram injetados, sem prova de Storage real.

Navegador: **12 combinações únicas verdes e duas revalidações dirigidas**, 14
execuções positivas, zero retries/skips/flaky. Durações reais dos três lotes:
13.039,816 + 36.744,618 + 11.955,826 = **61.740,260 ms**. O último lote repetiu
somente os dois percursos desktop-dark após separar prova permanente e adoção do
controle local. Não houve nova matriz ou controle extra.

Nos 14 percursos, console.error, pageerrors e requisições externas ficaram em
zero. Web Locks, cifra e IndexedDB do navegador são reais; transporte é simulado.
Há 21 PNGs. A raiz inspecionou seis representantes em 320×740 nos três temas;
quatro light/sépia pertencem à matriz inicial e as duas dark atuais são idênticas
por SHA256 às anteriores. A jornada capturada usa 1440×1000/390×844, sem alegar
320 px nela. Teclado Enter, cancelamento e retorno de foco foram exercitados.
O negativo integrado A→B do host usa adaptador real com eventos IDB simulados;
não se alegou uma corrida nativa de duas abas neste incremento.

## Revisão e correções

Revisões independentes de servidor, cliente e QA encerraram sem bloqueadores.
Foram cobertos paginação após snapshot reservado com getters reais, job interno
inválido, identidade de lookup, revogação durante I/O, notificação antes do CAS,
prova de exclusão independente do journal antigo, schema futuro e propriedades
de carregamento ao fechar/reabrir. Negativos de revisão pendurada e prova antiga
falharam antes dos respectivos ajustes e passaram depois.

O primeiro validate passou em **1.811 testes**, mas parou com funções em 89,86%.
Os dois testes da fronteira Firebase cobriram a lacuna do adaptador; código do
produto, limites e exclusões permaneceram inalterados entre as duas validações.
Nenhuma dependência nova. `npm ci --prefix functions` terminou com exit 0 e zero
vulnerabilidades; engine Node 22 versus Node 24.21.0 local gerou aviso. Build
conserva avisos existentes de chunk grande e importação mista DOCX.

Após o validate verde, somente documentação/AGENTS foram realinhados; check:docs,
formato dos documentos e diff --check passaram. CLAUDE.md permanece coerente.
A varredura dos 99 arquivos alterados não encontrou marcadores de chave privada,
novos arquivos .env ou artefatos acima de 5 MiB. O checkout original
`master 522ccaa` foi conferido limpo e preservado.

## Fora do escopo e pendências

A CI de `1b20f49` revelou uma expectativa anterior no teste de regras do Estúdio:
o caso conjunto ainda permitia GET/list SDK do dono em campanhas. C4 fecha esse
acesso intencionalmente. O [run de regras](https://github.com/gaabrielrd/writer/actions/runs/39098228242)
terminou com **134/135**, uma falha e zero skips. A correção altera somente o
teste: campanhas negadas, aventuras com consultas autorizadas preservadas; nenhuma
regra ou código do produto foi relaxado. Caso afetado repetido em emulador real:
**1/1**, zero falhas/skips, 3.901,3647 ms (caso 3.208,6615 ms). Syntax e formato
passaram. Os 134 casos inalterados não foram repetidos localmente. Log externo:
`writer-v2-studio-c4-owner-sdk.log`; emulador encerrado e porta fechada.

O head da correção `0006a666116641b4b40bf412dbe5fd4cbf08b50f` passou no
[CI geral](https://github.com/gaabrielrd/writer/actions/runs/39098696334) e nas
[regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/39098696342).
Validate Node 22/24 e auditoria verdes; navegador de produção **7/7** em 15,8 s;
doze shards visuais e agregador aprovados. Regras **135/135**, zero falhas/skips.
O status dos shards não foi convertido em contagem exata de casos ou retries.
Hooks do envio preservados: typecheck e **1.813 testes/177 arquivos**, 120,64 s.

Merge, deploy e exclusão real de dados do operador não foram executados.
Habilitação exige guardas/escritores/regras conjuntos e dreno
de versões antigas; manutenção Admin deve respeitar a reserva. Índices implantados,
bucket real, zoom físico de 200%, leitor de tela, segundo dispositivo e pilotos
humanos não foram comprovados. Sessões, compartilhamento e comércio continuam nas
respectivas tarefas. F2-07 está concluído tecnicamente no recorte documentado.

## Evidência e verificação manual

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-campaign-deletion-validate.log`, tentativa anterior preservada,
`writer-v2-campaign-deletion-sdk-summary.json`, logs SDK/emuladores e
`writer-v2-campaign-deletions-qa/qa-summary.json`/`captures-final.json`.

1. Abrir uma campanha própria e escolher Excluir campanha; cancelar e conferir foco.
2. Confirmar Excluir definitivamente; conferir ocultação do conteúdo e andamento.
3. Pausar/fechar e retomar pelo Estúdio, sem reconstruir a campanha ou a origem.
4. Com resposta perdida, recarregar e confirmar o mesmo pedido preservado.
5. Conferir biblioteca, original e outra campanha; seus arquivos/conteúdos permanecem.
6. Conferir controles antigos: manter preserva o rascunho; confirmar encerra somente
   os snapshots mostrados. Um controle alterado por outra aba deve sobreviver.
