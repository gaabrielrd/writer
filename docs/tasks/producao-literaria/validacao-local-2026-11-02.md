# Validação local — produção literária — 2026-11-02

Estado: mapa global, auditoria, reconciliação estrutural e vínculos entre volumes acrescentados após a última rodada integral. O novo incremento passou em verificações dirigidas descritas abaixo. A rodada de 5.279 testes é anterior a esses incrementos; seu `validate` reprovou na cobertura de funções. Nenhuma das cinco etapas está formalmente concluída; permanecem requisitos funcionais abertos.

## Incremento posterior — mapa global do livro

Na mesma branch/worktree, ainda sobre `b9fc03c`, foram acrescentados o serviço `literaryBookMap.mjs`, o cliente/modelo da feature e `LiteraryBookMapPanel`. Há uma ação nova em `planningApi` (412 ações no contrato completo). Nenhuma coleção, dependência, índice ou regra de SDK foi acrescentada. Sem commit, push ou deploy.

A interface oferece ordem canônica de atos/capítulos, cronologia manual de eventos e trajetória de conhecimento por leitura ou cronologia. Atos vazios, intenções de livro/série e momentos declarados sem evento continuam acessíveis. Só assuntos explicitamente vinculados entram nos respectivos percursos; uma fonte consultada não vira participação. Homônimos permanecem separados e aliases de escopo são normalizados. O [contrato do mapa](02-mapa-global.md) registra o alcance da leitura e da prova.

| Verificação dirigida            | Resultado                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Servidor e contratos afetados   | **23/23**: nove cenários de mapa, nove de planejamento e cinco do handler por setor. Inclui 53 capítulos paginados, ausência de corpos do manuscrito, nenhuma escrita/débito, identidade recriada, timestamps inalterados, slot de rank ativo, outra conta e revogação do universo.                                |
| Frontend                        | **34/34 em quatro arquivos**: mapa, planejamento, BookPage e roundtrip cliente/servidor. Inclui pausa após pedido em voo, continuidade após 32 páginas sem limite de livro, revogação, resposta tardia de outra conta, homônimos/aliases, atos vazios, momentos sem evento e alternância das ordens da trajetória. |
| Fronteira real cliente/servidor | Cinco dos 34 testes exercitam os serviços reais através de `createDomainHandler` e do banco transacional de teste. O cenário novo do mapa valida o transporte, a ausência de jornal/débito e a recusa após fonte alterada ou conta estrangeira. Não somar esses casos novamente.                                   |
| Chromium                        | **6/6**, três temas, desktop/móvel a 320 px; três visões, ordenação da trajetória, Enter, atualização e ausência de overflow horizontal. Primeira e segunda rodadas também passaram; somente a final é apresentada como prova atual da jornada.                                                                    |
| Build e smoke                   | Aprovados, incluindo TypeScript. Avisos existentes de chunks/imports dinâmicos permanecem.                                                                                                                                                                                                                         |
| Lint dirigido                   | Todos os arquivos do incremento passaram, **zero erros e zero avisos**; ajustes feitos sem supressões.                                                                                                                                                                                                             |
| Sintaxe Functions               | **561 módulos**, saída zero.                                                                                                                                                                                                                                                                                       |
| Arquitetura/styleguide          | Aprovados. Documentação e formatação dos arquivos atualizados conferidas após o registro.                                                                                                                                                                                                                          |

Capturas de desktop claro e móvel sépia foram inspecionadas; as jornadas atuais também cobrem a nova seleção de ordem da trajetória. A leitura conserva checkpoint apenas enquanto a página está aberta; recarregar começa uma consulta nova, sem reativar execução de IA.

Logs atuais em `%TEMP%`:

- `writer-literary-map-server-reviewed.log` — 23 testes de backend.
- `writer-literary-map-frontend-complete.log` — 34 testes de frontend.
- `writer-literary-map-browser-reviewed.log` — seis jornadas finais.
- `writer-literary-map-build-reviewed.log` e `writer-literary-map-lint-reviewed.log`.
- `writer-literary-map-functions-check.log` — conferência de sintaxe dos módulos Functions.

O gate completo não foi repetido depois do mapa: a aprovação dirigida não substitui o próximo `validate`. A última medição global de funções (86,02%) pertence ao snapshot anterior; nenhum limite foi alterado. Auditorias globais/reconciliação de E2, modos operacionais de E4 e impacto/portabilidade de E5 seguem abertos.

## Rodada integral anterior ao mapa — b9fc03c (código de produção 317abc6)

A principal local avançou novamente para `317abc69cba7465cc41149eeb15c623c0cee130c`.
Esse commit já está incorporado por fast-forward em `codex/producao-literaria`.
O trabalho anterior foi preservado no stash `0470089f15786bb0b87881fdb5fd5304a3466644`, mantido após reaplicação.
Quatro conflitos foram resolvidos sem pendências: criação assistida, serviços por setor, contagem de ações e exportações públicas da IA.
O último commit apenas documental da principal, `b9fc03c57a34cec25a3ebec13974023ba5a17fb8`, também foi incorporado. Não houve mudança de código entre ele e `317abc6`.
O checkout principal continua limpo. Sem commit, push ou deploy nosso.

Compatibilidade: criação unificada oferece contrato opcional somente para livros; o assistente contextual usa composição editorial canônica, exibe a fonte e recusa respostas após alteração/recriação do guia.
O novo teste encontrou e corrigiu retenção de respostas obsoletas: a mudança de contexto é capturada antes do updater React.

### Resultados atuais

| Conferência                          | Resultado                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend completo com cobertura      | **5.279/5.279**, **409/409 arquivos**, duração 489,95 s; zero testes falhos ou timeouts.                                                                       |
| `npm run validate`                   | **Saída 1** por cobertura de funções **86,02% (8.889/10.333)**, mínimo 90%. Statements 87,30%; branches 82,87%; lines 90,41% passaram seus limites.            |
| Pré-gates                            | Skills, arquitetura, documentação, styleguide, formatação e lint integral (38 grupos) aprovados; lint teve zero erros e quatro avisos já registrados.          |
| Backend de integração                | **118/118** em dez arquivos. Os **49/49** de criação/assistente são subconjunto, não são somados.                                                              |
| Frontend dirigido da compatibilidade | **20/20** em criação e assistente; casos incluídos também na suíte completa.                                                                                   |
| TypeScript e build                   | Aprovados; build inclui tipos, bundle de produção e smoke, saída zero. Avisos de tamanho de chunks/imports dinâmicos permanecem no log.                        |
| Sintaxe Functions                    | **560 módulos**, saída zero.                                                                                                                                   |
| Chromium — criação manual de livro   | **6/6**, nos três temas, desktop e móvel a 320 px; contrato opcional conserva edições ao recolher/reabrir. Capturas claro desktop e sépia móvel inspecionadas. |
| Chromium — leitor e guia             | **24/24**, três temas, desktop/móvel e 320 px.                                                                                                                 |

Todos os seis arquivos antes afetados por timeouts passaram nesta rodada completa, sem ampliar os limites de tempo.
O gate não alcançou `test:setup` nem seu build encadeado, porque a cobertura falhou; build e backend dirigido foram executados separadamente.
A suíte completa de Functions/infraestrutura e os quatro shards de Rules abaixo permanecem evidência histórica sobre `1d78ff7`. A incorporação posterior não alterou `firestore.rules`; os dois arquivos de Rules alterados pela principal receberam somente formatação. Não é declarada nova rodada integral do emulador.

Logs atuais em `C:/Users/gaabr/AppData/Local/Temp/`:

- `writer-literary-317-validate.log` e `coverage/results.json` no worktree: gate completo e resultado do frontend.
- `writer-literary-317-server-integration.log`: 118 casos de backend.
- `writer-literary-317-creation-frontend-fixed.log`: 20 casos dirigidos.
- `writer-literary-317-build.log`, `writer-literary-317-functions-check.log` e `writer-literary-317-increment-lint.log`.
- `writer-literary-317-creation-browser.log` e `writer-literary-317-reader-browser.log`.

Demais resultados abaixo são históricos, identificados por base.

## Snapshot anterior — 1d78ff7

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Branch: `codex/producao-literaria`, HEAD **`1d78ff7f9c58fafc3dc4920eef2408a4f244a390`**, igual à `master` local no início desta nova rodada.
A `master` local avançou 16 commits enquanto a validação anterior estava em curso; `origin/master` permanecia em `a89fc38`.
A rodada antiga foi interrompida, pois não comprova a integração mais recente.

