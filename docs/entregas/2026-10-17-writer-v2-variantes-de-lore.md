# Writer V2 — Variantes particulares de lore da campanha

- **Data:** 2026-10-17
- **Branch:** `codex/writer-v2`
- **Plano de origem:** [F2-07 C2](../tasks/writer-v2/execucao/17-variantes-de-lore-da-campanha.md)
- **Estado:** validado localmente; CI do novo head pendente. F2-07 continua em execução.

## Objetivo

Permitir que o mestre adapte fichas inteiras somente na própria mesa, preservando
a aventura original, a base congelada e outras campanhas. Recuperar pedidos sem
resposta sem persistir texto derivado ou chaves no navegador.

## Funcionalidades entregues

- **Lore da mesa** — painel separado da Base congelada, com páginas de fichas
  ativas e retiradas, estados de carregamento/erro/vazio e nova consulta explícita.
- **Variante inteira** — nome, outros nomes, categoria, resumo, detalhes,
  aparência, personalidade, história, anotações e relações particulares. Nomes
  iguais não resolvem vínculos; somente fichas capturadas autorizadas são alvos.
- **Retirar, restaurar e descartar** — retirada conserva o modo anterior;
  restauração o recupera. Descarte volta à base autorizada e apaga o corpo local,
  mantendo revisão contínua para impedir reaplicação por pedido antigo.
- **Recuperação protegida** — IndexedDB conserva controles e ciphertext binário,
  com Web Locks por conta/campanha. A chave de cada operação fica no servidor e
  só chega à memória após autorizar novamente ficha e todos os alvos congelados.
- **Confirmação e encerramento** — o cliente confere identidade e conteúdo,
  persiste a confirmação antes de fechar a chave e pode encerrar explicitamente
  um pedido sem recuperar texto. Resposta perdida não transforma consulta em
  cancelamento. Trocas de conta/base/projeção invalidam respostas em voo.
- **Notas próprias preservadas** — continuam em recurso independente, inclusive
  quando a origem da base ou o lore derivado deixam de estar disponíveis.

## Critérios de aceite

- [x] Duas campanhas isolam variantes/retiradas; original e base permanecem íntegros.
- [x] Substituição inteira preserva prosa Unicode, limites e relações explícitas.
- [x] Retirar/restaurar conserva bodyRevision; descarte não reinicia a revisão.
- [x] CAS e replay não sobrescrevem edição posterior nem ressuscitam conteúdo.
- [x] Origem/ficha/alvos indisponíveis não devolvem corpo, nome de relação ou chave.
- [x] Ciphertext chega ao IDB antes do envio, somente após transaction.oncomplete.
- [x] Recuperação distingue pedido ainda não enviado de commit sem resposta.
- [x] Encerramento da chave acontece depois da confirmação local persistida.
- [x] Reserva entre abas, autorização tardia e indisponibilidade de recursos seguros têm controles.
- [x] SDK direto nega corpos, overlays, controles e chaves; notas C1 são preservadas.
- [x] Validate completo, revisão e navegador dirigido passaram localmente.
- [x] Commit e push conferidos no SHA 16d90b9.
- [ ] CI do novo head: conferir no PR.

## Arquivos alterados

