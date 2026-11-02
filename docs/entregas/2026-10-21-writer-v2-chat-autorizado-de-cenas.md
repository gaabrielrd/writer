# Writer V2 — Chat autorizado de cenas e blocos

- **Data:** 2026-10-21
- **Branch:** `codex/writer-v2`, base I `ffc01d9`
- **Plano:** [F2-09 A](../tasks/writer-v2/execucao/29-contexto-autorizado-e-ia-de-cenas.md)
- **Contrato:** [ABI 30](../tasks/writer-v2/execucao/30-contratos-do-chat-de-cenas.md)
- **Estado:** implementado e validado localmente; CI do novo head pendente. Sem merge ou deploy.

## Objetivo

Conversar com a IA durante a escrita de cenas de livro, texto principal de aventura
e blocos adicionais, conferindo contexto autorizado e confirmando cada aplicação.

## Funcionalidades entregues

- Chat privado, comandos e ações de seleção nos três alvos, com contexto paginado
  e inspecionável. O autor pode continuar escrevendo durante a geração.
- Lore local vence o global por termo/alias. O servidor resolve fichas e persona;
  nomes ou instruções recebidos do navegador não concedem acesso.
- Persona base da aventura, complemento por cena e ajustes de 0 a 100; os blocos
  herdam a cena. Livros mantêm base do livro e complemento do capítulo.
- Respostas/contextos/sugestões afetados por origem indisponível ficam ocultos.
  Perguntas próprias e manuscrito aplicado permanecem. Somente a mesma origem
  nativa reautorizada recupera respostas antigas; fonte recriada não equivale à antiga.
- Aplicação explícita com CAS e destino confirmado. Texto, contagens, ledger, saldo,
  paid e recibo são atômicos. Chat é gratuito; primeiro aceite de plataforma custa
  um crédito. Reapply explícito de turno pago e BYOK não cobram de novo. Undo é edição normal.
- Recuperação metadata-only após resposta incerta, sem reenvio automático ou débito
  duplicado. Journal sob Locks/CAS preserva controles entre abas e troca de conta.
- Autocomplete e ações legadas de débito cliente ficam desativados nos novos alvos.
  Aplicação mantém undo/autosave e adota metadados sem resetar o editor.

## Critérios de aceite

- [x] Autorização por alvo/encarnação e closure transitiva antes dos derivados.
- [x] Persona herdada, prioridade local/global e limites sem fallback ou truncamento silencioso.
- [x] Perguntas próprias separadas dos derivados e recuperação sem credenciais/prosa no journal.
- [x] Aplicação atômica, quota, CAS, replay, stop e fence verificados.
- [x] Validate completo, cobertura, lint, tipos, build e smoke locais verdes.
- [x] Matriz nativa final completa e regressões legadas dirigidas.
- [ ] CI do novo head verde, acompanhada sem bloquear o próximo incremento validado localmente.

## Arquivos alterados

| Área                                                                                            | Mudança                                                                             |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `functions/src/editorChat*.mjs` e declarações                                                   | Contratos, contexto, conversas, histórico, geração, aplicação, operações e cleanup. |
| `functions/src/personaProfile.mjs`                                                              | Compilador puro compartilhado, mantendo instruções legadas do livro.                |
| `functions/src/bookLoreVersion.mjs`, writers e Rules                                            | Clock local transacional do lore de livro e fechamento do SDK direto.               |
| `functions/src/index.mjs`, `firestore.indexes.json`                                             | Callable Auth/App Check e índices das consultas reais.                              |
| `src/features/ai-assistant`                                                                     | Transporte, journal, controller, persona, BYOK, aceite e painel/workspace públicos. |
| `src/features/editor`                                                                           | Capacidades, matcher qualificado, bridge e guard de navegação.                      |
| `src/features/scenes`, `adventure-blocks`, `adventures`                                         | Hosts de chat, autosave confirmado e gestão de persona.                             |
| `src/features/books`, `lore`                                                                    | Clock local nos writers do cliente.                                                 |
| `src/shared/ui/PageHeader.tsx`                                                                  | Quebra de títulos/descrições longos sem expandir o viewport móvel.                  |
| `e2e/visual`, `functions/test`, `tests/firestore`                                               | Provas independentes de UI, contrato e SDK.                                         |
| `AGENTS.md`, arquitetura, integrações e [ADR 0043](../decisions/0043-authorized-editor-chat.md) | Regras de origem, recuperação, rollout e arquitetura.                               |

## Testes

