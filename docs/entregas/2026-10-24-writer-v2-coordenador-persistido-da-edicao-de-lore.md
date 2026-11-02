# Writer V2 — Coordenador persistido da edição de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [107 / M38c5i](../tasks/writer-v2/execucao/107-coordenador-persistido-da-edicao-de-lore.md).
- **Decisão**: [ADR 0122](../decisions/0122-persisted-coordination-of-manual-lore-edits.md).

## Objetivo e funcionalidades entregues

Adaptador compõe mapa, draft cifrado, core, checkpoints e transporte: caller
dirige initialize/advance/apply/cancel, conservando o handle após erro.
Reserva do journal é pré-requisito; o formulário existente ainda não usa
este adaptador. Nenhuma publicação ou implantação foi feita.

Input é congelado antes de await. Mapa precede obtenção da chave; draft e
baseline precedem produtores. Pedido exato entra no checkpoint cifrado e
no ledger antes de RPC. Resultado validado gera ponte metadata sem prosa/wire,
ligada à geração base, com no máximo uma página de controles e um ACK.
Checkpoint posterior, ACK, remoção da ponte e receipt local são atômicos.

Retomada recompõe resultado registrado sem repetir RPC; pedido incerto repete
bytes/CAS originais. Falha de save conserva dívida e bloqueia novos produtores.
Retry local não envia outra unidade. Ready permanece sem adoção até apply
explícito; pedido de apply já autorizado e incerto pode ser repetido.

Prefixo reaproveitado e active idempotente têm ciphertext verificado.
Corrupção em retry de ACK preserva antecessora; coleta só ocorre após o erro
específico de cópia substituída. Headers anteriores mantêm campos opcionais nulos.

Cancel síncrono do core e intenção durável não esperam produtor ou chave.
Worker metadata reconhece adoção vencedora e conserva produtor incerto.
Após revogação da origem, encerramento não obtém chave nem decripta.
Conta/contexto permanecem obrigatórios; signal bloqueia produção sem bloquear
o cleanup. Sessão Auth confere UID antes de vincular o journal reservado.

## Critérios de aceite

- [x] Mapa/draft/baseline antes de produção e checkpoint exato antes de RPC.
- [x] Parsers antes da ponte; checkpoint/ACK/receipt atômicos.
- [x] Retomada da ponte sem RPC e replay exato de pedido incerto.
- [x] Dívida local preservada sem avanço acidental.
- [x] Corrupção recusada antes de descartar antecessora.
- [x] Apply explícito, cancel em voo e chave pendente/negada.
- [x] Conta/signal, metadata sem prosa e literais multipart preservados.
- [x] Testes dirigidos, Chromium real e revisão documentados.
- [ ] Bootstrap reserva/chave, host visual e descarte/ciclo de vida integrado.
- [ ] Rollout, validate integral de P1 e conclusão de F2-09/V2.

## Arquivos alterados

Contratos de outcome, recuperação de ponte e controller persistido novos;
journal/checkpoint/mapa/sessão/barrel integrados. Testes do controller e vínculo
Auth, fixture de header atualizada. ADR, plano, arquitetura/testes/índices,
README e regra AGENTS. Sem backend, Rules ou dependências.

## Testes e validações

**161 Vitest distintos positivos em rodadas**, incluindo 43 novos do
controller, 26 da sessão (quatro novos) e 92 regressões de checkpoint, controles,
journal e sessão da chave. São 47 casos novos; retakes não somam casos.

- Rodada inicial: 27/28 positivos; corrigida a expectativa do teste para
  rejeição síncrona por troca de conta.
- Rodada controller/checkpoint/sessão: 77/77 em 20.28 s.
- Rodada controller/sessão/controles/journal/chave: 141/141 em 21.70 s.
- Rodada ampliada: 160/161 em 27.68 s. Após a mudança de coleta, a injeção
  do teste de prefixo passou a abortar antes do primeiro frame. Ajustado
  somente o ponto da falha para efetivamente corromper um prefixo escrito.
  As quatro suítes de regressão dessa rodada ficaram verdes (92 casos).
- Rodada final controller/sessão: **69/69 em 27.59 s**.
- Caso adicional dirigido de corrupção após ACK observado sem resposta:
  1/1, com 42 filtrados; já incluído entre os 43 casos, não é caso extra.
- Lint dirigido passou após remover um cast desnecessário.
- Build/typecheck inicialmente recusaram cast direto de mock parcial em
  quatro testes de vínculo; fixtures de teste tornadas explícitas.
  **npm run build final passou**, incluindo typecheck, bundle e smoke.
- Check de arquitetura/documentação e git diff --check passaram.
- Formatação dirigida conferida antes do commit; hooks mantidos.
- Avisos de chunks grandes e imports dinâmicos ineficazes permanecem no build.
- Não executados: suíte integral/coverage, backend, Rules ou E2E da aplicação
  completa. Validate integral no fechamento de P1.

A primeira retomada do ensaio Chromium após a mudança de coleta não atingiu
o abort planejado: a tentativa de gravação retornou coleta pendente antes
de criar a transação. O harness passou a isolar o abort da transação final
depois da coleta. **Retake final: 3/3 positivos no código final**; não é
considerada falha observada do produto nem prova da tela completa.

Três cenários Chromium positivos em página leve da mesma origem:
fechar/reabrir o processo com append multipart cuja resposta se perdeu;
abortar transação final de swap/ACK no IndexedDB e recuperar sem novo RPC;
revogar origem e cancelar entre reloads com zero getKey/decrypt.
WebCrypto, IDB e Web Locks reais; serviços servidor reais sobre double.
Não comprova tela completa, Firebase SDK/App Check, Rules ou produção.

Harness e perfil preservados fora do Git em writer-v2-portability-qa:
m38c5i-browser-persisted.mjs e m38c5i-browser-profile.
A execução não substitui testes do futuro formulário.

## Revisão, limitações e pendências

Revisão local do diff: escopo, guarda de identidade/conta após await,
ausência de prose/segredo na ponte, ordem antes de RPC, retry/ACK/GC e
cancel independente conferidos. Verificação adicional de antecessora antes
de coleta corrigida e coberta por teste; nenhum achado restante neste escopo.

Bootstrap e host visual vêm a seguir. Outros writers/consumidores,
backup/restauração/ativação, exclusão integrada da chave, rollout, P1/F2-09/V2,
fases 3–5 e validações humanas/comerciais continuam abertos.
CI, push, PR, merge e deploy não foram acionados. Validate integral fica no
fechamento de P1, conforme orientação do operador.

## Como verificar

Executar os testes direcionados do controller e serviços afetados, ou o
harness Chromium com o dev server em 127.0.0.1:5173. Pela interface atual,
não anunciar este novo ciclo como já integrado. No futuro host, conservar o
handle após falha, retomar na mesma conta após reautorizar a origem e usar
cancel para fechar jobs sem pedir chave antes de qualquer descarte.
