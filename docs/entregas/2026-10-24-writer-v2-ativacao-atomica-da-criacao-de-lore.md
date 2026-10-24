# Writer V2 — Ativação atômica da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [92 / criação L3B](../tasks/writer-v2/execucao/92-ativacao-atomica-da-criacao-de-lore.md).
- **Decisão**: [ADR 0107](../decisions/0107-native-book-lore-creation-activation.md).

## Objetivo e implementação

Confirmar a criação interna de uma ficha preparada pela reserva, sem cabeça
fictícia e com todas as mudanças ativas no mesmo commit. L1/L2/L3A preparam;
L3B confirma cabeça/geração/leases lógicas/clock/datas/recibo/criador juntos.

A ficha recebe createdAt/updatedAt da confirmação, com timestamp monotônico.
isPublic ausente/null continua privado; false/true são explícitos e auditados.
Nenhuma edição é publicada, revogada ou cobrada por criar a ficha.

Comprovante/prova privados fixam origem do criador, tentativa, geração e hash
da adoção. Conferem bindings, recibo/prova e evento originais, com nascimento
acoplado à cabeça. A confirmação histórica lê somente metadata e permanece
válida após segunda edição, coleta, retirada da ficha e exclusão do livro.

Reader de ID reservado exige cabeça e livro originais autorizados. Cabeça
recriada, mesmo idêntica, não concede leitura. Criador adopted recusa cancel
e novos produtores; tentativas não utilizadas continuam limpáveis. Exclusão do
livro reconhece sucesso e preserva os comprovantes, sem recriação por retry.

## Critérios

- [x] Cabeça criada com geração ativa, leases lógicas, clocks/datas e recibos atômicos.
- [x] Comprovante nativo do criador, sem dependência de prosa/cabeça/livro atuais.
- [x] Nascimento da cabeça validado nas leituras e na reedição.
- [x] Consentimento explícito, padrão privado, sem publicação ou débito.
- [x] Concorrência/replay/CAS/cancel e rollback integral em pontos de escrita.
- [x] Recursos recriados/órfãos recusados e perdas de prova não confirmam edição.
- [x] Segunda edição/coleta/retirada/exclusão conservam sucesso histórico.
- [x] Testes dirigidos Node/SDK, revisão e documentação.
- [ ] Demais writers/regras, consumidores/backup/cliente/recuperação e rollout.
- [ ] npm run validate/cobertura completos no fechamento de P1.

## Arquivos

Novos CreationAdoption, CreationActivation e CreationHead, prova pura de
tentativa e prova de operações da edição. Contrato puro de contexto de geração
foi movido mantendo reexports e hashes existentes. Criação/store/cleanup,
adoção/provas e leitor foram integrados. Novo helper e testes de ativação;
os testes de L3A agora verificam CAS inválido, substituindo o portão temporário.

Sem endpoint/UI, Rule, índice, dependência ou pacote novo.

## Validação local dirigida

- **40/40 novos Node**, 2014.1531 ms, na rodada final de criação.
  Primeira rodada: 37/37. Teste adicional de revisão reproduziu confirmação
  por recibo sem os dois comprovantes do criador. Corrigimos a guarda para
  exigir adoção nativa do criador; rodada final inclui esse caso e dois
  controles de órfãos. Teste de append usa pedido válido após adoção.
- **414/414 regressões Node**, 8408.872 ms, em 13 arquivos existentes:
  criação/composição/upload, leitores, inspeção, edições, exclusões e inventário.
  Total de **454 Node distintos**, sem somar repetições nem alegar rodada única.
- **6 SDK distintos positivos** no Firestore emulado 1.22.0 verificado por SHA,
  demo/loopback: primeira rodada com cinco casos (428369.1325 ms),
  quatro novos de ativação e a regressão L3A alterada; após endurecer a guarda,
  caso nativo dirigido (48809.6144 ms) confirma sucesso pós-exclusão e recusa
  replay quando faltam os comprovantes. Não repetimos casos não afetados.
- SDK comprova nascimentos acoplados, campos literais/Unicode/BOM/relações em
  duas páginas, clock único por retry concorrente, disputa de tentativas/cancel,
  rollback, reedição/retirada/exclusão, negação SDK e recursos recriados.
- Arquitetura: Verificação arquitetural OK.
- Sintaxe: Functions syntax checked: 225 modules; arquivo da guarda final
  também conferido individualmente.
- ESLint dirigido: positivo após remover import que passou ao helper extraído.
- Documentação, formato e git diff --check: positivos após redação final.

Os logs PERMISSION_DENIED do SDK são as negações esperadas e verificadas.
Logs de QA permanecem fora do repositório. Não houve teste pago ou dados reais.

## Revisão e limitações

A revisão encontrou e corrigiu a confirmação histórica por recibo isolado.
O loader da edição adopted de criação exige comprovante nativo do mesmo
criador/tentativa/token/nascimento antes de confirmar qualquer replay.
Não foi enfraquecido nenhum teste, limite de cobertura, hook ou contrato anterior.

L3B conclui o backend interno de criação junto de L1/L2/L3A; a interface ainda
não oferece esse fluxo. Demais escritores, Rules coordenadas/drenagem, IA/
captura/publicação, backup lógico/indexado, cliente/host/recuperação e
roteamento de preparações sem flag permanecem obrigatórios.

Sem TS/UI novos, não repetimos Vitest/tipos/build/browser. Validate integral
e cobertura ficam para o fechamento de P1, conforme autorização do operador.
Sem CI, push, PR, merge, deploy ou migração. P1/F2-09/Writer V2, comércio e
piloto humano continuam abertos.

## Como conferir

Executar functions/test/bookLoreCreationAdoption.test.mjs e os casos SDK em
tests/firestore/bookLoreCreationAdoption.rules.test.mjs com emulador demo e host
loopback. Testar criação, leitura e confirmação histórica pelo protocolo interno;
não simular uma cabeça manual. O dev server segue em http://127.0.0.1:5173/,
mas criação por esse protocolo ainda depende das integrações para a interface.