O trabalho completo foi preservado no stash `477aa64f10463d1606f1bcb9ada6c64dfb79b9bb`, a branch recebeu fast-forward para `1d78ff7` e o stash foi reaplicado.
Doze arquivos tiveram conflitos resolvidos preservando os contratos literários, o layout do editor, as personas contextuais e as provas nativas mais fortes da principal.
O stash foi mantido. Não restaram conflitos; `git diff --check` passou.
O checkout original permaneceu limpo e não recebeu nossas alterações.

## Rodada sobre 1d78ff7

- Infraestrutura: **116/116**; Functions completos: **5.224/5.224**, saída zero; sintaxe: **557 módulos**.
- Build após a correção de hover: tipos, bundle e smoke passaram, saída zero.
- Skills, arquitetura, documentação, styleguide, formatação e lint completo passaram. Quatro avisos preexistentes na feature literária. Lint dirigido das adições posteriores também passou após corrigir o vínculo de método no mock de mídia.
- Frontend completo com cobertura: **5.252 testes, 5.243 aprovados e nove timeouts em seis arquivos**. Statements 87,39%; branches 82,99%; functions **86,19%** (mínimo90%); lines90,49%. Gate reprovado; limites preservados. Código do tooltip foi corrigido após o início dessa execução, que não serve como aprovação final do snapshot atual.
- Diagnóstico isolado da seleção de53itens:1/1passou em129,62s, sem ampliar timeout. Repetir arquivos afetados com os processos pesados encerrados; não assumir que as outras falhas são somente carga.
- Testes dirigidos do frontend sobre a base integrada:101/101 em16arquivos. Novos cenários: planejamento4/4, inferência4/4, publisher6/6, guard3/3, cliente-servidor4/4; leitor/tooltip/regressões25/25. Não somar como nova suíte global.
- Testes dirigidos do servidor:31/31, incluindo catálogo atômico no primeiro aceite de persona gerada, roteamento e publicação.
- Rules oficiais: shard1/4 teve152testes/151pass/1falha; shard2/4 **146/146**; shard3/4 **143/143**; shard4/4 **157/157**. A única falha era expectativa antiga deixada no merge após criação nativa; o teste agora compara o livro inteiro antes/depois da tentativa SDK negada. Reexecução dirigida no emulador **1/1passou**. Não apresentar a primeira rodada como quatro saídas zero.
- Navegador: primeira rodada23/24 expôs hover sintético reabrindo tooltip em toque após Escape. Corrigido em ReaderLoreTooltip. Regressão móvel9/9; rodada completa corrigida **24/24** nos três temas, desktop/móvel e320px. Prova adicional de abrir/rolar o guia em320px **6/6**. Capturas de claro desktop e sépia320inspecionadas; sem transbordamento horizontal.

## Avanço posterior da principal

A `master` local avançou mais dois commits para **317abc69cba7465cc41149eeb15c623c0cee130c** durante a rodada, incluindo criação de projetos e assistente contextual.
Os resultados acima identificam o snapshot1d78ff7; a próxima incorporação e suas provas serão registradas separadamente.
A cobertura global continua reprovada e as pendências funcionais das cinco etapas permanecem.

## Resultados históricos sobre a base anterior a89fc38

| Verificação                             | Resultado e limite da evidência                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functions, primeira suíte completa      | 5.090 testes: 5.054 aprovados e 36 falhas. Após correções, seis suítes de carregamento passaram 116/116 e nove grupos afetados passaram 89/89. A nova suíte completa dessa base foi interrompida ao detectar o avanço da principal. |
| Frontend, primeira suíte sem cobertura  | 5.212 testes: 5.190 aprovados e 22 falhas. Dez arquivos afetados reexecutados: 126/126.                                                                                                                                             |
| Frontend, rodada completa com cobertura | 5.213 testes: 5.210 aprovados e três timeouts em dois arquivos. Reexecução isolada desses arquivos: 19/19 aprovados. Isso não substitui uma nova rodada completa.                                                                   |
| Cobertura da última rodada completa     | Statements 85,76%; branches 81,43%; functions 83,46%; lines 88,76%. O limite de funções é 90% e continua bloqueando o gate. Os limites foram preservados. A maior lacuna está nos novos componentes e serviços literários.          |
| Tipos                                   | Os 29 erros iniciais foram corrigidos. Typecheck passou novamente após as correções e os novos testes do guia e leitor.                                                                                                             |
| Lint e formatação                       | `validate` passou todas as partições de lint e a formatação antes de chegar à cobertura. Arquivos acrescentados depois passam por conferência direcionada; a aprovação global ainda não foi repetida.                               |
| Build de produção                       | Passou tipos, bundle e smoke antes da última correção do leitor. A segunda execução foi interrompida ao detectar a nova principal.                                                                                                  |
| Rules, primeira rodada                  | Execução sem shards excedeu o limite oficial de 30 minutos. Os quatro shards seguintes terminaram e expuseram incompatibilidades de fixtures e limite de expressões; não houve aprovação global.                                    |
| Rules, correções direcionadas           | Shards 5/16: 40/40; 8/16: 31/31; 15/16: 37/37; 1/16: 48/48; 11/16: 34/34; 10/16: 34/34. Cenas: 9/9. Dois casos corrigidos do histórico: 2/2. A rodada integral dessa base foi interrompida ao detectar o avanço da principal.       |
| Guia e publicação no servidor           | 13/13 na suíte de publicação, incluindo quatro novos cenários de CAS, citação literal, projeção pública, consentimento e replay histórico sem republicação.                                                                         |
| Guia e leitor no frontend               | 29/29 em três arquivos: regressões existentes de ReaderView, quatro novos cenários de revelação/homônimos e seis cenários do editor do guia.                                                                                        |
| Navegador                               | Leitor legado: 17/18; caso Escape no sépia móvel passou isolado, sem mudança de código. Guia novo: 6/6 nos três temas, desktop e móvel, incluindo 320 px; capturas inspecionadas. Tudo ainda sobre a base anterior.                 |

As reexecuções dirigidas não são somadas como se constituíssem uma nova suíte completa.

## Correções verificadas nesta rodada

- Duplicações de declaração, contratos de tipos e acessos possivelmente ausentes.
- Evidência vazia não recebe referência inventada; chaves React distintas impedem controles duplicados na preparação.
- Modelo e raciocínio do chat capturados antes da espera pelo contexto editorial, com regressão específica.
- Revogação de projeto fecha o acesso sem alterar relógio alheio; edição pendente permanece bloqueada após o prazo.
- Paginação percorre todas as 34 mensagens; edição exige interromper a resposta anterior, preservando a barreira contra conclusão tardia.
- Fixtures respeitam IDs nativos, campos fechados, máscaras aninhadas, consultas por intervalo e o transporte por setor.
- Testes de Rules usam catálogo, relógio de livro e prova de aceite atômicos. Tentativas inválidas continuam negadas.
- Lore grande é validado por roundtrip nativo em partes; histórico de capítulo grande verifica hash e texto integral pelo leitor nativo.
- O custo das Rules foi reduzido sem retirar campos protegidos, limites de traços, origem restaurada ou revogação.
- No leitor, homônimos ainda ocultos suprimem ligações ambíguas sem revelar a entrada futura. Testes preservam nomes únicos, links existentes e limites por edição/capítulo.
- O guia conserva evidências independentes, incerteza, CAS e rascunhos em conflito; resposta perdida repete a mesma operação ou recupera sua revisão exata.

## Pendências e estado da entrega

Concluir as rodadas integrais de infraestrutura/Functions e Rules, conferir os resultados do navegador e repetir os gates afetados.
A cobertura de funções continua abaixo do limite: ampliar testes de comportamento dos painéis e serviços literários, sem reduzir thresholds ou excluir código para fazer passar.
Ainda faltam os itens funcionais registrados no README e no checkpoint: portabilidade editorial, fechamento do mapa de impacto e das auditorias/reconciliações globais.
Nenhuma etapa está aprovada na definição de concluído. Não houve commit, push, merge de volta à principal ou deploy.

Logs detalhados: `C:/Users/gaabr/AppData/Local/Temp/writer-literary-*.log`.

## Incremento posterior — auditoria global da arquitetura