| Área                                                                     | Mudança                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/features/campaign-lore/`                                            | Contrato público, painel, formulário, controlador, serviços de API/cripto/IDB e testes.     |
| `src/features/campaigns/components/CampaignPage.tsx`                     | Compõe o painel quando há base ativa, sem alterar o leitor B.                               |
| `functions/src/campaignLore*.mjs`                                        | Leitura, projeção e escritores transacionais de variantes.                                  |
| `functions/src/campaignVariantRecovery*.mjs`                             | Descriptor, chave, AAD, confirmação, cancelamento e headers da resposta.                    |
| `functions/src/campaignIdentity.mjs`                                     | Extrai o token preciso já usado por notas, sem mudar seu digest.                            |
| `functions/src/index.mjs`, `functions/package.json`                      | Registra oito callables e sua verificação de sintaxe.                                       |
| `functions/src/campaignBaseContracts.mjs`, `campaignNotesContracts.mjs`  | Expõe snapshot interno e reutiliza identidade, preservando DTOs anteriores.                 |
| `functions/test/`, `tests/firestore/campaignLore.rules.test.mjs`         | Contratos, HTTP real, SDK Admin/cliente e regressões C1/B.                                  |
| `firestore.indexes.json`                                                 | Desabilita índices de chave, alvos congelados, corpo e manifesto privados.                  |
| `e2e/visual/campaign-lore.visual.ts`, fixtures e `vite.visual.config.ts` | Jornadas e alias somente do transporte; identidade comum da campanha nas fixtures.          |
| `AGENTS.md`, README, arquitetura, testes, ADR 0033 e planos              | Contratos implementados, estado real e pendências. Também registra CI verde anterior de C1. |

## Testes

| Teste                                                 | Tipo       | O que cobre                                                                       |
| ----------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `functions/test/campaignLore.test.mjs`                | Servidor   | Entidade inteira, modos, revisão/corpos, CAS/replay, limites e projeção.          |
| `functions/test/campaignVariantRecoveryHttp.test.mjs` | HTTP real  | Resposta da chave com private,no-store, incluindo erro no callback.               |
| `tests/firestore/campaignLore.rules.test.mjs`         | SDK real   | Quatro casos C2 com regras e Firestore reais; mais quatro regressões de notas.    |
| `src/features/campaign-lore/tests/`                   | Cliente    | Formulário, seleção, recuperação, sessão, DTOs e cripto.                          |
| `src/features/campaigns/tests/CampaignPage.test.tsx`  | Integração | Painel pela API pública sem substituir a base ou notas.                           |
| `e2e/visual/campaign-lore.visual.ts`                  | Chromium   | Quatro jornadas nos seis projetos: três temas, desktop/celular, teclado e 320 px. |

Saída real do fechamento completo:

```text
Test Files  167 passed (167)
Tests       1620 passed (1620)
Duration    159.98s
Statements  : 90.79% (12650/13932)
Branches    : 84.71% (10954/12931)
Functions   : 90.35% (3318/3672)
Lines       : 93.37% (11556/12376)
scripts:   tests 77, pass 77, fail 0, duration_ms 9077.5239
Functions: tests 311, pass 311, fail 0, duration_ms 8947.9835
✓ built in 2.30s
Smoke test do bundle OK.
```

## Validações executadas

| Comando/controle               | Resultado real                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run validate`             | Exit 0; inclui skills, arquitetura, docs, estilo, formato, lint, cobertura, scripts, Functions/sintaxe, tipos, build e smoke.                                   |
| Servidor dirigido C2/HTTP/C1/B | 33/33: 12 novos contratos, dois HTTP, oito notas e onze leitores B.                                                                                             |
| Harness Firestore C2+C1        | 8/8, zero falhas/skips, 13.701,8347 ms; emulador encerrado, sem Storage.                                                                                        |
| Chromium C2                    | 24 positivos únicos: dois reutilizados de desktop-stable, dois corrigidos em desktop-after-focus, vinte em remaining; nenhum retry/skip/flaky nesses positivos. |
| Adaptadores Chromium           | Dois positivos distintos com Web Crypto e IndexedDB reais; quota injetada, sem alegar disco cheio.                                                              |
| Regressão Chromium C1          | 1/1, 7.470,891 ms, após compartilhar identidade das fixtures.                                                                                                   |
| Controles de fixture           | C1 5/5 e C2 5/5. Não constituem prova de autorização do servidor.                                                                                               |
| Revisão visual                 | Seis capturas finais em 320 px revisadas; raiz também inspecionou três delas.                                                                                   |
| Revisão independente           | Achados de cliente/servidor/QA corrigidos e reconferidos; revisão final sem P0/P1/P2 concreto remanescente.                                                     |

Tentativas negativas foram preservadas. A primeira validação iniciada foi
interrompida para corrigir o cliente. A seguinte passou 1.614 testes, mas falhou
na cobertura de funções (89,16%). Seis testes de comportamento fecharam a lacuna;
limites, exclusões e timeouts foram mantidos. No navegador, foram corrigidos foco
do modal e tratamento de DOMException de quota, repetindo somente os afetados.
Uma expectativa da fixture foi corrigida para a mensagem real. O primeiro percurso
foi interrompido para aplicar a proteção contra projeção tardia; não é um positivo.

