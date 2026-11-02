# Writer V2 — Transporte autenticado da edição de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano de origem**: [101 / M38c5c](../tasks/writer-v2/execucao/101-transporte-autenticado-da-edicao-de-lore.md).
- **Decisão**: [ADR 0116](../decisions/0116-authenticated-manual-lore-edit-transport.md).

## Objetivo e funcionalidades entregues

Ligar o coordenador de edição preparada à callable privada, com envelope
literal, operações fechadas e conta/contexto capturados. A integração fica
disponível na API da feature; o formulário ainda não foi ligado a esse fluxo.

bookLoreEdit aceita 18 operações manuais existentes, incluindo get metadata.
Autentica antes de analisar argumentos, exige IDs/referências manuais e recusa
criação/jobs reservados de análise, nomes arbitrários e UID no envelope.
Serviços nativos continuam decidindo CAS, origem, provas, adoção e cleanup.

Sessão cliente força UID capturado, combina guards e confere conta/contexto
antes/depois de I/O. Cada unidade usa SDK Firebase regional e timeout 130 s;
não há fallback. Retry e cancelamento do coordenador preservam seus contratos.

## Critérios de aceite

- [x] Contrato puro/imutável, métodos e envelope fechados.
- [x] UID autenticado e isolamento de jobs/filhos manuais.
- [x] Pedido/CAS/bytes encaminhados sem normalização.
- [x] Entry regional com App Check, sem segredos/provedor.
- [x] Headers privados no handler/erros de domínio e preflight SDK real.
- [x] Guard de conta/contexto/host, resposta tardia e pendência preservada.
- [x] Coordenador inteiro exercitado pelo roteamento novo.
- [x] SDK real no Chromium com multipart/retry/cancelamento.
- [x] Checks dirigidos, revisão e documentação.
- [ ] Host visual, recuperação protegida e sucesso com tokens reais.
- [ ] Demais integrações, rollout e validate integral de P1/F2-09/V2.

## Arquivos alterados

bookLoreEditTransportMethods e declaração MTS definem o contrato puro.
bookLoreEditTransport roteia serviços; index registra a callable e headers.
bookLoreEditService na feature lore implementa sessão SDK, com export público.
Dois arquivos Node novos, teste da sessão novo, entry e integração do
coordenador atualizados. Plano, ADR, README, arquitetura/testing, AGENTS e
registro de execução acompanham a mudança. Sem dependências ou Rules novas.

## Testes

**59 casos Vitest distintos positivos**, 10.10 s: 12 novos da sessão e 47
do coordenador executados pelo novo roteador. Incluem inline/v1/v2/criação,
literais, CAS, perdas de resposta, cancelamento concorrente e 9 MiB.
Após tipar os mocks, somente a sessão afetada foi repetida: **12/12**, 1.79 s.

```text
Test Files  2 passed (2)
     Tests  59 passed (59)
  Duration  10.10s
```

**17 casos Node distintos positivos**, em rodadas: dez da fronteira, seis
HTTP e um do entry. Rodada inicial de domínio/entry teve nove aprovações e
duas expectativas incorretas: UID inválido retorna unauthenticated e job
ausente na conta atual retorna null. Contratos foram conferidos e fixtures
corrigidas; os 16 casos então existentes passaram em 3192.1809 ms.

A prova de App Check foi fortalecida para conferir a mensagem genérica do
SDK, distinta do erro de domínio. Dois casos dirigidos passaram. Com o novo
preflight, o arquivo HTTP completo passou com **6/6**, 1398.2812 ms.
Repetições não aumentam a contagem de casos distintos.

Node cobre nomes desconhecidos/internos/herdados, envelope, UID, IDs e filhos
reservados, criação, fences reais/get, isolamento e origem de outro autor.
Callable exportada recusa App Check ausente/inválido sem eco de dados;
handler direto testa ausência de auth e argumentos antes de DB.
Preflight retorna origem/método/headers exigidos pelo navegador.

**Três smokes Chromium com SDK Firebase real e HTTP local positivos**:

```text
Chromium Firebase SDK HTTP scenario 1 passed: applied
Chromium Firebase SDK HTTP scenario 2 passed: applied
Chromium Firebase SDK HTTP scenario 3 passed: cancelled
```

O browser usa o SDK real, cliente C1/codec/coordenador reais e callable
Firebase real sobre serviços reais com double transacional. Texto multipart
Unicode/BOM/CRLF/escapes permanece literal e resumo/créditos ficam intactos.
Resposta simulada perdida após append confirmado repete o envelope exato.
Cancelamento avança por HTTP enquanto start ainda aguarda; resposta tardia
não reabre a operação.

O harness fixa autor fictício e desabilita App Check somente localmente.
Não certifica sucesso com tokens reais, UI, Rules ou Firestore nativo.
Falha inicial de rede era preflight OPTIONS não encaminhado pelo harness;
corrigido para todos os métodos. O SDK acrescenta status à mensagem simulada;
o harness passou a conferir código functions/unavailable e prefixo específico.
As três jornadas finais passaram. Logs/script fora do Git.

## Validações executadas

Lint dirigido, tipos e npm run build positivos. Foi adicionada declaração
MTS do contrato compartilhado e tipagem dos mocks, sem supressão de regras.
Build inclui smoke do bundle e conserva avisos de chunks grandes/imports
dinâmicos ineficazes. Arquitetura positiva e sintaxe dos 245 módulos Functions
positiva. Docs/formato/diff e varredura de segredos no fechamento.

Não repetimos emulador Firestore/Rules: este incremento roteia os mesmos
serviços e não muda transações, regras ou formato persistido. Isso não
substitui certificação integrada de P1. Suite completa/cobertura/validate
no fechamento do bloco, conforme autorizado. Sem CI/push/PR/merge/deploy.

## Revisão, limitações e próximo passo

Revisão conferiu allowlist antes de dispatch, UID sem alegação do body,
namespace manual em pais/filhos inclusive cleanup, ausência de transação/
capacidade injetável, encaminhamento literal e guards. Endpoint não alcança
produtores reservados da análise nem muda a política de recuperação.

Host visual e journal protegido após recarga continuam pendentes. Operação
permanece em memória e writeId identifica uma intenção imutável; transporte
não concede reserva global ou recuperação durável. Demais escritores/
consumidores/backup/ativação/rollout seguem necessários antes de habilitar
o produto. P1/F2-09/V2, fases 3–5 e condições humanas/comerciais abertos.

## Como conferir

Executar bookLoreEditTransport.test.mjs, bookLoreEditTransportHttp.test.mjs e
entry.test.mjs em functions/test com Node; bookLoreEditService.test.ts e
bookLoreEditOperation.test.mjs em src/features/lore/tests com Vitest.
Dev server permanece em http://127.0.0.1:5173/.
