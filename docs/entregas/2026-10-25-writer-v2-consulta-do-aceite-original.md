# Writer V2 — Consulta do aceite original da edição de lore

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [124 / M38c5z](../tasks/writer-v2/execucao/124-consulta-do-aceite-original-da-edicao.md).
- **Decisão**: [ADR 0139](../decisions/0139-book-lore-edit-original-outcome.md).

## Objetivo e funcionalidades entregues

Confirmar se uma edição manual específica foi aplicada, mesmo com resposta
perdida ou depois de recarregar, consultando suas provas originais no servidor.
Não reenviar apply nem abrir rascunho/conteúdo para descobrir o resultado.

Callable separada bookLoreEditOutcome e método outcome da sessão Auth.
Retorno fechado com escopo, fase, campos alterados, privacidade antes/depois
e tokens das provas. UID e identidade manual derivados; nascimentos nativos
de recibo/evento e hashes conferidos. Criação usa seu protocolo próprio.

Esta é uma dependência de visibilidade em lote. Nenhuma UI foi montada.

## Critérios de aceite

- [x] Consulta metadata sem writes, prosa, caminhos, corpos ou chaves.
- [x] Identidade/escopo/token original e provas de nascimento conferidos.
- [x] Resposta perdida consultável sem replay ou fallback.
- [x] Prova original preservada após outra edição, coleta e ausência controlada.
- [x] Provas ausentes/recriadas e tokens divergentes recusados.
- [x] Null/pending/cancel não apresentados como aplicação.
- [x] Auth exato antes/depois, DTO fechado, App Check e cache privado.
- [x] Formatos cifrados e conjuntos 18/22/7 preservados.
- [ ] Seleção/UI de visibilidade e composição/ativação do compêndio.
- [ ] Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates.

## Arquivos alterados

| Grupo                                              | Mudança                            |
| -------------------------------------------------- | ---------------------------------- |
| functions/src/bookLoreEditOutcome.mjs e index.mjs  | Consulta e callable                |
| Lore EditOutcome/EditService                       | Contratos do cliente e sessão Auth |
| Testes Outcome/HTTP/Service e harness              | Provas, escopo e cliente real      |
| tests/firestore/bookLoreEditOutcome.rules.test.mjs | SDK/Admin/Rules no emulador        |
| Plano/ADR/AGENTS/arquitetura/testes/execução       | Contrato, evidência e continuidade |

## Testes e resultados reais

**147 testes distintos positivos: 66 novos e 81 regressões.**

| Execução dirigida                               | Resultado                                                    |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Node bookLoreEditOutcome.test.mjs               | 28/28 novos, 981.7274 ms                                     |
| Node OutcomeHttp + EditTransport + EditAdoption | 56/56, 5669.4743 ms; quatro novos HTTP                       |
| Vitest EditOutcome + EditService                | 60/60; 26 novos do cliente, cinco novos Auth e 29 regressões |
| SDK Firestore local                             | 3/3 novos, 110606.9135 ms; nenhum skip                       |

```text
ℹ tests 28
ℹ pass 28
ℹ fail 0

ℹ tests 56
ℹ pass 56
ℹ fail 0

Test Files  2 passed (2)
Tests  60 passed (60)

ℹ tests 3
ℹ pass 3
ℹ fail 0
ℹ skipped 0
```

Backend: inline/v1/v2, ready sem aceite, resposta perdida, UID/identidade
derivados, tokens, DTO fechado, ausência/órfãos, seis corrupções de provas,
criação recusada e cancel/fence sem sucesso. Prova original preservada após
outra edição, aposentadoria e coleta efetiva do corpo antigo.

Cliente: serviço nativo atravessa parser de produção, mesma fórmula SHA e
pedido original, respostas/propriedades extras rejeitadas, congelamento,
guard, erro sem retry, fases pendentes e tokens fixados. Sessão confere
substituição de actor inclusive com mesmo UID; perfil do mesmo actor preserva.

SDK real no emulador Firestore 1.22.0, loopback e projeto demo: consulta
proibida de gravar, sem leituras da cabeça/livro/corpos, tokens históricos
após segunda edição/GC/ausência, e recibo/âncora recriados com mesmo dado mas
novo createTime recusados. Rules existentes recusam leitura direta de job
e recibo pelo proprietário e anônimo. Nenhuma Rules foi alterada.

HTTP: handler exportado exige Auth e contrato fechado com no-store/Vary;
SDK recusa App Check ausente/inválido. HTTP de sucesso usa Auth fixo somente
na fixture local. Não comprova token/attestation/credenciais de produção.

A primeira rodada nativa teve 24/26: a fixture v2 tem consentimento inicial
false e o helper cancel exige progress explícito. Corrigidos esses dois
testes; rodada final 28/28. Lint/tipos revelaram fronteira .mjs sem declaração,
mocks sem Promise e assinatura de guard inferida never; corrigidos no harness/
testes, sem suprimir regras ou alterar comportamento para satisfazê-los.

## Validações executadas

- Lint dirigido dos arquivos alterados: positivo.
- npm --prefix functions run check: 255 módulos positivos.
- Build (npm run build): tipos, bundle e smoke positivos; 2962 módulos transformados.
- Formatação, arquitetura, links de docs e diff: conferidos no fechamento.
- npm run validate completo não executado nesta unidade, reservado ao
  fechamento do grande bloco P1 por decisão explícita do operador.

```text
Functions syntax checked: 255 modules
2962 modules transformed.
Smoke test do bundle OK.
```

Build mantém avisos já existentes de chunks maiores que 500 kB e imports
dinâmicos também estáticos. Sem nova dependência/configuração/secreto.

Artefatos fora do Git em writer-v2-portability-qa:
m38c5z-vitest.json, m38c5z-sdk.mjs, m38c5z-sdk-emulator.log e
m38c5z-sdk-result.json. O runner foi reaproveitado de M38c5w; após a execução
foi corrigido somente o rótulo final do log para M38c5z, sem repetir os testes.

## Fora do escopo e limitações

Não autoriza ler conteúdo atualmente indisponível, cancelar efeito aceito,
restaurar cabeça, reenviar apply ou inferir atomicidade de seleção.
Null só confere pai/filhos imediatos e não é certificado de cancelamento.
Chamadores devem fixar os tokens observados.

A ausência de livro/cabeça no teste é controlada; não certifica o protocolo
integral de exclusão do livro. Lifecycle, consumidores, backup, rollout e
validate de P1 continuam pendentes, assim como visibilidade em lote,
compêndio e demais fases/gates humanos/comerciais da V2.

Sem mudança visual, novo teste Chromium, CI, push, PR, merge ou deploy.

## Como conferir

Em testes dirigidos, iniciar uma edição real, aplicar uma vez e consultar
o mesmo escopo/writeId/editId/startHash por uma nova sessão outcome.
Fixar jobToken/outcomeToken retornados e repetir somente a consulta.
Deve confirmar o recibo original, sem nova adoção ou incremento de clock.
Serviço ainda depende de deploy próprio para uso remoto; não houve deploy.