Base local continua `b9fc03c`, igual à principal na conferência. Foram acrescentados o
censo completo, a prévia sem IA, leitura e conferência segmentadas e reconferência do
inventário, conforme [contrato do incremento](03-auditoria-global.md). São 414 ações no
contrato por setor. A nova coleção de provas é privada ao servidor. Sem dependências,
commit, push ou deploy. A principal original continua limpa.

- Servidor: **61/61** em sete arquivos, incluindo dez cenários específicos de auditoria,
  regressões de integração, protocolo, reconferência, achados, transporte e exclusão.
- Frontend e transporte cliente/servidor: **18/18** em quatro arquivos. Inclui prévia exata,
  resposta perdida, identidade congelada, paginação e resposta tardia após troca de conta.
- Rules no emulador demo local: **1/1**; autor, outra conta e anônimo não conseguem ler,
  listar, criar, alterar nem excluir o inventário. O registro original permanece intacto.
  Este teste dirigido não é uma nova execução integral das Rules.
- Typecheck, bundle e smoke aprovados também na conferência final após o ajuste de espaçamento móvel.
- Sintaxe Functions: **563 módulos**, saída zero.
- Primeira jornada Chromium: **3/6**, desktops aprovados; móveis detectaram a sobreposição
  do assistente flutuante sobre o último botão. Ajuste de espaço e quebra de texto aplicado;
  repetição aprovada em **6/6**, nos três temas e desktop/móvel de 320 px. Capturas de prévia móvel sépia e evidências desktop claro inspecionadas. Formatação global, skills, arquitetura, documentação e styleguide aprovados. Lint completo aprovado nas 38 partições, com zero erros e dois avisos remanescentes em LiteraryFindingDecisionPanel (fast refresh e ref no cleanup).

Logs em `%TEMP%`, prefixo `writer-literary-architecture-`: `server-final.log`,
`client-complete.log`, `rules.log`, `build.log`, `build-final.log`, `syntax.log`, `lint.log`,
`browser.log` e `browser-reviewed.log`.
A cobertura global de 86,02% pertence à rodada anterior; não foi recalculada por estes
comandos. Nenhuma etapa está formalmente encerrada.

## Incremento posterior — reconciliação estrutural dos achados

Sobre a mesma principal `b9fc03c`, a [reconciliação estrutural](04-reconciliacao-estrutural.md)
passa a diferenciar destino estrutural de prosa, com paginação das fontes lidas na síntese
final e confirmação pela mesma origem e hash semântico em sucessora global completa.
A confirmação não aplica texto, não debita crédito e não cria uma versão de prosa para
representar metadados. Não há nova coleção, índice, dependência ou ação no contrato.

- **114/114 testes de servidor:** integração, auditoria, reconferência, achados e todos os
  adaptadores de impacto. Inclui capítulos compostos, marcos homônimos, arco recriado,
  prosa sem alteração estrutural, sucessora parcial, confirmação idempotente e invalidação
  após nova edição. Identidade composta rejeita formas inválidas e outro livro.
- **26/26 testes de frontend/transporte**, em cinco arquivos. O roundtrip usa os handlers
  reais por setor, perde e recupera respostas de decisão e confirmação, preserva a prosa,
  mantém dois registros de revisão e não repete cobrança. A interface conserva justificativa
  ao paginar e ignora página antiga após troca de conta.
- **12/12 jornadas Chromium**, auditoria e reconciliação, nos três temas e desktop/móvel
  de 320 px. Seleção de marcos por arco, paginação, salvamento por teclado, rascunho
  preservado, destino por extenso e ausência de confirmação automática. Capturas de
  desktop claro e móvel sépia inspecionadas; conferência de overflow aprovada.
- TypeScript, bundle e smoke aprovados. Lint dirigido dos arquivos alterados: zero erros e
  zero avisos; os dois avisos anteriores do painel foram corrigidos, sem supressões.
- Não foi repetido `npm run validate` nem a cobertura global neste incremento. A reprovação
  integral anterior de 86,02% continua registrada como histórica. As Rules não mudaram
  neste bloco; o teste anterior da coleção privada não é contado como novo resultado.

Logs em `%TEMP%`, prefixo `writer-literary-reconciliation-`: `server-reviewed.log`,
`server-final.log`, `client-final.log`, `browser-final.log`, `lint-final.log`,
`lint-parser.log` e `build-final.log`.
As cinco etapas continuam abertas. Restam os vínculos entre volumes e a auditoria final
de E2, além dos modos operacionais/contínuos de E4 e do fechamento de impacto e
portabilidade de E5. Sem commit, push, merge de volta à principal ou deploy.

## Incremento posterior — vínculos entre volumes

O [contrato de origem entre volumes](05-vinculos-entre-volumes.md) acrescenta `volumeUnit`
com livro/tipo/ID nativos, consulta paginada de livros próprios e unidades, leitura pelo
contexto comum e escopo preservado nos índices. A nova ação `listLiteraryVolumeBooks`
pertence a `planningApi`: **415 ações** no contrato completo. Sem coleção, índice, Rule
ou dependência nova. A principal original permanece limpa em `b9fc03c`.

| Verificação           | Resultado                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor e roteamento | **316/316**: todos `literary*.test.mjs`, `domainCallable` e `domainCallableSdk`. Nove cenários próprios de volumes verificam paginação de 59 livros, homônimos, alteração, revogação/recriação, prosa nativa de cenas, contexto de escrita, impacto e índice de integração. |
| Frontend da feature   | **81/81** em 17 arquivos, incluindo seleção do livro/unidade, troca de conta durante resposta pendente e roundtrip pelos handlers reais com resposta de salvamento perdida.                                                                                                 |
| Chromium              | **6/6**: três temas, desktop/móvel 320 px, livros paginados, capítulos homônimos, rascunho preservado e salvamento por teclado; overflow conferido e capturas desktop claro/móvel sépia inspecionadas.                                                                      |
| Build e tipos         | Uma primeira tentativa apontou import sem uso na fixture. Corrigido; a execução final de typecheck, bundle e smoke passou.                                                                                                                                                  |
| Lint dirigido         | A primeira execução apontou o mesmo import sem uso; a repetição final dos arquivos alterados passou com zero erros e avisos.                                                                                                                                                |
| Sintaxe Functions     | **565 módulos**, saída zero.                                                                                                                                                                                                                                                |

Um cenário de revogação com o provedor pendente expôs um pedido retido como running após
falhar a captura final. Corrigido: a operação vira stale e a resposta tardia fica oculta;
repetir a mesma operação consulta esse estado e não chama o provedor outra vez.

Logs em `%TEMP%`, prefixo `writer-literary-volumes-`: `server-complete.log`,
`client-complete.log`, `browser.log`, `build-final.log`, `lint-final.log` e `syntax.log`.
Não foi repetido o `validate` global/cobertura: 86,02% continua sendo o resultado histórico
anterior a estes incrementos, abaixo dos 90% exigidos. Rules e infraestrutura completa
não foram reapresentadas como nova rodada; nenhuma das cinco etapas foi formalmente
encerrada. Sem commit, push, merge de volta à principal ou deploy.

## Incremento posterior — primeira versão contínua delimitada

O [contrato de execução](06-redacao-continua-delimitada.md) acrescenta limites totais por
capítulo, pausa persistida, revisão de controle e recuperação de resposta perdida.
Aplicação automática usa o mesmo caminho transacional de manuscrito, crédito e recibo;
pausar ou revogar o modo impede uma resposta antiga de aplicar. Alterar limites não
reinicia os gastos. `setLiteraryDraftExecution` integra planningApi: **416 ações**.

| Verificação           | Resultado                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor e roteamento | **325/325**, todos literary*.test.mjs + domainCallable/SDK. Inclui limites, pausa com provedor pendente, cancelamento, concorrência, saldo insuficiente, revogação antes do commit e rollback integral. |
| Frontend da feature   | **85/85**, 17 arquivos. Inclui roundtrip real dos handlers, controle com ACK perdido e respostas tardias após pausa/cancelamento.                                                                       |
| Chromium              | **6/6**, três temas, desktop e móvel 320 px. Limite, pausa, alteração explícita dos totais pelo teclado e preservação da primeira versão. Capturas desktop claro e móvel sépia inspecionadas.           |
| Build e tipos         | Execução final aprovada, incluindo smoke do bundle; permanecem avisos de imports dinâmicos sem divisão de chunk.                                                                                        |
| Lint dirigido         | Zero erros e avisos nos arquivos do incremento, incluindo repetição após correção das disputas de controle.                                                                                             |
| Sintaxe Functions     | **566 módulos**, saída zero.                                                                                                                                                                            |

