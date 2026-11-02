# Writer V2 — Leitura lógica da análise de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [94 / A1](../tasks/writer-v2/execucao/94-leitura-logica-da-analise-de-lore.md).
- **Decisão**: [ADR 0109](../decisions/0109-logical-lore-analysis-context.md).

## Objetivo e implementação

Analisar o objeto lógico de fichas locais em vez do stub físico. Leitor interno
reutiliza C1 e confere inline, base v1, campos flat v2, relações paginadas e
criação ativada com prova nativa. Preserva texto literal/BOM, duplicatas, vazio,
ausências/remoções, datas e privacidade, sem regravar o original.

Corpos conferem SHA integral, Merkle, JSON canônico, domínio e escopo/nascimentos.
Budget da análise agrega 300000 bytes JSON consumidos, 512 partes externas e
512 páginas. Rejeita corpo externo acima do saldo antes de baixar chunks.
Contexto final tem até 300000 bytes UTF-8 e 500 entidades, com contabilização
linear e consultas físicas de até 16 documentos. Prefetch/metadata não são
alegados como tráfego máximo de 300000 bytes. Não altera limites de autoria/C1.

Revisão inclui nascimentos de livro/universo e nascimento/atualização/
representação das entidades, além dos clocks e conteúdo lógico. Revalida após
cada retorno do provedor e antes de persistir/repetir corpo. Fonte alterada
descarta resposta e impede próximo chunk/reparo. Ticket não guarda os corpos
usados como contexto. Recibo aplicado continua metadata histórica confirmável.

Aplicação a alvo local payload é recusada antes de writes/débito enquanto A2
não integrar o writer preparado multi-item. Lote misto também não é aplicado
parcialmente. Inline/global seguem seus contratos vigentes. Não há update de
campos inline sobre um stub nem declaração de escrita payload entregue.

## Critérios

- [x] Conteúdo lógico inline/v1/v2 e criação ativada chega ao gerador.
- [x] Campos/relações/presenças/datas/privacidade literais e completos.
- [x] SHA/Merkle/domínio/identidades e budget antes de chunks.
- [x] Consultas paginadas, limite agregado e nenhum contexto parcial ao provedor.
- [x] Revisão nativa detecta recriação mesmo com bytes/clocks idênticos.
- [x] Reautorização pós-I/O e de corpo repetido; recibo somente metadata.
- [x] Aplicação payload/mista recusa antes de alteração/débito.
- [x] Testes dirigidos, revisão e documentação.
- [ ] A2: preparação/adoção multi-item com crédito/recibo atômicos.
- [ ] Demais writers/consumidores/backup/cliente e validate integral de P1.

## Arquivos

Novo bookLoreLogicalRead interno e integração no snapshot/retornos/replay de
loreAnalysis. Fixture legada ganhou metadata nativa e paginação; novo helper,
testes Node e SDK. Nenhum endpoint, Rule, índice ou dependência novos.

## Validação local dirigida

- **54/54 Node**, 372.5111 ms, na rodada final: 30 casos novos e 24 de regressão
  da análise existente. Antes, dois casos de categoria inválida expuseram o
  código invalid-record do schema portátil; o leitor agora traduz esse erro
  de domínio para failed-precondition. Casos isolados e rodada final passaram.
- **6/6 SDK**, 43310.8667 ms, emulador Firestore 1.22.0 verificado por SHA,
  projeto demo/loopback. v1/v2, relações em duas páginas, escrita mista recusada,
  aplicação inline atômica/recibo pós-revogação, orçamento sem chunks/quota/
  ticket, revogação durante I/O, recriação global e criação nativa real.
- Arquitetura: Verificação arquitetural OK.
- Sintaxe: Functions syntax checked: 226 modules.
- ESLint dirigido: positivo.
- Docs/formato/diff: positivos após redação final.

Somente geradores stub nos testes; nenhuma IA paga ou dado real.
Logs locais de QA permanecem fora do repositório.

## Revisão, limitações e próximo passo

A revisão conferiu orçamento antes de baixar corpos externos, custo linear,
confirmação de origem após I/O e separação entre retorno de corpo e recibo.
Conservar a recusa explícita do writer payload até A2, sem fallback destrutivo.

A2 deve preparar campos/gerações e adotar todos os itens junto do crédito/
recibo, preservando até 50 itens, campos grandes e relações intocadas.
Não pode cobrar por unidade nem transformar o lote em aplicação parcial.
Outros consumidores, backup, cliente, namespaces de exclusão e ativação/
certificação de P1 continuam obrigatórios.

Quota de análise iniciada permanece usada se a resposta for descartada; não há
débito de crédito por analisar. Tickets prontos com contexto antigo exigem
nova análise. Recibos aplicados continuam confirmáveis como metadata.

Sem UI/TS novos, não repetimos Vitest/tipos/build/browser. Validate/cobertura
completos no fechamento de P1, conforme autorizado. Sem CI, push, PR, merge,
deploy ou migração. P1/F2-09/Writer V2 e condições humanas/comerciais abertos.

## Como conferir

Executar functions/test/bookLoreLogicalRead.test.mjs e a regressão
functions/test/loreAnalysis.test.mjs. SDK em
tests/firestore/bookLoreLogicalRead.rules.test.mjs exige demo/loopback.
Dev server permanece em http://127.0.0.1:5173/, sem implantação destas Functions.
