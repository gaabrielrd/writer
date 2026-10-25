# Writer V2 — lore nativo nas referências de cenas e planejamento

- Data: 2026-10-25.
- Marco: P1 / M38c10.
- Plano: [129](../tasks/writer-v2/execucao/129-lore-logico-nas-referencias-de-cenas-e-planejamento.md).
- Decisão: [ADR 0149](../decisions/0149-native-book-lore-references.md).

## Resultado

Cenas e planejamento resolvem nome/categoria lógicos de fichas locais inline,
v1, v2 e criadas pelo produtor nativo. Não apresentam stub como nome vazio.
Opções omitem origens conhecidamente indisponíveis; vínculos existentes mostram
indisponibilidade sem expor nomes. Remoção explícita continua possível.

Criar vínculos e consultar índices inversos confere origem autorizada sem baixar
chunks de prosa. Texto/nome extenso não impede essa autorização. Vínculos,
índices, contadores e recibos permanecem atômicos e continuam por IDs.
Labels não são gravados na relação nem usados como fonte de escrita.

Listas de labels compartilham budget por página; não truncam um nome ou retornam
resultado parcial em falha. v2 não busca detalhes, aliases, resumo, notas ou
relações não pedidos. Base v1 tem certificação integral em fluxo. Cursores locais
observam relógio correto e nascimento do livro; índices inversos também observam
token nativo exato da ficha, incluindo alterações abaixo de um milissegundo.

## Critérios verificados

- [x] Inline/v1/v2/criação real: nomes literais, categoria e vínculos por ID.
- [x] Disponibilidade/inserção/índices inversos sem chunks de prosa.
- [x] >8 MiB/128 partes em labels certificados, sem inteiro de detalhes em RAM.
- [x] Campos v2 não pedidos permanecem sem download.
- [x] Ausente/deleted/deleting/rebalancing/tombstone/alheio/outro escopo sem nome.
- [x] Prova de criação e header inválidos/recriados rejeitados, sem fallback.
- [x] Remoção após revogação, sem perder fonte ou contadores.
- [x] Budget compartilhado, nome grande sem truncar, falha sem lista parcial.
- [x] Clock e identidades nativas invalidam cursores, inclusive submilissegundo.
- [x] Infraestrutura continua erro; rollback de último índice preserva todo efeito.
- [ ] Publicação/campanhas/demais consumidores/P1/V2 e gates continuam pendentes.

## Arquivos e validação real

Novo bookLoreReferenceRead reutiliza leitores C1/projeção autorizados.
Scenes e narrativePlanning integram origem/labels e observação de cursor.
Um arquivo Node e um SDK novos; plano/ADR/AGENTS/arquitetura/testes/índices
registram o alcance. Nenhuma Rule, RPC, DTO de entrada ou dependência mudou.

**60/60 Node**, quatro arquivos: 22 novos casos de bookLoreReferences e
38 regressões de scenes, narrativePlanning e adventureLoreCampaign.
Cobrem as quatro representações, índices reais preparados pelo serviço,
Unicode/BOM, ausência de texto em vínculos, >8 MiB/128 partes, privacidade de
campos não pedidos, revogação/remoção, prova recriada, corrupção após label,
retenção agregada, clock/nascimento/submilissegundo e infraestrutura sem fallback.
Primeiro setup usava IDs de operação curtos e foi corrigido para o contrato
existente; nenhum validador foi enfraquecido. Execução final sem falhas/skipped.

**8/8 SDK distintos**, três execuções direcionadas no Firestore 1.22.0 verificado,
projetos demo/loopback: quatro novos e quatro regressões selecionadas.
Novos: >8 MiB/128 partes e vínculo sem chunks; v2 seletivo/clock; criação real
com prova/tombstone/remoção; falha da última escrita de cada índice.
O último caso usa falha nativa de update em documento ausente para provar rollback:
timestamps de livro/cena/arco, links e recibos permanecem sem mudança.
Regressões: três de privacidade/indexação/resolução de planejamento e uma de
acesso direto a cenas/referências. Sem skipped/cancelled/falhas. Denegações
esperadas das Rules são parte dos testes, não falhas do runner.

Lint dos cinco arquivos de código, sintaxe dos três módulos, formato,
docs/arquitetura/diff conferidos no fechamento.
Artefatos externos writer-v2-portability-qa/m38c10-node-final.tap,
m38c10-node-initial.tap, m38c10-sdk.tap, m38c10-sdk.mjs e m38c10-sdk-emulator.log.

## Limitações e continuidade

Admin real é usado contra emulador; testes não comprovam credenciais/latência de
produção. Retenção lógica não é medição de heap. Nome completo não cabe em toda
resposta possível: excesso é erro explícito, sem cortar ou apagar a fonte.
Disponibilidade certifica a origem; não afirma certificação do texto não lido.

Não houve interface/tipo cliente alterado; browser/typecheck/build não repetidos.
Validate/cobertura global ficam no fechamento de P1; CI/remoto/deploy ignorados.
Cursores antigos podem exigir recarga por não conterem a prova nativa nova.
Referências seguem IDs autorizados atuais, não snapshots históricos.

Publicação/capturas de campanhas e demais consumidores da etapa 4, inventário
dos namespaces/escritores/exclusão, backup/restauração/drain/rollout/validate de
P1/F2-09, fases 3–5 e gates humanos/comerciais continuam necessários.
Auditoria de chaves históricas de produção não executada. Master e servidor
local preservados. Commit somente local.