Logs em `%TEMP%`: `writer-literary-continuous-server-complete.log`,
`writer-literary-continuous-client-final.log`, `writer-literary-continuous-browser-final.log`,
`writer-literary-continuous-build-final.log`, `writer-literary-continuous-lint.log`,
`writer-literary-continuous-lint-control.log` e `writer-literary-continuous-syntax.log`.

Estes resultados são dirigidos, não uma nova aprovação global. O validate histórico
continua reprovado por cobertura de Functions **86,02% contra 90%** e antecede os últimos
incrementos. Não foram repetidas Rules nem infraestrutura completa neste bloco.
E4 ainda exige orientação operacional, vínculo versionado dos modos ao contrato de E1,
coordenação preparação/revisões/versão revisada e passagem entre capítulos/atos.
E5 mantém as pendências integrais de impacto e portabilidade. Sem commit, push ou deploy.

Conferência final deste bloco: check:architecture, check:docs, check:skills e
check:styleguide aprovados; formatação dos arquivos do incremento e git diff --check
aprovados. Nenhum arquivo executável foi alterado pela formatação final.

## Incremento posterior — modo operacional de E1 ligado à redação de E4

O [modo versionado](07-modos-operacionais.md) passa a controlar registro de redação e
aplicação de prosa no servidor, além dos controles visuais. Policy salva acompanha a
revisão do contrato. Observações livres continuam preservadas, contratos sem policy usam
supervisão e fingerprints legados permanecem iguais. Geração/inferência não escolhem a
permissão do autor. Sem nova coleção, índice, Rule, dependência ou callable (416 ações).

| Verificação                     | Resultado                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor literário e roteamento | **331/331**. Testa validação/replay/histórico da policy, registro incompatível, ampliação indevida para contínuo, mudança durante o provedor e revogação depois do commit do histórico nativo, antes de aplicar. Texto e crédito permanecem intactos; recibo confirmado continua recuperável. |
| Criação assistida               | **37/37**. Contrato gerado preserva hipóteses como propostas e descarta policy operacional inserida pelo provedor.                                                                                                                                                                            |
| Frontend da feature             | **94/94 em 18 arquivos**. Inclui os cinco testes já existentes de literaryRecoveryStorage, fora da pasta tests (os 85 anteriores cobriam 17 arquivos dessa pasta). Novo roundtrip real recupera contrato com ACK perdido, recusa aplicação em orientação e preserva escrita manual.           |
| Chromium                        | **12/12** nos três temas, desktop/móvel 320 px: modo orientação, supervisão, histórico, escolha por teclado e contínuo com limites. Capturas de orientação desktop claro e móvel sépia inspecionadas.                                                                                         |
| Build/tipos/smoke               | Aprovados. Avisos existentes de import dinâmico sem divisão de chunk permanecem.                                                                                                                                                                                                              |
| Lint dirigido                   | A primeira execução encontrou require-await e um matcher sem tipo no teste novo; corrigidos. Execução final sem erros/avisos, mais lint específico da proteção na criação assistida aprovado. Declarações .d.mts são conferidas pelos tipos, não pelo lint.                                   |
| Sintaxe Functions               | **568 módulos**, aprovada.                                                                                                                                                                                                                                                                    |

Logs em `%TEMP%`, prefixo `writer-literary-collaboration-`: `server-reviewed.log`,
`creation.log`, `client-reviewed.log`, `lint-reviewed.log`, `lint-creation.log`,
`browser-final.log`, `browser-reviewed.log`, `build-final.log` e `syntax.log`.

A policy e sua revisão são capturadas em jobs novos; mudar o contrato invalida fontes e
preparação anteriores. O teste de aplicação muda a policy somente depois da preservação
real do histórico, conferindo o bloqueio na transação final. Replay de recibo confirmado
não duplica texto/créditos. Sessões do contrato isolam autor/livro; a tela de execução usa
apenas a escolha salva, sem promover o rascunho a permissão.

Estes testes dirigidos não substituem o gate global. A execução histórica de validate
(5279 frontend, cobertura Functions 86,02% contra 90%) antecede os incrementos recentes e
continua sem aprovação; não houve nova rodada global, Rules ou infraestrutura completa.
O objetivo integral permanece ativo: E4 ainda exige coordenação das fases/capítulos/atos
com reconciliação/reuso; E3 exige auditoria completa das entradas, agora incluindo o modo;
E1/E2 mantêm os aceites pendentes e E5 o fechamento de impacto/portabilidade. Sem commit,
push, integração de volta à principal ou deploy.

Conferência estática posterior deste incremento: check:architecture, check:docs,
check:skills e check:styleguide aprovados; diff sem erros de whitespace. A principal
original continua limpa e os manifests/locks de dependências não foram alterados.

## Incremento posterior — ciclo editorial privado de capítulo (E4)

A principal consolidada foi incorporada antes dos testes. Base local conferida:
`b9fc03c57a34cec25a3ebec13974023ba5a17fb8`, igual à principal original, que permanece
limpa. O [ciclo editorial](08-ciclo-editorial-capitulo.md) conecta preparação, primeira
versão, revisão integral e versão revisada de um capítulo. São seis ações no registro
existente (422 no total), sem nova Function, dependência ou índice.

| Verificação                            | Resultado                                                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor literário, cenas e roteamento | **375/375**, incluindo 25 testes do coordenador, recibos, disputa, gasto, pausa e origens recriadas.                                                                                                             |
| Frontend                               | **105/105 em 19 arquivos**, incluindo oito testes do painel e roundtrip real com ACK perdido após texto/crédito.                                                                                                 |
| Chromium                               | **18/18**, três temas, desktop e móvel de 320 px, teclado, pausa e passagens supervisionadas. Capturas finais desktop claro e móvel sépia inspecionadas. Usa fixtures locais, sem geração ou débito de produção. |
| Rules                                  | **32/32 no shard dirigido**, incluindo bloqueio SDK dos controladores para dono, terceiro e anônimo. Não representa a suíte completa de Rules.                                                                   |
| Build, tipos e smoke                   | Aprovados; permanecem avisos existentes de imports dinâmicos sem divisão de chunk.                                                                                                                               |
| Lint dirigido                          | Aprovado sem erros ou avisos após corrigir mutação de referências no painel.                                                                                                                                     |
| Sintaxe Functions                      | **570 módulos**, aprovada.                                                                                                                                                                                       |

Logs em `%TEMP%`: `writer-literary-workflow-origin-server-all.log`,
`writer-literary-workflow-immutable-client.log`, `writer-literary-workflow-origin-browser.log`,
`writer-literary-workflow-rules-shard.log`, `writer-literary-workflow-immutable-build.log`,
`writer-literary-workflow-immutable-lint.log` e `writer-literary-workflow-origin-syntax.log`.

O registro congela o token do escopo antes de enviar; a ativação confirma o nascimento
nativo do job. Passos e controles exigem a origem observada, sem recapturá-la para retry.
Ator e nascimentos de livro/capítulo/job são reconferidos; cópias/recriações não rearmam
permissões. Recuperação repete o mesmo passo e não consome a unidade seguinte. Pausa e
cancelamento fecham os filhos atomicamente. Reconciliação conserva gastos e primeira
versão; alteração só de histórico reutiliza a revisão aceita sem nova IA.

Não houve nova execução global de validate ou cobertura. O resultado global histórico
(5279 testes frontend; Functions 86,02% contra 90%) antecede estes incrementos e continua
sem aprovação. As cinco etapas permanecem abertas: faltam passagens entre capítulos/atos,
auditorias finais de E1/E2/E3/E4 e o fechamento de impacto/portabilidade em E5. Sem commit,
push, integração de volta à principal ou deploy.

Conferencia final do ciclo: check:architecture, check:docs, check:skills e
check:styleguide aprovados; formatacao do conjunto literario e git diff --check
aprovados. Nenhum arquivo executavel mudou na formatacao final. Manifests e locks
permanecem sem alteracoes; principal original limpa no mesmo b9fc03c.

## Incremento posterior — condições nativas de passagem (núcleo servidor E4)