Evidências locais ficam em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-campaign-lore-validate-coverage-final.log`,
`writer-v2-campaign-lore-sdk.log` e `writer-v2-campaign-lore-qa/qa-summary.json`.
O SDK e os percursos de produto foram preservados após alterações somente em testes.

## Fora do escopo

Comparação/adoção de nova base, exclusão integral da campanha, criação de lore
independente, imagens de variantes, IA, promoção de cânone, sessões, convites,
compartilhamento e comércio. Essas obrigações continuam nos respectivos incrementos.

## Limitações e pendências conhecidas

- Recuperação integral só é garantida após o seal persistido; campos anteriores
  a esse ponto ficam em memória. Sem autorização/conexão atual, não há recuperação
  de texto derivado. Revogação não apaga bytes já recebidos numa sessão autorizada.
- Sem IndexedDB, Web Crypto ou Web Locks, leitura online continua e envios ficam
  bloqueados. Quota pode falhar sem truncar ou enviar antes da persistência.
- Chaves pendentes ainda não têm TTL; exclusão integral futura precisa incluí-las.
  C3 deve tratar operações da base anterior sem transferir chave/ciphertext/revisão.
- No-store foi observado no callback HTTP real; não prova recusas anteriores do
  framework nem headers de uma implantação em produção.
- Navegador usa APIs reais de persistência/cripto/lock, com servidor simulado pela
  fixture. Inspeção de plaintext exclui writer.visual.* e não imprime dados/chaves.
  Autorizações e negações diretas reais são comprovadas separadamente pelo SDK.
- Build preserva avisos existentes de chunk grande e importação mista do exportador
  DOCX. Nenhuma dependência nova, merge ou deploy. Produção depende de implantação
  conjunta autorizada dos callables e configuração correspondente.

## Como verificar manualmente

1. Criar duas campanhas da mesma aventura; abrir Lore da mesa e adaptar uma ficha.
2. Conferir que original, Base congelada e segunda campanha conservaram o conteúdo.
3. Retirar/restaurar a ficha, depois descartar a variante com confirmação explícita.
4. Simular resposta perdida, recarregar e recuperar o mesmo pedido protegido.
5. Tornar a origem/alvo indisponível: nenhum texto recuperado deve aparecer; notas
   próprias continuam editáveis e o pedido pode ser encerrado explicitamente.
6. Repetir por teclado e em 320 px; fechamento do modal devolve foco à ficha.

## Publicação no PR — 2026-10-17

Commit `16d90b91718dad9e06df64d191dc0473f989dcd6`, 49 arquivos, 7.459 inserções e
81 remoções. Pre-commit/commit-msg passaram. Pre-push preservado: tipos verdes,
167 arquivos/1.620 testes em 116,97 s. SHA confirmado por ls-remote; worktree
limpo após envio. Checkout original `master 522ccaa` preservado e limpo.

[PR 21](https://github.com/gaabrielrd/writer/pull/21) permanece aberto em rascunho.
[CI 39085289874](https://github.com/gaabrielrd/writer/actions/runs/39085289874) e
[regras 39085290023](https://github.com/gaabrielrd/writer/actions/runs/39085290023)
estavam em execução na primeira consulta; não constituem aprovação remota.
Comparação/adoção e exclusão integral continuam pendentes. Sem merge ou deploy.

Consulta intermediária dos checks de `16d90b9`: Validate Node 22 e 24, auditoria,
produção Chromium e regras concluídos com sucesso. Logs reais: produção 7/7,
19,3 s; Firestore 120/120, zero falhas/skips, 51.036,07656 ms. Oito shards visuais
ainda em execução; esses resultados parciais não encerram a CI geral.

## Correção dirigida após a CI — 2026-10-17

A CI de 16d90b9 terminou com falha em seis shards, todos no mesmo caso B:
`campaign-base.visual.ts:186`, seletor global de “Lia referenciada” encontrava
dois botões, na Base congelada e no novo Lore da mesa. O teste passou a localizar
esse botão dentro do cartão identificado pelo heading da Base congelada. Foram
preservadas as verificações de conteúdo, isolamento e ausência de lore transitivo;
nenhum timeout, retry ou comportamento do produto foi alterado.

Somente esse caso foi repetido nos seis projetos: **6/6**, 47,8 s, zero
falhas/skips/retries. Evidência: `writer-v2-base-ci-fix.log` e
`writer-v2-base-ci-fix-results.json` na pasta de artefatos acima. Correção será
enviada isoladamente dos arquivos C3A em implementação; CI do novo head continua
pendente até confirmação dos seus checks.