| Prova                    | Resultado e limite                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate completo        | 2.527 testes frontend em 219 arquivos, 85 scripts, 615 Functions; nenhum fail/skip.                                                                                 |
| Cobertura                | Statements 90,96%; branches 85,59%; functions 90,67%; lines 93,61%. Limites preservados.                                                                            |
| Clock SDK                | 39 casos únicos positivos. Primeira rodada 35/39; repetição afetada 5/5, incluindo um passe repetido.                                                               |
| Contexto SDK             | 4/4 na primeira execução: três alvos, intruso/anônimo, namespaces privados, 53 locais antes do global, manifesto e origem/persona.                                  |
| Conversas SDK            | 4/4 na primeira execução: catálogo/CAS, pergunta própria, proveniência transitiva e cleanup limitado com 151 documentos. Turnos semeados com contextos reais.       |
| Geração SDK              | 4/4 na primeira execução, pelo produtor real sem seed de turno: claim/quota compartilhada, concorrência, history, revogação, stop e BYOK.                           |
| Aplicação SDK            | 4/4 após corrigir expectativa da spec sobre cache de aventura; escritores, ledger e timestamps nativos comprovam atomicidade. Turnos semeados; não é prova de send. |
| Callable HTTP real local | Dois negativos App Check ausente/inválido positivos, rejeitados pela infraestrutura antes do serviço. Não comprova configuração de produção.                        |
| Nativo principal         | 18/18, seis perfis, 121.953,495 ms; 18 coletores sem erros de runtime ou pedidos externos.                                                                          |
| Nativo dirigido          | 12 combinações únicas positivas: seis jornadas em desktop-dark/mobile-dark. Três regressões legadas também passaram; lote com retake de persona 4/4, 28,7 s.        |

Saída real do validate final, Node v24.21.0/npm 10.6.0:

```text
Test Files  219 passed (219)
     Tests  2527 passed (2527)
All files  | 90.96 | 85.59 | 90.67 | 93.61 |
tests 85; pass 85; fail 0; skipped 0
tests 615; pass 615; fail 0; skipped 0
Smoke test do bundle OK.
```

## Validações executadas

`npm ci --prefix functions` terminou exit0, auditoria sem vulnerabilidades.
`npm run validate` final terminou exit0: skills, arquitetura, docs, styleguide,
formato, lint, cobertura/setup/Functions, tipos, build e smoke. A primeira execução
completa também passou; a correção posterior do PageHeader compartilhado justificou
a nova validação. Observações de elementos sob o diálogo no E2E foram corrigidas
separadamente, com prettier/ESLint/tsc.e2e dirigidos verdes, sem mudar produção.

Revisões cruzadas fecharam P2 de guard PM, retorno BYOK atrasado, handoff de contexto,
pendência alheia no modal e perda de referências setter→setter. Última revisão dos
arquivos congelados sem P1/P2 confirmado. Scan preliminar de 144 arquivos sem
marcadores de segredo, .env inesperado, mídia ou arquivo maior que 1 MB. O scan final
conferiu 145 arquivos, sem achados, escopo inesperado ou drift nas 66 fontes de
produção do manifesto v2. Nenhuma dependência adicionada.

Evidências externas em `writer-v2-editor-chat-qa` no diretório de artefatos da sessão:
logs/JSON de clock, contexto, conversas, geração, aplicação, validate e navegador.
Os quatro manifestos SDK ficam no nível superior, prefixo
`writer-v2-editor-chat-*-sdk-verification.json`. O manifesto
`writer-v2-editor-chat-final-source-freeze-v2.json` prende 66 fontes de produção, o
log de validação e a precisão do ajuste posterior, SHA-256
610eb91141f05d190d8ac447228ca13715ac5591e27f59aafb732cb0fcf9a609.
Artefatos e PDFs privados ficam fora do Git.

A seleção final contém 30 combinações novas e três regressões únicas positivas,
com 33 coletores sem erros de runtime/pedidos externos, retry0. O manifesto
`writer-v2-editor-chat-native-final-verification.json` escolhe a última execução
positiva por título/projeto sem remover falhas anteriores; SHA-256
cf241c381f814d8158b034abfc95bb5647d3b39bf21750a53422b3eebebb4b6d.
Seis capturas principais e cinco de persona foram inspecionadas nos três temas e
320 px, com limites da área visível explicitados no plano. Não há alegação de
que todo o contexto caiba simultaneamente na tela.

Após o último validate, somente classes do botão de recuperação de persona foram
ajustadas para quebrar em 320 px. Prettier/ESLint/styleguide dirigidos passaram;
persona móvel passou no lote 3/3 de 21,4 s e desktop no lote 4/4 de 28,7 s.
Não houve terceira execução integral de validate. O manifesto registra essa
precisão; nenhum comportamento, contrato ou limite de teste foi alterado.