O [contrato09](09-condicoes-de-passagem.md) acrescenta pré-requisitos opcionais ao ciclo
existente e mantém ausências/fingerprints legados. Não houve mudança de interface neste
bloco: seleção visual, execução entre múltiplos capítulos e política tipada de publicação
prévia ainda estão pendentes. As cinco etapas continuam abertas.

- **385/385 backend** no conjunto literário, cenas e roteamento. Inclui **35 testes do
  ciclo**, dez novos. Usa os serviços nativos de preparação, escrita, história, revisão e
  integração para concluir dois capítulos e atravessar atos após cobertura/aceite.
- Os novos casos cobrem preflight congelado, revisão/versões/ciclo/ato recriados, ordem
  reversa, integração desatualizada, payload extra, cancelamento após invalidação e
  edição do predecessor durante o provedor: nenhum texto ou crédito do próximo capítulo
  é aplicado nesse caso. Replay de ciclo concluído conserva créditos.
- **Typecheck e lint dirigido aprovados**. O primeiro lint encontrou um import que ficou
  sem uso após extrair o leitor, corrigido na rodada final. Uma chamada incorreta no teste
  novo foi corrigida para usar updateScene real antes da execução aprovada.

Logs em `%TEMP%`: `writer-literary-passage-server-final.log` (35),
`writer-literary-passage-all-server-final.log` (385),
`writer-literary-passage-lint-final.log` e `writer-literary-passage-types.log`.

Não houve nova rodada global de validate/cobertura, build, navegador, frontend ou Rules
neste bloco de servidor. As evidências anteriores permanecem identificadas nos blocos
anteriores, sem promovê-las a verificação dos novos contratos. O gate global continua
não aprovado; thresholds preservados. Principal original limpa em b9fc03c, sem alteração
de dependências e sem commit, push, integração de volta à principal ou deploy.

Conferência final deste núcleo: sintaxe de **573 módulos Functions** aprovada
(`writer-literary-passage-syntax.log`), arquitetura, documentação, skills e styleguide
aprovados. O caso de passagem também abre o ciclo anterior após nova gravação de
histórico e conclui o próximo capítulo sem análise ou débito duplicados; rodada dirigida
35/35 em `writer-literary-passage-history-server.log` e conjunto final385/385 repetido
após essa alteração. Lint final sem erros/avisos; typecheck terminou com exit0.

## Incremento posterior — seleção das condições de passagem (E4)

A [seleção10](10-selecao-de-passagem.md) conecta o núcleo09 à preparação do capítulo.
Condição escolhida e token de preflight permanecem congelados no registro pendente.
Listagem por livro é metadata paginada; itens não comprovam prontidão sem reconferência.

| Verificação                           | Resultado                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend literário, cenas e roteamento | **387/387**, incluindo37 do ciclo. Novos casos de descoberta por livro, página filtrada com cursor, dono/ator/nascimento, título atual, agrupamento obsoleto e DTO sem corpo/instrução.                                                                                                           |
| Frontend da feature                   | **109/109 em19 arquivos**, incluindo12 do painel e11 roundtrips. Paginação, obrigação por ato, seleção incompleta, erro, troca de livro e ACK perdido sem recapturar preflight.                                                                                                                   |
| Cliente/servidor reais                | Roundtrip ampliado conclui dois capítulos; perde ACK após aplicação e após registro de passagem. Recibos confirmam o mesmo pedido e créditos locais passam7→5→4, sem duplicação. Journal não contém orientação ou wire do predecessor. Double transacional local, sem produção.                   |
| Chromium                              | **12/12**, três temas, desktop e móvel320. Rodada complementar **6/6** captura seleção antes de registrar; são os mesmos seis casos de passagem, não novos casos únicos. Teclado, nomes longos e overflow conferidos. Capturas desktop claro e móvel sépia da seleção e checkpoint inspecionadas. |
| Build/tipos/smoke                     | Aprovados, exit0. Permanecem avisos existentes de chunks grandes/imports dinâmicos sem divisão.                                                                                                                                                                                                   |
| Lint dirigido                         | Aprovado, sem erros/avisos.                                                                                                                                                                                                                                                                       |

Logs em `%TEMP%`, prefixo `writer-literary-passage-ui-`: `server.log` (37),
`all-server.log` (387), `client.log` (12), `roundtrip.log` (11), `all-client.log` (109),
`browser.log` (12), `browser-selection.log` (6), `build.log` e `lint.log`.
Navegador usa fixtures visuais locais e não IA/débitos de produção.

Sem nova coleção, índice, dependência ou ação:422 no registro existente. Principal
original limpa em b9fc03c, manifests/locks intactos. Não houve nova rodada global de
validate/cobertura nem Rules neste incremento. O resultado histórico86,02%<90 continua
sem aprovação e antecede estes blocos. Ainda faltam coordenação de múltiplos capítulos,
orçamento agregado, publicação anterior obrigatória e os demais aceites do plano
integral. Sem commit, push, integração de volta à principal ou deploy.

Conferencia final do incremento10: check:architecture, check:docs, check:skills e
check:styleguide aprovados; formatacao de todos os arquivos tocados e git diff --check
aprovados. Nenhum arquivo executavel mudou durante o fechamento da documentacao.

## Incremento posterior — núcleo agregado e principal1bc6ba8 incorporada

O [núcleo11](11-orcamento-agregado-nativo.md) acrescenta escopo nativo ordenado,
vínculo interno de ciclos e ledger de aplicações/créditos junto ao commit de prosa.
Ainda não há driver HTTP/recuperação/ UI de sequência; registro permanece422 ações.
Nova coleção literarySequenceJobs com SDK bloqueado e limpeza bounded já incorporados.
Propostas da sequência não podem ser aplicadas fora do seu ledger; replays preservam
contagem e saldo. O núcleo mantém orientação/modelo/raciocínio e rejeita fases revogadas.

Antes de encerrar o bloco foi detectado avanço externo da principal. O stash
06deab0df63d5a4444df66fd4a79eaaa2defff67 preservou as275 entradas locais, master foi
incorporada por fast-forward de b9fc03c para **1bc6ba8b89eef425886fa50674b68977b6c24129**,
e o stash foi aplicado e mantido como recuperação. Resolvidos seis conflitos:
architecture, teste servidor do assistente, componente/teste do assistente persistente,
nova criação e Vite visual. Conservaram-se onboarding/perfil/dock e guia editorial
inspecionável, com respostas limitadas à prova de origem reautorizada. Não houve commit.

| Verificação posterior à incorporação | Resultado                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend dirigido                     | **451/451**, conjunto literário/cenas/roteamento + pageAssistant e assistedBook. Inclui14 casos do núcleo agregado e37 de ciclo; fixtures compartilhadas preservam todos os casos anteriores.                     |
| Frontend dirigido                    | **191/191 em29 arquivos**, produção literária, page-assistant, onboarding, project-creation e StudioNavigation. Inclui109 literários e o roundtrip real de dois capítulos.                                        |
| Chromium                             | **72/72**, ciclos/passagens, onboarding e criação (manual/IA para Livro/Aventura/Campanha, ação em diálogo e continuidade), três temas e desktop/móvel. Capturas claro desktop e sépia móvel novas inspecionadas. |
| Firestore Rules                      | **41/41 no shard9/16**, demo emulador1.22.0. Caso de privacidade verifica agora ciclos e sequência, leitura/lista/criação/update/delete negados a dono/terceiro/anônimo. Não equivale à suíte completa.           |
| Build/tipos/smoke                    | Aprovados, exit0; avisos existentes de tamanho de chunk/import dinâmico permanecem.                                                                                                                               |
| Lint dirigido                        | Aprovado sem erros/avisos, incluindo todos os arquivos de código reconciliados. Imports não usados após extrair fixtures foram corrigidos antes do resultado final.                                               |
| Sintaxe Functions                    | **576 módulos**, aprovada na nova base.                                                                                                                                                                           |

Logs em `%TEMP%`, prefixo `writer-literary-sequence-main-`: `server.log`, `client.log`,
`browser.log`, `rules.log`, `build.log`, `lint.log` e `syntax.log`.
Evidência dirigida do novo núcleo em `writer-literary-sequence-core-verified.log`:
14/14. Resultados anteriores à incorporação (401backend,109frontend,32Rules e build)
são históricos e não substituem os acima. O primeiro caso de limite de passos esperava
exceção em vez do checkpoint nativo budget; foi corrigido para conferir parada real,
contador inalterado e atalho de avanço recusado.

