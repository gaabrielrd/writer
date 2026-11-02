# Writer V2 — Exclusão individual do lore completo

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [88](../tasks/writer-v2/execucao/88-exclusao-individual-do-lore-completo.md).
- **Decisão**: [ADR 0103](../decisions/0103-individual-book-lore-removal.md).

## Objetivo e funcionalidades implementadas

Permitir retirar e limpar uma ficha própria inline/payload v1/v2 sem deixar
pedidos antigos recriarem seu ID. É um serviço interno; o editor ainda não
oferece a operação ao usuário.

A retirada inicial exige inspeção ready/CAS da fonte, remove cabeça e cria
registro permanente/contexto/evento/âncora junto de clock/datas/marca do livro.
Consentimento lógico true revoga publicação e avança epoch; false/ausente
não usam default visual para revogar. Datas válidas do livro são preservadas.

Limpeza retomável cancela preparações/filhos/uploads/inspeções da ficha,
aposenta gerações e coleta descritores/partes/headers por metadata e cutoff.
Até 16 partes por unidade; header por último. Outras fichas e seus jobs ficam
intactos. Eventos/recibos/checkpoint acompanham a mesma transação dos filhos.

Tombstone, jobs, leases e controles permanecem fences. SDK não pode criar/editar
o ID retirado ou acessar os controles; leitor completo e aplicação Admin da
análise de lore recusam o ID, mesmo se uma cabeça reaparecer indevidamente.

Coletor genérico adia corpos dessa ficha. Quando o livro entra em deleting,
o inventário v3 assume a limpeza por handoff nativo. Consulta individual confirma
conclusão pelo controlador/checkpoint original depois que a raiz sai, preservando
recibos anteriores e sem executar de novo o cursor individual.

## Critérios do incremento

- [x] Retirada atômica com CAS, privacidade, clock e reserva permanente.
- [x] Retomada/recibos e sucesso histórico sem recriar ficha ou livro.
- [x] Limpeza inline/v1/v2, partes acima de 128, metadata-only e header por último.
- [x] Cancelamento de filhos parciais e preservação de outros escopos.
- [x] Identidade nativa, cutoff, leases e capacidade não copiável.
- [x] Bloqueio do coletor concorrente e passagem para exclusão do livro.
- [x] Rules/leitor/análise protegem o ID retirado; índice da consulta declarado.
- [x] Testes direcionados, revisão e documentação.
- [ ] Criação por reserva e integração completa antes de endpoint/UI.
- [ ] Validate integral no fechamento de P1.

## Arquivos alterados

Novos módulos bookLoreRemoval, Contracts, Store e Handoff; unidades compartilhadas
bookLoreCleanup e Scope. Integração nos quatro módulos bookLoreDeletion,
no coletor genérico, leitor completo e loreAnalysis. Rules/índice atualizados.

Testes novos Node/SDK e helper de remoção; contratos de custo do leitor v1/v2
passam a conferir exatamente uma consulta ao tombstone. A análise tem dois casos
novos de IDs retirados, sem débito. Sem dependências novas, cliente ou UI.

## Evidência Node

**303 casos Node distintos positivos**, em rodadas dirigidas:

| Grupo                                                               | Evidência real                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Limpeza do livro + primeira rodada do arquivo novo                  | tests 54, pass 28, fail 26, duration_ms 1907.5401           |
| Arquivo novo após correção do relógio                               | tests 31, pass 31, fail 0, skipped 0, duration_ms 1568.5414 |
| Leitores, adoção, inventário, upload, inspeção e análise            | tests 244, pass 241, fail 3, duration_ms 4150.7151          |
| Três custos de leitura corrigidos + quatro casos adversariais novos | tests 7, pass 6, fail 1, duration_ms 336.1614               |
| Consulta de outra conta com contrato corrigido                      | tests 1, pass 1, fail 0, skipped 0, duration_ms 259.0793    |
| Coletor após guarda de remoção                                      | tests 30, pass 30, fail 0, skipped 0, duration_ms 411.5036  |
| Guarda nova + três cancelamentos/adoção afetados                    | tests 4, pass 4, fail 0, skipped 0, duration_ms 541.0339    |