## Falhas iniciais e repetições

Resultados anteriores permanecem preservados; não são retries automáticos nem
convertidos em aprovação final. O plano A registra as falhas de arranjo das unidades
por marco. SDK de clock teve observação/fixture legada corrigidas; SDK de aplicação
teve expectativa incorreta de cache da aventura corrigida, mantendo dados/timestamps.

Nativo: filtro ancorado não encontrou testes; duas tentativas de clique móvel
falharam. O diagnóstico mostrou título sem quebra expandindo layout para 1280 px
apesar do visual viewport 320 px. PageHeader agora mantém innerWidth/scrollWidth320
e o clique no parágrafo passa sem force. A inspeção também encontrou nome/alias
cortado no contexto; `.details` passou a quebrar tokens longos e o teste mede a
largura interna. Lotes interrompidos e não executados não contam como aprovados.

O novo fluxo UID teve dois ajustes de arranjo: retornar explicitamente à cena após
Auth redirecionar ao Estúdio e observar o DOM do editor com includeHidden enquanto
o diálogo o remove da árvore de acessibilidade. Asserções e gestos foram mantidos;
o reteste dos dois casos de segurança passou 2/2, 16,8 s, sem retry.

## Fora do escopo

Migrar chat legado, IA de campanhas, autocomplete nos novos alvos, publicação,
comércio, backup/restauração, merge, deploy ou chamadas pagas a provedores.

## Limitações e pendências conhecidas

Pergunta ainda não enviada fica em RAM e pode ser perdida no reload; prepare não a
salva. Journal guarda só controles. Não existe promessa de apagar bytes já vistos
ou enviados ao provedor. Hints/foco invalidam e reconsultam, sem autorização presumida.

UI usa Tiptap, autosave, undo, Locks e journal reais; transporte/autorização do
navegador são simulados e não substituem SDK. Os SDKs usam Firestore/Admin reais
locais e geradores injetados, sem custo de IA. Não houve piloto humano, screen reader,
zoom físico de 200%, segundo dispositivo ou prova de credenciais/App Check live.

Rollout deve coordenar Functions, writers do clock local, Rules e índices; drenar
clientes antigos antes de habilitar. Build mantém avisos de chunks grandes e import
estático/dinâmico já registrados. Master original permanece em 522ccaa e limpa.
F2-09 continua em andamento, com portabilidade P1/P2/P3 e fechamento D próprios;
a contagem ampla permanece 8/35 (22,9%), sem equivalência com esforço ou lançamento.

## Como verificar manualmente

1. Abra cena de livro, principal de aventura ou bloco adicional; escreva e aguarde salvamento.
2. Abra o assistente, crie conversa, prepare/avance/confira contexto e persona.
3. Envie pergunta; leia resposta e confirme aplicação ao texto. Confira contagem e undo.
4. Edite durante geração e escolha novo destino explicitamente para aplicar.
5. Na aventura, configure base e complemento da cena; confira a herança no bloco.
6. Em resposta incerta, confira/cancele o mesmo pedido sem reenviar. Revogue uma origem e confira perguntas próprias sem respostas afetadas.

### Fechamento local