Os testes do núcleo percorrem dois capítulos com consumo3/3, bloqueio de aplicação
fora do ledger, replay, pausa durante o provedor, decisão supervisionada da próxima
unidade, origem/registro retirados, confirmação de registro interrompido, snapshot de
geração fixado e contador inválido. São composição nativa com double transacional;
Chromium usa fixtures sem IA ou débito real de produção. Não há teste HTTP da sequência
porque ela ainda não foi exposta. Resposta incerta dos controles e fechamento por
operação exige a bridge/outcomes do próximo incremento antes de exposição.

O checkout original mantém intocados seus três arquivos documentais não commitados:
docs/deployment.md, docs/first-use.md e docs/entregas/2026-11-03-deploy-primeira-experiencia.md.
Manifests/locks sem mudança; nenhuma implantação ou push nosso. A incorporação da
principal é distinta de integrar o trabalho literário de volta. O objetivo integral
permanece ativo,0/5 etapas encerradas. Ainda faltam o driver/recovery/UI e a política
tipada de publicação obrigatória, aceites E1/E2/E3/E4 e E5 de impacto/portabilidade.
Não houve nova execução global de validate/cobertura; histórico86,02%<90 não aprova
esta base e os thresholds continuam preservados.

Conferencia estatica final na base1bc6ba8: architecture/docs/skills/styleguide
aprovados, formatacao dos arquivos tocados e git diff --check aprovados; nenhum
conflito pendente. Nenhum executavel mudou depois dos testes finais dirigidos.

## Incremento posterior — driver serial interno de sequências e outcomes (E4)

Na base1bc6ba8, [driver12](12-driver-serial-e-outcomes.md) compõe ações nativas com
write-ahead e wire congelado, sem transporte HTTP ou UI de sequência ainda expostos.

- **18/18** novos casos do driver: dois capítulos, orçamento comum, fronteiras de
  capítulo/ato, ampliação explícita no meio do capítulo, fonte/IDs recriados, operações
  duplicadas e ACK perdido após congelamento, registro, prosa/débito e fechamento.
- **469/469 backend dirigido**, conjunto literário/cenas/roteamento + pageAssistant e
  assistedBook. Os14 casos do núcleo e37 do ciclo foram preservados após extrair a
  fixture de sequência compartilhada. O primeiro conjunto teve468 antes do caso final
  de perda de ACK do congelamento; a rodada final tem469, sem somar execuções repetidas.
- **109/109 frontend literário em19 arquivos**, incluindo roundtrips existentes.
- **Lint dirigido aprovado**, sem erros/avisos após remover imports e helper não usados.

Logs em `%TEMP%`, prefixo `writer-literary-sequence-driver-`: `final.log` (18),
`server-final.log` (469), `client.log` (109), `lint-final.log` e `syntax.log`.

Pausa/cancelamento durante provedor produzem superseded para o ticket original e
bloqueiam débito/texto tardios. O teste de controle também distingue replay do mesmo
pedido de um novo pedido com CAS antigo; não confirma o segundo pelo valor atual.
O outcome de start cancelado não implica ativação e sua revisão original é preservada
quando há confirmação explícita posterior. Consulta devolve apenas metadata, sem wire
ou orientação. Os testes usam núcleo real com double transacional local.

Nenhuma mudança de interface, Rule, índice, dependência ou action neste bloco:422 ações.
Não houve nova rodada de Chromium, Rules, build ou validate global; suas evidências
anteriores continuam históricas e não comprovam o transporte/interface ainda ausentes.
O gate global segue pendente, cobertura não recalculada e thresholds preservados.
Faltam bridge cliente/recuperação e UI antes de expor o driver, política tipada de
publicação prévia e os demais aceites do plano integral. Sem commit, push ou deploy.

## Validação global após consolidação da principal — 2026-11-03

Worktree literária e master local confirmadas na base `1bc6ba8b89eef425886fa50674b68977b6c24129`.
As três alterações próprias do checkout principal foram preservadas. Não há conflitos
pendentes nem mudança nos manifests/locks nesta rodada.

- `npm run validate`: **exit 1**, interrompido no threshold de cobertura de funções do
  frontend. **5.357 testes aprovados em 417 arquivos**, sem falhas de teste.
- Cobertura: statements **87,42%**, branches **82,85%**, functions **86,23%**
  (9.193/10.660; mínimo **90%**), lines **90,55%**. Aqui functions é a métrica
  de cobertura de funções do frontend, não a suíte de Cloud Functions. Não alterar o
  limite nem interpretar testes verdes como gate global aprovado.
- Arquitetura, documentação, skills, styleguide, formatação integral e lint completo
  (39 grupos) aprovados antes da cobertura.
- `npm run build` executado separadamente após a interrupção: **exit 0**,
  typecheck, bundle de produção e smoke aprovados. Avisos de chunks/imports dinâmicos
  não impediram o build; não houve publicação.
- `npm run test:setup` executado separadamente após a interrupção: **exit 0**;
  **116/116** testes de setup e **5.374/5.374** testes das Functions aprovados, sem
  falhas, cancelamentos ou testes ignorados. A conferência de sintaxe também passou
  com **577 módulos**.
- Sintaxe das Functions: **577 módulos**, exit 0. Os resultados dirigidos 469/109
  continuam evidência do incremento e não devem ser somados ao total da suíte geral.

Logs em `%TEMP%`: `writer-principal-integrada-validate.log`,
`writer-principal-integrada-build.log` e `writer-principal-integrada-setup.log`.
Avisos de `act(...)` e fallback IndexedDB apareceram nos testes; não causaram falha.
Sem nova rodada Chromium/Rules nesta rodada. Gate global e aceites integrais continuam
abertos; sem commit, push, integração de volta na principal ou deploy.

A rodada terminal não aprova integração: a cobertura de funções permanece abaixo do
limite e os aceites funcionais integrais continuam pendentes. Os testes dirigidos não
são somados às suítes completas. Não houve ajuste de thresholds ou código para passar
esta rodada; somente registro e correção do resumo documental.

## Incremento 13 — cliente e recuperação de sequência, 2026-11-03

Base isolada 1bc6ba8; [fronteira e comportamento](13-cliente-e-recuperacao-de-sequencias.md).
Nenhuma nova ação foi registrada em Functions; catálogo permanece 422. Não há prova
HTTP/setorial da sequência nem UI de seleção/consentimento neste incremento.

- **76/76 testes nativos**: núcleo (14), driver (25) e ciclo (37), exit 0.
  Incluem a retomada por IDs do pedido privado, ACK perdido após registro/prosa,
  paginação com página filtrada, conta/livro recriados, controles posteriores e hashes
  imutáveis nos recibos de start/advance/control. Sem novo provedor na recuperação.
- **123/123 testes frontend da feature em 20 arquivos**, exit 0, incluindo as provas
  do cliente sobre núcleo real e as dez interações do painel. Após essa rodada, a
  referência metadata da retomada também foi congelada antes do await: os **10/10**
  testes cliente finais passaram, incluindo mutação do objeto durante consulta.
  Não somar rodadas repetidas nem apresentar 123 como total atual recalculado após
  esse último caso adicional.
- **6/6 cenários Chromium**, três temas, desktop e 320 px: consulta não produz, botão
  de retomada separado, ativação por Enter, diário retirado somente após resultado,
  sem overflow horizontal. Captura mobile sépia inspecionada; dock minimizado pelo
  controle real antes da captura. Backend visual fictício, rede externa bloqueada.
- **Typecheck aprovado** e **lint dirigido aprovado** após corrigir quatro callbacks
  async sem await em fixtures/testes. O ajuste final de captura metadata é coberto
  pelo teste cliente acima; o lint final correspondente também passou no fechamento.

Logs em `%TEMP%`, prefixo `writer-literary-sequence-bridge-`: `native-final.log`,
`regression-final.log`, `client-final.log`, `browser-final.log`, `types-final.log`,
`lint-final.log` (primeira conferência final) e `closure-lint.log` (fechamento).

O hash de intenção é vinculado ao fingerprint/recibo nativos e conferido pelo cliente;
mesmo método/ID/revisão com outro hash não encerra a pendência. A consulta histórica
não remove uma intenção por observar estado atual do job. Não houve enfraquecimento
de teste, cobertura ou regra. A UI de recuperação é isolada por conta/livro; ACK tardio
não recolore outra sessão nem retira seu diário.

