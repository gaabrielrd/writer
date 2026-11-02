# Writer V2 — Coordenação da edição preparada de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano de origem**: [100 / M38c5b](../tasks/writer-v2/execucao/100-coordenacao-da-edicao-preparada-de-lore.md).
- **Decisão**: [ADR 0115](../decisions/0115-unit-coordination-of-book-lore-edits.md).

## Objetivo e funcionalidades entregues

Coordenar no cliente os serviços existentes de edição preparada, mantendo a
intenção e requisição exatas. Cada avanço executa até uma unidade. Ready
preserva a fonte; somente apply explícito adota a edição.

Plano/manifestos/IDs congelados antes de RPC; retry conserva método, bytes,
operationId e CAS. Iteradores sequenciais não reserializam o prefixo por parte.
Cancelamento fecha produção imediatamente e usa canal independente com RPC
pendente. Fecha pai antes dos campos/inspeção, cerca filhos não iniciados
e confirma adoção própria quando ela venceu. Respostas tardias não reabrem.

Snapshot tem metadata limitada, sem prosa/base64/chaves ou ponteiros físicos;
controles completos são consultados em páginas de até 50. Cursores evitam
percorrer a lista a cada parte. Terminal libera referências internas aos
codecs sem prometer apagamento físico da memória.

## Critérios de aceite

- [x] No-op sem RPC e plano/manifestos imutáveis antes do envio.
- [x] Preparo por unidade, ready sem adoção e apply explícito.
- [x] DTOs fechados e identidade/token/contagens conferidos.
- [x] Retry idêntico de produção, aplicação e cleanup.
- [x] Cancelamento independente, cercas e resposta tardia.
- [x] Corridas aplicar/cancelar, revogação, abort e troca de conta.
- [x] Partes sequenciais de 9 MiB e status limitado com 100 uploads.
- [x] Serviços reais em Vitest, Chromium, revisão e documentação.
- [ ] Host visual, endpoints autenticados e recuperação após recarga.
- [ ] Integrações restantes e validate integral de P1/F2-09/V2.

## Arquivos alterados

bookLoreEditOperation coordena unidades; bookLoreWriteProgress valida DTOs
metadata. O hasher canônico existente recebe exportação interna, sem mudar
o codec. A interface pública exporta operação/tipos; teste integrado novo.
Plano, ADR, AGENTS, README, arquitetura, testing e registro atualizados.
Backend, Rules e dependências não mudaram.

## Testes

**65 casos Vitest distintos positivos**: 47 novos do coordenador e 18
regressões do codec/roundtrip, em rodadas dirigidas. A rodada final após
limitar status e adicionar cursores registrou:

```text
Test Files  1 passed (1)
     Tests  47 passed (47)
  Duration  5.17s
```

As 18 regressões passaram em 6.50 s. C1, inspeção, upload, selo, reserva,
composição e adoção reais sobre double transacional: inline/v1/v2/criação,
literais intocados, páginas, remoção, privacidade, clock único, créditos,
perdas de resposta, cancelamento em oito marcos e RPCs pendentes/tardios.

Texto de 9 MiB percorre 145 partes e um retry idêntico, com leitura final
literal. Status com 100 uploads de relações permanece limitado nos avanços;
controles são imutáveis e paginados.

Seis falhas iniciais de cleanup comparavam inventário/leases permanentes
com ausência de recursos. Fixture corrigida para comparar corpos/chunks
físicos e conferir permanência das provas. Um caso parava após o pai já
limpar os campos e não alcançava cleanup do filho; foi movido ao marco correto.
Rodadas afetadas e final passaram. Repetições e filtrados não são novos casos.

**Três smokes Chromium headless positivos**, repetidos após os cursores:
apply/leitura, append confirmado com resposta perdida/retry exato, e
cancelamento com start de inspeção ainda aguardando envio.

```text
Chromium real-services operation scenario 1 passed: applied
Chromium real-services operation scenario 2 passed: applied
Chromium real-services operation scenario 3 passed: cancelled
```

Browser importa módulos reais pelo Vite e usa bridge Node com serviços reais
sobre double transacional. Não certifica HTTP/autenticação, Rules/emulador,
interface visual ou piloto humano.

## Validações executadas

Lint dirigido, tipos e npm run build positivos após ajuste final, incluindo
smoke do bundle. Arquitetura/docs/formato/diff conferidos no fechamento.
Build mantém avisos de chunks maiores que 500 KiB e imports dinâmicos
ineficazes; limites não foram reduzidos. Logs/script Chromium fora do Git.

Não repetimos SDK/Rules: backend e regras não mudaram. Suite completa,
cobertura e npm run validate ficam no fechamento de P1, conforme decisão
do operador. Sem CI, push, PR, merge ou deploy.

## Revisão, limitações e próximo passo

Revisão conferiu CAS original, pedido congelado antes de await, validação
metadata, guard antes/depois de RPC, canais independentes, confirmação
própria de adoção, não reabertura tardia, partes sequenciais e status limitado.
Sem dependências novas ou imports internos de outra feature.

Operação em memória exige writeId exclusivo por intenção imutável. IntentHash
ajuda o futuro journal, mas não reserva writeId globalmente. Snapshot/controles
não são backup nem autorização, nem recuperam após recarga. Host visual,
endpoints autenticados e persistência protegida continuam pendentes.

Criação/exclusão/análise no cliente, demais consumidores/escritores, backup
lógico/indexado, ativação/rollout e certificação integrada permanecem necessários.
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais continuam abertos.

## Como verificar

Executar bookLoreEditOperation.test.mjs em src/features/lore/tests com Vitest;
para regressão codec/C1, bookLoreWritePayload.test.mjs e
bookLoreWriteRoundtrip.test.mjs. Dev server em http://127.0.0.1:5173/.