O mesmo commit da implementação registra esta evidência e as confirmações remotas
anteriores de I. [PR 21](https://github.com/gaabrielrd/writer/pull/21) permanece em
rascunho; CI deste incremento será acompanhada sem bloquear a descoberta de P1.
Não confundir essa autorização com merge, deploy ou lançamento.

## Correção dirigida após a CI — 2026-10-21

O head `5f947a0e5e50df81154df14a7124b914278cd4c9` passou Rules
[39659740521](https://github.com/gaabrielrd/writer/actions/runs/39659740521).
Na [CI 39659740574](https://github.com/gaabrielrd/writer/actions/runs/39659740574),
Validate Node 22, auditoria e produção Chromium passaram. Validate Node 24
(job 119429326269) falhou no teste de retomada de importação de aventura:
ativação esperada uma vez, observada zero. Na consulta, cinco shards visuais
estavam verdes e sete ainda executavam; isso não constitui CI geral aprovada.

A causa foi uma corrida do teste anterior de I: verificar o pedido limpa o erro
antes de concluir a consulta, mantendo Retomar desabilitado. Esperar somente o
sumiço do erro permitia um clique ignorado pelo botão. O teste agora segura a
consulta, comprova que o clique desabilitado não envia append/ativação, libera a
resposta, aguarda Retomar habilitar e exige o replay integral do mesmo append.
Mantém a ativação única e confirma a notificação com o ID correto da aventura.
Nenhum hook, componente, timeout, retry ou limite de cobertura foi alterado.

Validação dirigida do arquivo final: ESLint e Prettier passaram; Vitest passou
13/13, sem falha ou skip, em 4,91 s. Uma execução anterior do mesmo arquivo
passou 13/13 em 4,87 s; depois foi corrigido somente o callback async de act
apontado pelo lint. Revisão do diff sem achados P1/P2. Log final privado:
`writer-v2-editor-chat-qa/ci-node24-import-ui-fix-final.log`.

Não foi repetido validate integral para esta correção de sincronização do teste;
os validates locais de A acima continuam identificados por seu snapshot.
O próximo head precisa de nova CI; acompanhar sem bloquear a descoberta de P1,
sem declarar a falha antiga aprovada nem atribuí-la a código de produção.

### Envio da correção de retomada e descoberta visual

`f0220944abb319ea3299d2fd5a0cad0b642cf9f3` foi enviado com hooks normais;
pre-push passou tipos e 2.527 testes/219 arquivos em 148,39 s. HEAD, upstream e
branch remota coincidiram; master original permaneceu limpa em 522ccaa.
Rules 39662549405 passaram; CI 39662549222 ainda executava na consulta.

O fechamento da matriz anterior de 5f947a0 mostrou outra falha: Visual 7/12
(job 119429326763) teve 109 passes, uma falha também no retry e um skip em
14,1 min. Cinco outros shards passaram e seis foram cancelados; agregador E2E
falhou. Não há CI geral verde para esse head. O teste de lore de aventura ainda
procurava data-lore-id separado por dois-pontos; A usa a tupla JSON qualificada
com a mesma origem do matcher servidor. Nenhum fallback legado foi introduzido.

A expectativa visual foi atualizada para localizar a marcação pelo nome acessível
e exigir a tupla exata de aventura, projeto e ficha. Exige uma única marcação e
nenhuma do alvo global de mesmo alias, acrescenta edição por teclado e abre a
ficha local por Enter para conferir resumo e texto editado. Asserções anteriores
de privacidade, referência além da primeira página, salvamento e largura permanecem.

O primeiro lote dirigido local falhou 6/6 (sem retry): cinco por seletor ambíguo
dos dois botões Fechar, um por fill durante atualização do editor ter concatenado
a prosa. Não foram contados como passes. O arranjo agora aguarda texto e marcação,
edita por teclado com resultado integral esperado e fecha por Escape. Nenhuma
mudança de produção, timeout, retry ou cobertura. Lint e formatação dirigidos passaram;
resultado final: 6/6 perfis passaram em 45,33 s, zero retry/skip/flaky, todos os
coletores com blockedRequests=[] e runtimeErrors=[]. Identidade, prioridade local,
teclado, leitura da ficha e salvamento foram observados no navegador real.
As duas capturas finais light (desktop e 320 px) e o leitor móvel foram
inspecionados: prosa sem duplicação e sem corte horizontal. Transporte permanece
fictício; isso não substitui a prova SDK de autorização registrada em A.

Logs privados: ci-visual7-119429326763-failure.txt, primeiro lote
ci-lore-identity-native.json, resultado final ci-lore-identity-native-final.json e
manifesto ci-lore-identity-native-verification.json, sob writer-v2-editor-chat-qa.
Revisão final sem achados P1/P2; somente teste visual e este registro no novo
commit. Não houve novo validate integral para alterar expectativa de teste;
o próximo head ainda depende de CI própria.

### Acompanhamento remoto de 6650408 — 2026-10-21

Rules [39663714845](https://github.com/gaabrielrd/writer/actions/runs/39663714845)
verdes. Na [CI 39663715057](https://github.com/gaabrielrd/writer/actions/runs/39663715057),
Node 22 e 24, auditoria, produção Chromium e dez shards visuais passaram, incluindo
7/12 com a expectativa de lore corrigida. Shards 1/12 (119444043454) e 3/12
(119444043710) terminaram cancelados; o agregador E2E falhou. O run ficou cancelled.
Não declarar CI geral verde nem inferir a causa dos cancelamentos só do status.

O log do shard 1 mostra uma falha no caso de recuperação de vínculo C4/S2, em
46,1 s; o mesmo caso passou no retry em 38,9 s. O cancelamento interrompeu o lote
antes do resultado final. O shard 3 não registrou falha de teste nas linhas
consultadas antes do cancelamento. São resultados parciais, não execução integral
aprovada; sem aumentar timeout, retry ou reduzir a suíte. P1 continua em descoberta
em paralelo conforme autorização do operador; seu planejamento não fecha o gate A.