Não houve nova rodada global de cobertura/build/Rules neste incremento. A medição
86,23% de funções do frontend pertence à rodada integral anterior ao incremento 13,
continua sendo o último dado global e não comprova o código posterior. O gate segue
aberto; 0/5 etapas formalmente encerradas. Sem commit, push, integração de volta ou deploy.

Fechamento do incremento 13: arquitetura, documentação, skills, styleguide, Prettier
nos arquivos afetados e git diff --check aprovados; lint final da captura metadata
aprovado. Catálogo puro contado em 422 ações, sem conflito pendente ou alteração de
manifest/lock. Checkout principal reconferido: preservadas as três alterações documentais
do autor. Nenhum processo de teste conhecido permanece pendente nesta rodada.

## Incremento 14 — sequência na interface e nos setores, 2026-11-03

Base isolada 1bc6ba8, [escopo implementado](14-interface-e-setores-de-sequencia.md).
Catálogo conferido em **430 ações/16 setores**. Seis ações metadata/controle em
planningApi, dois produtores em generationApi; hooks e complete não são públicos.

- **85/85 backend dirigido**, exit 0: núcleo/driver/ciclo e roteamento/SDK real.
  O novo caso SDK percorre as oito ações com Firestore adaptado para o double nativo,
  verifica o setor correto, rejeita helpers e não debita ao registrar/consultar.
- **139/139 testes da feature frontend, em 21 arquivos**, rodada final exit 0.
  Inclui seleção paginada/reordenação, prévia/consentimento, fases, orçamento, fronteiras,
  ACK perdido, troca de conta, retomada de outro dispositivo e painéis gerenciados.
  Os percursos pela UI usam handlers setoriais e serviços nativos reais sobre double
  transacional: contínuo conclui dois capítulos/3 aplicações/3 créditos; supervisionado
  confirma duas cenas e fases, conclui um capítulo/2 aplicações/2 créditos. Sem dívida
  local ao terminar. Os 14 testes cliente nativos fazem parte de 139, não somar.
- **12/12 Chromium** na rodada de sequência+recuperação, com três temas, desktop e
  320 px. A inspeção encontrou texto cortado no consentimento móvel; foi corrigido
  com quebra/altura automática e a sequência foi reconferida em **6/6** cenários.
  Não somar essas repetições. Capturas mobile sépia e desktop escuro inspecionadas.
  Backend visual fictício com rede externa bloqueada; não é produção autenticada.
- **41/41 Rules** no shard **9/16**, dez arquivos, emulador demo 1.22.0 com JAR
  verificado. Inclui a recusa de get/list/create/update/delete de jobs de ciclo e
  sequência para dono, outra conta e anônimo. Deny de literarySequenceJobs explícito;
  inventário de exclusão preexistente confirmado em sceneJobs. Não equivale à suíte
  inteira de Rules. Avisos PERMISSION_DENIED são as recusas esperadas das asserções.
- Lint final do incremento aprovado. Typecheck/bundle/smoke aprovados nas rodadas de
  build; a última conferência após o ajuste assíncrono também terminou com exit 0
  (`build-verified.log`: typecheck, bundle e smoke).

Falhas corrigidas durante o incremento: a prévia móvel não quebrava o texto do botão;
o checkpoint aberto durante avanço podia ficar preso antes da proposta; e um frame
antigo podia regredir o aceite já confirmado pelo checkpoint nativo. A sincronização
assíncrona cancela callbacks antigos e conserva modal/recibos pendentes. O teste inicial
supervisionado expôs o checkpoint obsoleto; não foi resolvido apenas alterando timeout.
Os dois percursos integrados possuem janela própria de 20s, preservando todas as
asserções e os limites produtivos; o teste contínuo não fica pendente para contaminar
outro caso ao exceder o limite curto original sob concorrência. A suíte final passou.

Logs em `%TEMP%`, prefixo `writer-literary-sequence-ui-`: `server.log`,
`client-verified.log`, `native-client-final.log` (rodada intermediária),
`supervised-final.log` (percursos e guard do aceite), `browser.log`,
`browser-final.log`, `rules.log`, `lint-verified.log`, `build-verified.log`.
Não houve dependência, índice ou coleção nova. Não reduziram cobertura/asserções/Rules.
A medição global anterior (86,23% de funções frontend < 90%) não foi recalculada; os
resultados dirigidos e o build não aprovam esse gate. Nenhuma etapa formalmente fechada,
commit, push, integração de volta à principal ou deploy.

Fechamento 14: arquitetura, documentação, skills, styleguide, Prettier e git diff --check
aprovados. Lint verificado e build/typecheck/smoke finais aprovados após a correção dos
checkpoints. Todos os handles conhecidos terminaram; Playwright e runner de Rules
encerraram seus servidores de teste. Não há conflito pendente ou alteração de manifests/
locks. Worktree e master continuam na base 1bc6ba8; mudanças paralelas não commitadas do
operador na principal foram preservadas. A próxima tarefa é a política tipada de
publicação prévia, mantendo o objetivo integral ativo e o gate global pendente.

## Integração da principal em 2026-11-03 — rodada em andamento

Solicitação: incorporar a principal consolidada antes dos testes finais. A primeira
conferência encontrou master e a worktree literária em `1bc6ba8`; origin/master foi
atualizada por fetch e estava em `b9fc03c`, ancestral dessa base. Durante os testes,
o operador avançou a master para `296261c2ba5a27286a2824bafb15b3f484ac8538`.

A worktree `codex/producao-literaria` recebeu esse commit por fast-forward. O trabalho
literário foi preservado no stash `97c2c620713386ff671c73d166ad8da124a3d95e` e
reaplicado com índice, sem conflitos. Os 268 arquivos novos foram comparados por hash
com a cópia do stash: nenhum ausente ou alterado. O teste de callable sobreposto foi
combinado automaticamente. O stash e as cópias anteriores foram mantidos; nenhum
manifest/lock foi alterado, nem foi modificado o checkout principal pelo agente.

Resultados da base anterior, que não equivalem à validação da nova base:

- `npm run validate`: verificações estáticas e lint aprovados; frontend com 5.385
  testes aprovados e sete timeouts em quatro arquivos, de 5.392 testes/420 arquivos.
  Cobertura de funções frontend 86,32%, abaixo do gate de 90%; statements 87,52%,
  branches 83% e linhas 90,65%. Sem mudança de limiar ou asserção.
- `npm run test:setup`: 116 testes de scripts e 5.382 de Functions aprovados;
  sintaxe dos 577 módulos aprovada, processo terminado com exit 0.
- Nove specs literários no Chromium: 60/60 aprovados, três temas e desktop/mobile.
  Build/typecheck/bundle/smoke aprovados, ambos os processos terminaram com exit 0.
- A suíte completa de Rules foi interrompida com sua árvore de processos local
  após a principal avançar, antes de trocar os arquivos. Não houve resumo final;
  os casos parciais aprovados não constituem aprovação da suíte completa.

Logs anteriores em `%TEMP%`, prefixo `writer-literary-final-master-`: `validate.log`,
`setup.log`, `browser.log`, `build.log` e `rules.log`. As sete falhas foram timeouts
em `bookRestoreNativeRoundtrip`, `bookLoreVisibilitySelection`,
`bookLoreVisibilitySelectionSession` e `bookCoverBackupRecords`. A nova principal
ajusta workers/timeouts em parte dessas áreas; não atribuir causalidade antes da
repetição. O validate está sendo repetido sem outra suíte pesada em paralelo,
com log `writer-literary-master-296261c-validate.log`.

Esta rodada trata de integração e validação, sem novo incremento funcional. A política
tipada de publicação prévia e os demais aceites do plano integral continuam pendentes;
0/5 etapas formalmente fechadas. Sem commit literário, push, integração de volta ou deploy.

### Resultado terminal em 296261c e segundo avanço da principal

A reaplicação automática havia duplicado o import de domainSdkFixture em
adventureRestoreCallable.rules.test.mjs. O lint detectou a duplicata; removida a
linha redundante, o arquivo ficou idêntico à principal e passou em node --check
e ESLint. Os demais 38 grupos do lint não apresentaram falhas. A cadeia validate
foi interrompida nesse erro e suas etapas restantes foram executadas separadamente;
não registrar o comando integral como aprovado.

Na worktree baseada em296261c, com as alterações literárias reaplicadas:

