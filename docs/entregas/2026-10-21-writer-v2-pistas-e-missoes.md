# Writer V2 — Pistas, missões e pendências da campanha

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2
- **Plano:** [F2-08 S3](../tasks/writer-v2/execucao/24-pistas-missoes-e-pendencias.md).
- **Estado:** implementado e validado localmente em `a9b588a`; CI geral falhou por
  timeouts visuais, com correção visual validada localmente; CI do novo head pendente no
  [PR #21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).

## Objetivo

Preparar pistas e missões próprias reutilizáveis entre sessões, acompanhar seus
estados e retomar pendências, preservando autoria e independência da aventura.

## Funcionalidades entregues

- Pistas com texto, condição e destinatário; estados Pendente/Tratada.
- Missões com descrição, consequências possíveis e os cinco estados aprovados:
  Disponível, Em andamento, Concluída, Falhou e Abandonada. Reabertura manual.
- Catálogo da campanha com ordem por tipo e filtro Todos/Pendentes. Estados e
  textos são compartilhados pelos vínculos às sessões após consulta explícita.
- Retomada acrescenta vínculo sem copiar item nem retirar vínculos anteriores.
  Sessão tem ordem mista de pistas/missões. Desvincular conserva o item.
- Excluir sessão conserva os itens e corpos da campanha. Excluir item apaga seu
  corpo e deixa vínculos neutros/removíveis, sem conservar título antigo.
- Editor próprio estável ao salvar S1/atualizar base, CAS congelado, pedidos
  incertos recuperáveis/canceláveis e encerramento local explícito por C4.
- Dez APIs privadas, metadados/corpos separados, SDK direto fechado, C4 v4 com
  inventários antigos preservados. Nenhuma condição publica ou altera universo.

## Critérios de aceite

- [x] Preparar pista/missão, editar campos e escolher estados explicitamente.
- [x] Reutilizar em duas sessões, compartilhar estado e retomar pendência sem cópia.
- [x] Ordenar catálogo por tipo e vínculos mistos; CAS antigo preserva rascunho.
- [x] Excluir sessão conserva autoria; item excluído deixa vínculo neutro/removível.
- [x] Origem revogada/adotada não impede ler/salvar prosa própria ou repõe apoio antigo.
- [x] Recuperar/cancelar sem adotar corpo posterior ou apagar controle de outra aba.
- [x] C4 pagina todos os namespaces novos, preservando outra campanha e jobs v1–v3.
- [x] Teclado, Escape/foco, temas e 320 px verificados; gates locais verdes.
- [ ] CI do novo head verde; rollout/piloto humano não executados.

## Arquivos alterados

| Área                                   | Mudança                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| src/features/campaign-preparation      | Modelo, contratos, callables, journal, hook, catálogo/editor/vínculos e unidades      |
| CampaignPage e campaignRecoveryClosure | Composição estável, slot público S1, agregação e closer exato                         |
| CampaignSessionsPanel                  | Explica preservação dos itens ao excluir sessão                                       |
| functions/src/campaignPreparation*.mjs | Dez RPCs, seis ações, CAS, corpos separados, histórico e fence                        |
| campaignDeletion/Contracts/Cleanup     | Novos jobs v4, prefixos antigos e sanitização                                         |
| functions/src/index.mjs e package.json | Exports e verificação sintática                                                       |
| firestore.rules/firestore.indexes.json | Sete namespaces fechados, nove índices e body sem indexação                           |
| scripts/check-architecture e testes    | Folha auth/shared composta somente em campaigns                                       |
| SDK/fixture/visual e wiring            | Quatro famílias reais, três jornadas, alias e cleanup simulados                       |
| Docs, ADR e AGENTS                     | [ADR 0040](../decisions/0040-campaign-preparation-items.md), contrato e regras atuais |

## Testes e revisão

Cliente: **59 testes novos únicos** de contratos/journal/hook/adaptador e interface.
Root acrescentou quatro casos de composição/closer. Primeiro lote root teve 42/43:
fixture S1 trazia order zero; corrigida apenas para um e o afetado passou 1/1,
com 18 skips por filtro. O validate final inclui todos, sem skips. Primeiro lote
UI teve quatro erros no uso do helper de Dropdown; chamadas corrigidas sem mudar
produto ou expectativas. Backend dirigido **39/39**, 553,5461 ms: 14 novos e
25 regressões C4/S1. A primeira expectativa de limite usava 450 KiB sob teto de
512; foi corrigida para 600 KiB, sem alterar o teto do produto.

Revisão cruzada encerrou três achados reais com provas: GET de outro item não
sobrescreve digitação concorrente; revisão da coleção no formulário fica congelada
apesar de refresh; confirmação invalida leitores anteriores e avança pisos,
impedindo lista antiga após o recibo. Discriminação de recibos usa action, pois
add-link também possui itemId. Nenhum P1/P2 restante confirmado.

SDK real: **quatro famílias únicas, seis execuções positivas, zero falhas/skips**.
Primeiro lote 4/4 em 47.894,7271 ms; apenas família 1 repetida para list negado nos
sete namespaces/três atores, 1/1 em 8.303,9052 ms; apenas família 2 repetida para
cursores entre campanhas/sessões, 1/1 em 11.914,895 ms. Soma observada dos runners:
68.113,5273 ms. Transações/regras/Admin e SDK direto reais no emulador; transporte
HTTP callable e produção não exercitados. Captura/adoção usam serviços reais.

Chromium: **18 combinações únicas positivas**, três jornadas × seis perfis.
Foram **21 execuções: 20 positivas e uma falha inicial do roteiro**. O primeiro
J1 tentou trocar sessão mantendo S1 dirty, ação corretamente bloqueada. Após
comprovar o texto intacto, o roteiro passou a descartá-lo explicitamente antes da
troca. Somente J1 desktop foi repetido; os outros dois positivos foram mantidos.
Os 15 restantes passaram, sem mudança de produto/fixture/spec entre esses lotes.

| Lote                                               | Pass/Fail | Duração do runner |
| -------------------------------------------------- | --------- | ----------------: |
| desktop-first                                      | 2/1       |     48.346,546 ms |
| desktop-affected (só J1)                           | 1/0       |     19.328,633 ms |
| remaining                                          | 15/0      |     78.241,394 ms |
| escape-affected (só J1, desktop-light/mobile-dark) | 2/0       |     20.313,473 ms |

Último lote acrescentou passos/asserções de Escape mantendo os anteriores:
fecha somente S3, S1 permanece visível/dirty e foco retorna ao botão. Depois do
validate, somente esse roteiro mudou; produto/fixture conservaram seus hashes.
Lint, formato e TypeScript E2E oficiais passaram após o ajuste. Nenhum aumento de
timeout/retry. Zero retries/skips/flaky em todos os lotes; a falha inicial permanece
registrada. Soma dos quatro runners: 166.230,046 ms, incluindo o lote com falha.

Root leu os JSONs brutos e verificou os 38 coletores iniciais; o lote Escape tem
quatro adicionais, também sem erro. Zero console.error/runtime/pageerrors/rede
externa. Root inspecionou oito PNGs: editor/closer desktop e pista/missão em
320 px nos três temas, legíveis, com rolagem interna/footer e sem corte horizontal.
30 capturas selecionadas para a matriz; repetições preservadas nos lotes brutos
(38 eventos de captura nos quatro lotes). Transporte simulado, UI e Web Locks reais.

Uma configuração experimental herdando tsconfig.app expôs diagnósticos transitivos
legados fora do escopo; não virou gate nem relaxou opções. O gate oficial
npx tsc -p tsconfig.e2e.json --noEmit passou inteiro. Primeira invocação de config
externa Playwright falhou no caminho Windows antes de abrir navegador; somente o
arquivo externo foi corrigido. Logs experimentais/falha preservados nos artefatos.

## Validações executadas

Após npm ci --prefix functions (251 pacotes, zero vulnerabilidades), npm run validate
terminou **exit 0**:

```text
Test Files 194 passed (194)
Tests 1998 passed (1998)
Duration 149.64s
Coverage: statements 90.64 | branches 85.09 | functions 90.55 | lines 93.26
scripts: 85 pass, 0 fail, 0 skip, duration_ms 9461.7701
Functions: 409 pass, 0 fail, 0 skip, duration_ms 2556.0829
built in 1.38s
Smoke test do bundle OK.
WRITER_S3_VALIDATE_EXIT=0
```

HTML: instruções 17.669/19.492, ramos 15.232/17.899, funções 4.566/5.042,
linhas 16.190/17.360. Skills, arquitetura, docs, estilo, formato, lint, tipos e
sintaxe verdes. Limites/exclusões/hooks/dependências preservados. Build conserva
avisos anteriores de chunk grande e import DOCX misto. Índices antigos preservados
semanticamente e textualmente: somente nove índices e um override acrescentados.

Após o validate: documentação/AGENTS e ajuste dirigido de Escape. Não repetir
suíte global por docs ou passos visuais; check:docs, formato/lint/tsc E2E dirigidos
comprovam esses ajustes. CLAUDE.md permanece coerente. Nenhum segredo ou arquivo
novo acima de 5 MiB localizado; master original preservada em 522ccaa.

## Fora do escopo

Jogadores, revelação, condução F3, consequências automáticas, IA, backup/histórico,
edição do original, merge e deploy. Distribuição/comércio mantêm tarefas próprias.

## Limitações e pendências conhecidas

CI de `a9b588a` falhou por timeouts visuais; correção visual validada localmente; CI do novo head pendente.
S2B/56cbb06 tem CI e regras verdes separadamente.
Habilitar S3 exige dez APIs, C4v4, guardas, regras/índices conjuntos e drenagem de
versões antigas. Emulador não comprova índice implantado ou operação em produção.
Piloto humano, leitor de tela, zoom físico 200% e segundo dispositivo não comprovados.

Referência humana total O/C/P 46/78/128 h, confiança baixa, sem horas realizadas
ou saldo medido. A baseline histórica não representa previsão de lançamento.
Condições comerciais/humanas continuam nos aceites próprios.

Artefatos: C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-campaign-preparation-qa,
incluindo validate.log, sdk-*.log, qa-summary.json, captures-final.json,
root-verified-native.json e JSONs/logs dos quatro lotes nativos. Portas 64995,
61441 e 62321 encerradas após os runners.

## CI de a9b588a e correção dos testes visuais

O commit `a9b588a` foi enviado ao PR #21. A
[CI geral 39591699901](https://github.com/gaabrielrd/writer/actions/runs/39591699901)
falhou nos shards 1/12 e 9/12: testes longos de comparação C3, recuperação C2 e
preparação S3 excederam 45 segundos. Ambos os shards registraram três falhas
finais; a jornada S3 também repetiu a falha no retry. Validate Node 22/24,
auditoria, navegador de produção e os outros dez shards passaram.
[Regras 39591699969](https://github.com/gaabrielrd/writer/actions/runs/39591699969)
passaram. Isso não comprova conclusão técnica de S3.

A correção altera somente três arquivos de teste: comparação e lore passam de
quatro para sete jornadas cada; preparação passa de três para seis. Os fluxos de
recibo, fence, reload, Web Locks reais, troca de UID, conflito, vínculo neutro,
rascunho próprio e exclusão foram preservados. As precondições independentes usam
o transporte fixture e, no lore, AES-GCM real; não inserem journal falso.
A revisão cruzada não encontrou P1/P2 nem asserção/captura original removida.

Validação dirigida com dois workers e zero retries:

| Lote                                                | Resultado                            | Duração do runner |
| --------------------------------------------------- | ------------------------------------ | ----------------: |
| Primeiro desktop escuro                             | 8 positivos, 1 falha de arranjo novo |     78.853,036 ms |
| Somente arranjo corrigido + quatro jornadas de lore | 5/5                                  |     21.406,672 ms |
| Cinco perfis restantes                              | 65/65                                |    186.175,912 ms |

A falha local nova ocorreu porque o cenário neutro independente permanecia no
Estúdio depois de `seed`; foi acrescentada somente sua navegação inicial à
campanha. O caso corrigido passou nos seis perfis. Resultado final: **78
combinações únicas positivas** (13 jornadas × 6 perfis), **79 execuções**, uma
falha inicial preservada, zero retries/skips/flaky. A soma dos runners é
286.435,620 ms e inclui o lote que falhou. Não confundir esse total com horas humanas.

Os 110 coletores (79 de isolamento e 31 de console da preparação), incluindo o
caso que falhou por arranjo, registraram zero exceções, erros de console ou chamadas
externas. Lint dos três arquivos e o typecheck E2E oficial passaram também após o ajuste final de navegação, que foi verificado no runner.

Não houve mudança em src, Functions, regras/índices, dependências, configuração,
timeout, retries, skips ou critérios. Não repetir o validate global do produto
somente por essa reorganização de testes/documentos: o validate S3 anterior
continua registrado acima; os hooks e a CI do novo head executam seus portões.

Artefatos da correção:
C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-ci-s3-retake,
com logs dos dois jobs remotos, três JSONs/logs locais, hashes antes/depois,
`root-verified.json` e `collectors.json`. Nova CI permanece pendente; sem merge/deploy.

## Como verificar manualmente

1. Abrir uma campanha e Pistas e missões; criar pista/missão e consultar após salvar.
2. Abrir sessão salva, manter preparação não enviada e escolher Pistas e missões.
3. Vincular os itens, ordenar, escolher estado e retomar pendência em outra sessão.
4. Conferir estado compartilhado. Excluir sessão conserva itens; excluir item
   deixa vínculo neutro removível.
5. Perder resposta, recarregar e confirmar/encerrar o mesmo pedido. Conferir
   conflito sem perder rascunho, Escape/foco e outra campanha após C4.