A união é 23 casos existentes de exclusão do livro, 36 do arquivo novo e
244 dos sete arquivos de regressão, incluindo dois novos da análise.
Repetições não aumentam o total; não houve uma rodada única dos 303.

Falhas corrigidas:

- O novo serviço passou número a date, que exige função relógio. Corrigido no
  código; a reexecução do arquivo novo passou nos 31 casos então existentes.
- Três contratos de custo precisaram contar a leitura adicional do tombstone.
  Mantêm contagem exata, constante e um único chunk; não foram relaxados.
- Um teste esperava rejeição de consulta em outra conta, mas o namespace privado
  corretamente retorna null. Ajustado para conferir ausência sem revelar o job.

Cobrem privacidade true/false/ausente, inline/v1/v2, gerações/páginas extensas,
141 partes, preparação parcial, outras fichas e jobs posteriores ao cutoff,
rollback inicial/cleanup, CAS/concorrência/replay, fonte alterada, clocks inválidos,
leases desconhecidas e chunks extras. Livro/contexto/estado/tombstone/corpo/
parte/inventário/descritor recriados não herdam autorização.

## Evidência SDK

Firestore 1.22.0 com SHA verificado, projeto demo e loopback dedicados.
**Cinco casos distintos positivos**, em duas rodadas:

- Primeira: tests 4, pass 3, fail 1, duration_ms 90906.7983.
- Corrigido o caso afetado e acrescentada a guarda do coletor: tests 2,
  pass 2, fail 0, skipped 0, duration_ms 43902.2655.

A primeira falha revelou variável incorreta na nova condição das Rules
(entityId em rota loreId), impedindo também a criação de uma ficha de controle.
Corrigida a Rule; somente esse caso e o novo foram executados depois.

1. Start realmente concorrente produz uma retirada/clock; raiz/contexto/
   tombstone/estado compartilham timestamp. Público positivo antes e negado
   depois. Criar outra ficha funciona com clock correto; reutilizar o ID retirado
   falha no mesmo gate. Controles são privados.
2. Rollback nativo de coleta reverte bytes/inventário/checkpoint/recibo.
   Retry concorrente confirma uma unidade; deleting do livro bloqueia a unidade
   individual, handoff assume e conclusão histórica não recria raiz.
3. Fonte legada com 141 partes é limpa por lotes de até 16, header por último,
   preservando o livro.
4. Tombstone recriado não confirma histórico; cabeça recriada continua recusada
   pelo leitor completo e fica preservada para reconciliação.
5. Coletor genérico protege cabeça ativa antes e adia por lore-removal depois,
   sem writes; controlador individual conclui a limpeza normalmente.

Denies esperados são assertFails. Sem produção, IA ou pedidos pagos.

## Checks, revisão e limites

Lint dirigido, arquitetura e sintaxe dos 210 módulos de Functions passaram.
Formatação, links, equivalência dos índices anteriores e diff finais conferidos
antes do commit. O índice novo está declarado, sem implantação.

Sem UI/TypeScript novos, não repetimos Vitest, tipos, build ou navegador.
Validate/coverage integrais permanecem no fechamento de P1, conforme a política
do operador. Dev server continua disponível e não representa backend implantado.

Chunks sem header/inventário/prova de atribuição não são apagados como se
pertencessem à ficha; o finish do livro inteiro continua bloqueando órfãos.
Não há purge de fences nem autorização de origem externa.

Criação por reserva, demais writers/consumidores/backup lógico/indexado, cliente/
recuperação e roteamento de preparações sem marca seguem antes de endpoint/UI.
Campos grandes restantes, certificação/ativação de restauração, capa/personas,
host/roundtrip/validate e fases posteriores permanecem pendentes.
P1/F2-09/Writer V2 continuam abertos. Somente commit local, sem CI remota/deploy.

## Como verificar

O arquivo functions/test/bookLoreRemoval.test.mjs cobre o protocolo em unidades.
Os casos SDK ficam em tests/firestore/bookLoreRemoval.rules.test.mjs e exigem
emulador demo dedicado em 127.0.0.1, como descrito em [testes](../testing.md).
Não testar limpeza com livros reais; o incremento ainda não habilita uma ação de UI.