- Frontend completo: 5.396/5.396 testes, 420/420 arquivos, duração1083,35s. Os quatro
  arquivos com timeouts anteriores passaram. Funções86,32% (9318/10794) <90%; demais
  métricas: statements87,52%, branches83%, linhas90,65%. Processo exit1 pela cobertura.
- Scripts:116/116, regressão de adventureRestoreImageStorage:17/17, sintaxe577 módulos,
  build/typecheck/bundle/smoke: todos com exit0. A suíte completa de Functions5382
  pertence à base anterior, não foi repetida integralmente em296261c.
- Chromium:60/60, três temas e desktop/mobile, exit0. Rules:41/41 no shard9/16,
  dez arquivos, duração315494ms, exit0. Não é a suíte completa de Rules.
- Logs em %TEMP% com prefixo writer-literary-master-296261c-: validate.log (erro de
  integração), coverage.log, scripts.log, functions-regression.log, build.log,
  browser.log, rules9.log. Todos os processos dessas execuções terminaram.

Ao reconferir a principal, ela havia avançado para
e86a547f9d30d615aafcf77ec163cdbe24be8f2b, com ajustes de espaço útil/seleção/leitor.
O trabalho foi preservado no stash cba1ae4afb260eaa678ba912d4b50c729dd756bc,
a principal foi incorporada por fast-forward e o stash reaplicado, sem conflitos.
A combinação de ReaderView.module.css preservou tanto os recuos medidos da principal
quanto os estilos do guia literário. Os dois stashes recentes permanecem guardados.

Lint/formato dos arquivos alterados, arquitetura/docs/styleguide passaram em e86a547.
A rodada final foi fixada nessa base; frontend completo novamente em execução isolada,
log %TEMP%/writer-literary-master-e86a547-coverage.log. Não transportar a medição de
296261c como medição global de e86a547. Functions, Rules e scripts não foram alterados
entre esses dois commits; a validação de UI/build será reconferida depois da cobertura.

### Suíte completa em e86a547 e incorporação final de CSS

Frontend completo em e86a547:5.397/5.397 testes,420/420 arquivos,1080,67s. Funções
86,32% (9318/10794) <90%; statements87,52% (40356/46108), branches83% (35151/42346),
linhas90,65% (37288/41131). Processo terminou com exit1 somente pelo limiar de funções.
Node24.21.0. Log:%TEMP%/writer-literary-master-e86a547-coverage.log. Build/typecheck/
bundle/smoke nessa base passou, exit0. A rodada de navegador foi interrompida para
incorporar os próximos commits; não contar seus casos parciais como suíte concluída.

Durante a conferência chegaram2b65552 e f1bbfed. Inspeção confirmou que só alteravam
CSS de camadas do chat/autocomplete, helpers/especificações visuais, documentação e
o timeout de um teste.mjs de cifragem (20s para60s; mesmas asserções e volume >8MiB).
Diff de todos os arquivos.ts/.tsx de src, Functions, scripts e firestore.rules entre
e86a547 e f1bbfed vazio: o código de produção instrumentado pela cobertura não mudou.
A medição completa continua identificada como e86a547, não uma nova execução em f1bbfed.

Tudo foi preservado no stash7619b4b5f0ab9ed9268ac4784039179a56dc93ce; fast-forward
para f1bbfed170901f5333320331f2ddc3cbfbb06567 e reaplicação sem conflitos. Os stashes
anteriores permanecem. Lint/formato dos arquivos novos e docs/styleguide passaram.
No momento deste registro estão em execução build, três arquivos de testes afetados
e Chromium ampliado (literatura, leitor, ajustes/seleção do editor), com logs em%TEMP%
prefixados writer-literary-master-f1bbfed-. Functions/scripts/Rules permanecem idênticos
aos da rodada296261c, cujas provas dirigidas estão registradas acima. Não repetir a suíte
completa por alterações só de CSS/timeouts; confirmar primeiro as verificações afetadas.

### Fechamento da rodada pós-integração

HEAD literário e master reconferidos em f1bbfed. Build final aprovado; 60/60 testes
nos três arquivos afetados aprovados. A rodada visual ampliada terminou em108/114:
as seis falhas eram variantes do mesmo envio da seleção do editor. O hook novo
consultava literaryWritingService, ainda não mapeado na prévia; a proteção contra
Firebase real produzia o erro antes da geração fictícia.

Correção exclusiva de prévia: alias em vite.visual.config, fixture de contexto ausente
com origem própria/capítulo conferidos e recusa de contratos/planos configurados, e
asserção de IDs/modo no cenário. Sem alterações de produção, credenciais ou liberação
do Firebase. Formato/ESLint dos três arquivos passaram, assim como typecheck final.
A reconfirmação dos ajustes do editor, colaboração e sequência passou42/42 nos seis
projetos, incluindo todas as variantes antes reprovadas. Não somar os totais nem
apresentar114/114 como uma única rodada verde. Os artefatos anteriores foram mantidos;
a reconfirmação usou visual-test-results/context-fix e reporter list.

Logs adicionais em%TEMP%: writer-literary-master-f1bbfed-browser-context-fix.log e
writer-literary-master-f1bbfed-typecheck-final.log. Prévias mobile de seleção/autosave
e último capítulo do leitor inspecionadas; formatação e paginação preservadas acima
das respectivas barras. Todos os handles conhecidos terminaram; sem preview próprio
mantido. O gate de cobertura continua reprovado pela última medição completa em e86a547:
5397/5397 testes passaram, funções86,32% <90%. Não repetir uma suíte completa por esta
correção de fixture sem mudança de produção. O relatório legível e o alcance de cada
base estão em validacao-pos-integracao-principal-2026-11-03.md. O objetivo integral
continua ativo; nenhuma etapa formalmente encerrada, sem commit/push/deploy literários.

### Conferência terminal em cc92d1b

A principal avançou apenas em CSS do divisor, styleguide e registro próprio de entrega.
Os três caminhos foram conferidos limpos antes do fast-forward para
cc92d1b5cb695e9745a37578a7f3f9e52ed61cb6; os demais arquivos locais foram preservados.
Build/typecheck/bundle/smoke final aprovado e18/18 Chromium de divisor/workspace nos seis
projetos aprovados (1,3min). Logs%TEMP%/writer-literary-master-cc92d1b-{build,resize}.log.
Ambos os processos terminaram exit0. Nenhum código de produção instrumentado foi
alterado desde a medição completa de e86a547; o relatório distingue execução e
aplicabilidade de cada prova. A reconfirmação anterior de fixture permaneceu42/42,
e a rodada ampliada original108/114 foi preservada como histórico, sem esconder falhas.
A cobertura global continua86,32% <90%; não há aprovação integral ou publicação.

## Encerramento da rodada fixada em 16d8af5

Foi incorporado16d8af59f1e2739f1cf9a5b9e399212ea65438cd, correção TSX de foco do diálogo
narrativo e reforço de teste, com caminhos previamente limpos. A rodada ficou fixada
nesse commit. Testes da feature narrativa:81/81 em5 arquivos,17,03s, exit0. Lint dos
dois arquivos e build/typecheck/bundle/smoke aprovados, exit0. Logs em%TEMP% com prefixo
writer-literary-master-16d8af5-: narrative.log e build.log.

Como houve mudança de produção depois de e86a547, foi executada outra suíte completa
exclusiva em16d8af5:5397/5397 testes,420/420 arquivos,871,49s. Nenhum teste falhou.
Cobertura: statements87,52% (40358/46110), branches83,01% (35156/42350), funções do
frontend86,32% (9318/10794), linhas90,65% (37290/41133). Processo exit1 exclusivamente
porque funções não atingiram90%; limiares e asserções foram preservados. Essa é a
medição final desta rodada, no log%TEMP%/writer-literary-master-16d8af5-coverage.log.

Todos os handles conhecidos estão terminais; nenhum runner de teste próprio ativo.
Documentação legível atualizada para16d8af5, com diferenças entre rodadas, fixture
corrigida, reconfirmação42, divisor18, testes afetados60 e provas nativas dirigidas.
Não somar os totais nem transformar o shard9 em fullRules ou a regressão17 em fullFunctions.
A principal continua sendo editada pelo operador; esta conferência identifica o commit
incorporado/testado, sem perseguir indefinidamente ref mutável durante a execução.
Sem commit literário/push/integração de volta/deploy. Objetivo integral ativo,0/5 etapas
formais, pendências funcionais e cobertura preservadas no plano e na continuação.
