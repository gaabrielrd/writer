# F2-09 A — Contexto autorizado e IA de cenas/blocos

**Estado em 2026-10-21:** implementado e validado localmente; CI do novo head pendente.
**Base:** I em `ffc01d91bfd1661083ffa8f4eb2deed3db7a29da`, commit/push com hooks
normais verdes. HEAD/upstream/remoto coincidem; PR 21 aberto em rascunho com esse
head e master original limpa em `522ccaa`. Regras remotas 39622654323 verdes,
162/162 sem skip; CI geral 39622654285 concluída verde. A descoberta/plano A
avançou durante a CI, conforme autorizado.
**Origem:** [sequência F2-09](25-lore-importacao-e-portabilidade.md).
**Contrato normativo:** [ABI do chat de cenas](30-contratos-do-chat-de-cenas.md).

## Objetivo e recorte

Permitir conversar com a IA durante a escrita de cenas de livros, texto principal
de aventuras e blocos adicionais, inspecionar contexto/persona e aplicar uma
sugestão somente ao destino confirmado. O servidor resolve lore e persona que o
autor pode ler e confirma prosa, ledger, créditos e recibo atomicamente.

Uma entrega completa para os três novos alvos, com marcos técnicos internos
sequenciais: contexto inspecionável → conversa/persona → aplicação/recuperação.
Não entregar somente uma flag que habilita caminhos legados de débito no cliente.
Capítulos e suas conversas existentes permanecem na interface/contrato legados;
não migrar históricos antigos nem prometer proveniência retroativa inexistente.

## Base descoberta e lacunas confirmadas

Grafo writer-v2 consultado primeiro; atualização fast inicial retornou degraded,
a repetição retornou indexed. Vários símbolos recentes continuaram ausentes;
fontes atuais foram conferidas diretamente nos caminhos identificados.

| Fonte atual                          | Reuso / lacuna                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| functions/src/chapterChat.mjs        | Conversa gratuita, generation congelada, histórico, streaming e aplicação com crédito/recibo; contexto lore/persona recebido do cliente não é autorização da fonte. |
| functions/src/chatGeneration.mjs     | Contrato puro de provedor/modelo/raciocínio, sem I/O/credenciais; manter o contrato existente.                                                                      |
| AIActionMenu e useAIAutocomplete     | Débito no cliente antes da alteração local; não habilitar nos novos alvos.                                                                                          |
| RichEditor + useChatEditorBridge     | Launcher, captura, prévia e preparação sem alterar o documento; separar capacidade chat de autocomplete.                                                            |
| ChapterChatPanel/useChapterChat      | Apresentação reutilizável, controle preso a livro/capítulo; manter wrapper legado e criar controller target-aware dentro de ai-assistant.                           |
| SceneEditorPage/AdventureBlockEditor | getConfirmedContent, runExclusive e acceptConfirmedContent já compõem histórico; usar adaptador público, sem exportar hooks internos.                               |
| preferredLoreTerms/findLoreMatches   | Prioridade local/global, aliases e fronteiras Unicode; relevantChatLore/buildLoreContext hoje divergem e não são autorização.                                       |
| chatDraftStorage/chatApplyStorage    | Persistem contexto e HTML em plaintext sem CAS integral; não copiar para A.                                                                                         |
| Livro/capítulo                       | personaId e personaComplement existem; cenas/aventuras/blocos ainda não têm vínculos novos.                                                                         |
| Lore de livro                        | Writers locais não atualizam o epoch privado; contexto precisa de versão local transacional.                                                                        |

## Decisões preservadas e suposições

Confirmado nas decisões anteriores: conversa gratuita; crédito somente ao aplicar;
credenciais só nas fronteiras existentes; parâmetros congelados; autores e mestres
com o mesmo peso; nenhuma publicação automática. Prosa já aplicada permanece no
manuscrito como conteúdo próprio; não apagar texto do autor ao revogar uma ficha.

Decisões confirmadas pelo operador em 2026-10-21:

1. Persona da aventura: uma base por aventura e complemento por cena; os blocos
   herdam a persona da cena.
2. Histórico com lore indisponível: ocultar respostas/contextos/sugestões afetados,
   preservar perguntas próprias e bloquear reuso até revalidar a mesma origem.
   Origem excluída e recriada não é a mesma origem. Prosa já aplicada permanece.

Para livros, preservar a hierarquia existente: cena vinculada usa persona do livro
e complemento vigente do capítulo; cena sem capítulo usa somente a base do livro.
Não acrescentar uma terceira camada de overrides a esse ramo. Persona ausente ou
inconsistente não autoriza fallback silencioso para outra; informar o impedimento.

## Comportamento esperado

- Chat, comandos e ações de seleção abrem o novo fluxo. Autocomplete dos novos
  alvos permanece indisponível; menu antigo não debita nem aplica nesse ramo.
- Capturar seleção, cursor ou trecho visível; documento inteiro é opção explícita.
  Antes de enviar, aguardar confirmação do autosave. Falha mantém rascunho e não
  chama provedor. A captura é contribuição própria do editor vinculada à base
  confirmada; o servidor não afirma reextrair coordenadas ProseMirror do HTML.
- Separar contribuição própria do usuário de lore/persona derivados. IDs do
  cliente não autorizam fichas; nomes, prosa, revisões ou instrução contextual
  fornecidos pelo cliente não substituem leitura autorizada do servidor.
- Conferir dono, projeto, recurso, relação com a cena e encarnação precisa. Principal
  da aventura é resource scene, sem bloco fictício; livro/block é combinação inválida.
- Inspeção mostra somente campos autorizados e informa truncamento/limites. Não
  inferir audiência pública, alterar lore ou criar referências de captura.
- O autor pode continuar escrevendo durante a geração. A sugestão mantém sua base;
  se o texto mudar, aplicar exige novo destino explícito dentro do mesmo recurso,
  com CAS novo, sem transportar offsets antigos silenciosamente.
- Aplicar altera somente o texto do destino. Não muda audiência, ilustração,
  referências, planejamento, parte/capítulo, universo ou publicação.
- Alterar/fechar a conversa, copiar, regenerar ou descartar não debita crédito.
  Definir literalmente a regra legada de primeira aplicação paga/reaplicação no
  adendo, sem duplicar cobrança por retry ou tratar BYOK como plataforma.

## Hashes do editor e da base confirmada

O HTML persistido pode usar b, enquanto Tiptap serializa strong sem alterar a
prosa. Separar sourceToken/revision/bodyHash do servidor e editorHash/from/to da
captura local. Não exigir hashes iguais nem gravar no load só para normalizar.
O host fornece snapshot confirmado síncrono sob runExclusive; prepara after no
bridge e reconfere a mesma base antes do envio. Servidor compara a base persistida;
bridge compara editorHash. Mudança durante preparo aborta antes de RPC. Confirmação
adota after e metadados juntos, sem combinar getters de renders diferentes.

## Contexto, procedência e reautorização

O adendo deve fechar identidade canônica do alvo, snapshot de texto, origem de
cada ficha/persona, campos permitidos, revisões e tokens precisos. Revalidar antes
de ler corpo, preparar input, gerar/streamar, concluir, entregar payload BYOK,
carregar histórico e aplicar. Gerador de teste recebe exclusivamente projeções
resolvidas no servidor, sem acesso a APIs ou chaves de produção.

A prioridade de menções é por termo/alias, local antes de global, resolvida antes
de filtrar candidatos ou corpos. Consultar todas as páginas de metadata relevantes
sob o mesmo token; mais de 25 fichas não pode mudar o vencedor. No token congelado, indisponibilidade da ficha local vencedora invalida a captura,
sem fallback global. Uma nova captura explicitamente autorizada pode refletir o
vencedor que as menções atuais resolverem, inclusive após exclusão da local. Não usar substring
incompatível com o matcher do editor. Fechar paridade por vetores entre runtimes.

Uma resposta herda todas as origens do contexto atual e das mensagens realmente
incluídas no histórico do provedor. Se B leu A, B depende das origens de A, mesmo
sem consultar diretamente essas fichas. Remover uma ficha do contexto atual não
limpa a dependência. Limitar tecnicamente manifesto/closure antes do I/O, sem
truncar origens nem declarar uma conversa limpa silenciosamente. Proposta técnica:
closure plana de até 128 folhas e 64 KiB de JSON canônico; histórico mantém teto
legado de 20 registros/32.000 caracteres. Excesso falha antes de claim/provedor,
com context-rebase-required. Nova conversa
ou exclusão explícita do histórico tem comportamento verificável.

Separar revisão desatualizada de revogação: edição de ficha pode mudar coerência
sem retirar autorização; exclusão, vínculo perdido, dono/privacidade alterados e
encarnação recriada impedem novo acesso. Send exige contexto atual e coerente. Load/apply reautorizam identidade/acesso da
closure; apply também exige CAS do manuscrito. Edição comum não revoga sugestão
automaticamente. Inspeção conserva data/revisões originais e sinaliza desatualização
quando conhecida; não promete que fatos capturados antigos continuam atuais.
Não reabrir prosa derivada antiga por receipt histórico ou resposta tardia.

Capítulos antigos sem IDs/proveniência não recebem guardas novas por inferência.
A mudança desta vertical protege o fluxo novo; o legado é regressão explícita.

## Versão local do lore de livros

Adicionar localLoreVersion monotônica ao livro. Ausente é baseline legada 0 de
compatibilidade, **sem afirmar coleção vazia**. Campo presente inválido falha;
depois de presente não pode desaparecer/resetar. Mutação local ativa incrementa
exatamente uma vez na mesma transação, com regra getAfter coerente. createTime da
raiz/ficha impede ABA após exclusão/recriação; não substituir por milissegundos.

Inventário a implementar/revisar conjuntamente:

- loreService CRUD local: transação com book e incremento; manter formato/UX.
- loreAnalysis apply: incrementar local uma vez se houver escritas locais;
  preservar bump global e epoch existentes quando houver escritas globais.
- assistedBook: baseline explícita na criação atômica raiz+lore.
- bookService.createBook e imageLibrary.saveBook (usado por createWithCover):
  inicializar na criação e preservar em updates.
- ImportBookModal cria livro/capítulos, não lore; conversão e gravadores de texto
  preservam o campo. Novos restauradores de backup devem respeitar o contrato.
- deleteBook/deleteSceneBook só limpam lore após deleting; exceção segura porque
  a raiz já não autoriza contexto. Admin futuro usa writer versionado ou revoga
  antes de alterar. Trigger eventual não fecha a janela de autorização.

SDK antigo não pode continuar escrevendo sem bump após cutover. Documentar
implantação conjunta de escritores/regras e drenagem de versões antigas; nenhum
rollout ou migração de dados reais está autorizado por este plano.

## Conversa, cobrança e recuperação

Novo serviço editorChat usa chatGeneration puro e os gravadores transacionais
prepareSceneTextWrite/prepareAdventureBlockTextWrite, preservando os invariantes
de contagem e agregado do principal. Preservar a cobrança legada: primeira aplicação
bem-sucedida de sugestão da plataforma custa um crédito; outra aplicação explícita
da mesma sugestão paga, no mesmo alvo, custa zero. BYOK custa zero; retry do mesmo
recibo não cobra novamente. Compartilhar a quota atual por UID com o
chat legado; retry reconhecido não consome nova quota. Não criar quota comercial.

Provedor, modelo e raciocínio ficam congelados no pedido. Claim limita concorrência,
mas não transaciona HTTP com o provedor: se o desfecho externo ficar desconhecido,
resolver não regenera automaticamente. Nova geração exige intenção explícita e
requestId novo; resposta done já persistida pode ser reconhecida. Chaves BYOK continuam
somente na fronteira existente do cliente/provedor, fora de snapshots, mensagens,
journals ou recibos. Nova autorização precede entregar input ou aceitar resultado
BYOK. Não executar chamadas pagas para validar este incremento.

O servidor conserva o material necessário ao pedido preparado; journal local é
metadata-only por UID/alvo/encarnação/conversa/mensagem/operação/fingerprint.
Web Locks cobrem somente CAS local, nunca HTTP. Antes do envio, aguardar persistência
confirmada; comparar o registro integral antes de substituir/limpar. Resposta
perdida consulta o mesmo pedido. Intenção cancel/fence e recibo histórico devem
permitir encerrar sem reidratar corpo revogado ou sobrescrever edição posterior.

Confirmar uma aplicação antiga não adota seu corpo sobre o rascunho atual. Adoção
no editor exige sua própria confirmação atual e integra autosave/history/undo.
Manuscrito, ledger/agregado, créditos e recibo são uma transação. Falha/CAS/saldo
insuficiente preservam o texto e o saldo, com retorno neutro e rascunho recuperável.

## Sequência e arquivos previstos

1. Fechar adendo ABI, preferências/suposições, normalização, limites, fingerprints,
   identidades, seleção/mapeamento do texto, origens históricas e cancelamento.
   Revisão cliente/backend/QA e liberação explícita do integrador antes do código.
2. Criar contratos/serviço de contexto e fechar writers/regras de localLoreVersion;
   provar prioridade, paginação, revogação e encarnação com unidades e SDK dirigido.
3. Implementar serviço editorChat/geração/persona/aplicação e recibos, sem expor UI
   antes dos gates básicos. Reusar somente helpers demonstrados, sem reescrever
   chapterChat nem alterar algoritmos de ledger por conveniência.
4. Extrair apresentação interna do painel, mantendo wrapper/contrato legado;
   criar controller/transporte/journal novos dentro de ai-assistant e capacidade
   explícita chat no RichEditor, sem habilitar autocomplete.
5. Compor cenas de livro/aventura e blocos adicionais por adaptadores públicos;
   conectar persona conforme as decisões confirmadas e o contrato fechado. Cobrir identidade, locks,
   aplicação, undo, recuperação e preservação de rascunhos.
6. Rodar somente afetados durante ajustes; executar matriz SDK/nativa e regressões
   proporcionais, revisão final, validate no fechamento, docs/ADR/entrega/Git.
   CI segue em paralelo; não autoriza merge/deploy nem encerra a fase inteira.

Backend: novos módulos editorChat/contexto/contratos e testes; chatGeneration puro;
scene/adventureBlock writer seams; lore/book/persona guards; bindings/regras/índices.
Cliente: ai-assistant, RichEditor/bridge, SceneEditorPage/AdventureBlockEditor;
contratos públicos de lore e persona/modelos somente onde a integração exigir.
Integrador mantém docs, configuração, regras compartilhadas e runners globais.

## Validação mínima e critérios de aceite

- [x] Alvos válidos com token preciso; nenhuma leitura/generation/apply por intruso.
- [x] Lore/persona forjados não entram no input; local/global e aliases coincidem
      com menções, inclusive páginas posteriores, origem indisponível e encarnação nova.
- [x] Personas herdadas conforme contrato, sem fonte inválida ou chave no snapshot.
- [x] Histórico transitive guarda origens; revogação em cada janela invalida a
      apresentação derivada antes de nova leitura, mantendo contribuição própria.
- [x] Chat/ações/slash disponíveis; autocomplete/menu de débito cliente bloqueados
      nos novos alvos; capítulos e seus percursos antigos preservados.
- [x] Aplicação/ledger/crédito/recibo atômicos, CAS e retry não duplicam cobrança;
      resposta perdida e cancel/fence não adotam corpo posterior nem apagam outra row.
- [x] UID/alvo/encarnação/acesso ou snapshot do pedido mudados invalidam
      continuação, stream e BYOK. Revisão ordinária de ficha segue a regra separada
      de frescor; load/apply de resposta pronta não confundem staleness com revogação.
- [x] SDK: quatro famílias (acesso/contexto; prioridade/origens; aplicação/cobrança;
      corridas/recuperação), com provider sintético e Firestore/Admin reais.
- [x] Nativo: cena de livro e bloco adicional, duas jornadas curtas × seis perfis;
      dirigidos para principal virtual, revogação/UID e aceite incerto. Repetir somente
      legados afetados; inspecionar capturas/teclado/320px nos temas.
- [x] Validate local verde, evidência real e revisão final.
- [ ] CI do novo head verde; Git/CI registrados separadamente no fechamento.

## Referência de esforço e riscos

Horas humanas O/C/P, confiança baixa; parcelas sem sobreposição:

| Parcela                           | Otimista | Central | Pessimista |
| --------------------------------- | -------: | ------: | ---------: |
| Backend + unidades próprias       |      66h |    114h |       192h |
| Cliente + unidades próprias       |      55h |     94h |       159h |
| QA integrada, revisão e evidência |      30h |     50h |        84h |
| Total A provisório                |     151h |    258h |       435h |

Backend inclui contexto/clocks/matcher/persona 24/42/70, chat/proveniência/BYOK/quota
24/42/72 e apply/ledger/crédito/recibos 18/30/50. QA inclui SDK/HTTP 14/22/36,
nativo/fixtures/regressões 10/18/30 e revisão/evidência 6/10/18. Unidades dos donos
não entram novamente na QA integrada. Os serviços TS loreService/bookService e
seus testes pertencem à parcela cliente, acrescida de 3/5/9h após a revisão.
Backend cobre Functions/contratos/regras/índices e suas unidades, sem duplicar TS. A confiança depende de fechar ABI e reproduzir os vetores; novo escopo reabre a parcela correspondente.

A 20 h/semana, o total representa somente referência de capacidade de
7,55/12,9/21,75 semanas humanas, sem compromisso de calendário, horas realizadas ou
saldo medido. A referência antiga de IA em F2-09 não cobre esse inventário;
substituir sua parcela sem somar novamente à baseline histórica. O saldo total
de F2-09 permanece não consolidado. Tempo do agente não é apontamento humano.

Riscos: contexto forjado/obsoleto; alias local perdido na paginação; writer antigo
sem bump; origem recriada; closure transitiva ilimitada; stream após revogação;
retorno BYOK com identidade trocada; chamada concorrente debitada duas vezes;
journal plaintext herdado; capacidade antiga habilitada por flag; autosave que
sobrescreve aplicação; criação de snapshot/persona com credenciais.

## Não escopo

IA de campanha/sessão ou dados de jogadores; autocomplete nos novos alvos;
migração de conversas/históricos antigos; backup/restauração; publicação, venda,
compartilhamento, OCR, geração de imagens e chamadas pagas reais. Nenhum merge,
deploy ou mudança dos limites de cobertura/timeouts/retries.

## Portão anterior ao código

- [x] I validado e enviado, sem aguardar CI geral.
- [x] Descoberta de código e testes, com lacunas e fronteiras explícitas.
- [x] Confirmar preferências de persona e histórico com o operador.
- [x] Fechar os campos do adendo ABI e reproduzir vetores independentes de especificação.
- [x] Consolidar esforços sem dupla contagem e revisar o plano entre as três frentes.
- [x] Resolver P1/P2 de contrato e liberar os marcos internos de implementação A.

## Liberação técnica — 2026-10-21

Duas decisões humanas confirmadas e revisão dirigida backend/cliente/QA/root sem
P1/P2 remanescente na ABI normativa SHA256
2229075f159c69d42db82a171935797cb17a34222097d14d049eaf93d0cb5be0.
Compatibilidade de IDs custom legados e tabelas de unions corrigidas no fechamento.

Vetores externos reproduzidos independentemente em Python 3.10.6: 11 hashes
canônicos, 4 de texto bruto, 7 matchers (busca exaustiva independente do DP) e
closures de 65.536/65.537 bytes. As 11 fronteiras e 8 casos de acesso/cobrança são
expectativas normativas revisadas, ainda não testes do produto. O gerador externo
teve correções de arranjo de UTF-8 e de aliasing das fixtures exata/excessiva antes
da reprodução final, que terminou exit0. Sem provedor pago ou emulador nessa etapa.
Relatório externo writer-v2-editor-chat-vectors-qa-independent-final.json, SHA256
c770dff10cb9d68f981076abc76db42c54829a39237a56b06a2f1d991035fead.

Integrador liberou somente a execução sequencial dos marcos internos do recorte
aprovado: contratos puros/matcher e clock local primeiro; contexto/geração/aplicação
e integração de interface depois. Paridade dos novos helpers, autorização SDK,
percursos nativos e validate continuam gates de implementação. Nenhuma entrega A,
merge, deploy ou avanço de fase foi declarado com base nos vetores.

## Checkpoint interno — clock e compilador puro

Clock TS: 88 unidades dirigidas positivas; após ajuste de harness/tipagem,
repetição somente lore com 34/34, ESLint e TypeScript verdes. Functions dos
writers/baselines: 63/63 em quatro arquivos, sem skip. SDK real local: 39 casos
únicos positivos em seis arquivos. Foram 44 execuções: primeira rodada 35/39 e
repetição dirigida 5/5; três falhas iniciais eram retorno de observação do harness
e uma era fixture legada de criação sem baseline. As quatro famílias novas do
clock foram repetidas porque a observação corrigida afeta todas. Não houve
alteração das regras ou expectativas para resolver essas falhas. Sem produção.

Compilador de persona extraído para personaProfile.mjs e declaração pública,
sem I/O/credenciais. Wrapper persona.ts mantém API, avatares e rótulos de UI.
As 49 combinações de presets/base/complemento mantêm instruction/version legados
idênticos; duas unidades Node novas e oito unidades TS legadas positivas.
Scope adventure ajusta os rótulos do prompt sem nova camada de overrides.
Check arquitetural e ESLint dirigidos verdes. Isso não prova autorização, que
pertence ao resolver ainda por implementar, nem habilita a interface nova.

Precisões técnicas durante o marco: journal conserva intent observe/cancel
monotônico por CAS integral; SendResult permite projeção null em fence/replay
sem acesso atual. Ambas preservam o fingerprint original e não alteram as
escolhas humanas. Validate completo fica no fechamento A, sem declarar
conclusão ou executar a matriz inteira a cada ajuste.

## Checkpoint interno — contratos, transporte e snapshots do host

Contratos/matcher/HTML somam 83 unidades únicas positivas no recorte puro. Após
revisão, a última repetição dirigida do contrato teve 50/50, sem skip. A revisão
corrigiu validação lexical de HTML descartado pelo parser, correlação de recibos
em SendResult e consistência da fase final de cleanup. IDs do matcher usam a
referência qualificada, preservando colisões de documentId entre origens. As
falhas iniciais de arranjo e as correções fazem parte da evidência; isso não prova
os guardas de I/O ou a autorização de fontes reais.

Cliente: a rodada conjunta anterior teve 71/71 em modelo, transporte e journal.
Após o ajuste de classificação de falhas, foram repetidos somente os 64 testes
do transporte: todos verdes, além de TypeScript e lint dirigidos. O cliente só
expõe reason reconhecido e consistente com o código recebido; pedidos sem
emissão não são classificados como mutação de resultado incerto. Journal
continua somente com metadata, CAS integral e intenção de cancelamento monotônica.

Hosts de cena e bloco têm agora getConfirmedSnapshot síncrono com texto,
revisão e hash da mesma confirmação; 39/39 testes dirigidos positivos. Isso não
iguala o HTML persistido à normalização do editor, não exporta hooks internos e
não habilita chat, menu legado ou autocomplete nesses alvos.

Resolver de contexto com I/O, personas autorizadas, operações e cleanup está em
implementação. O teste SDK desse marco está sendo preparado separadamente;
nenhuma execução ou resultado positivo é antecipado. Conversa, geração,
aplicação, interface, validação integrada e entrega A permanecem pendentes.

## Checkpoint interno — contexto com I/O

Factory createEditorChatContextService implementa as dez ações de contexto,
persona, operações e cleanup previstas nesse marco. Vinte e seis unidades únicas
positivas, sem skip, no último dirigido completo; lint, declarações e formatação
dirigidos verdes. Houve falhas anteriores de fixtures (IDs incompatíveis com os
serviços legados, projeção de bloco e IDs de lore), corrigidas sem relaxar fontes.
A revisão corrigiu a inspeção de contexto não pronto após recriação nativa do
recurso/contêiner, exigindo a identidade original antes de devolver metadata.

SDK real local: quatro grupos em editor-chat-context.rules.test.mjs, todos
positivos na primeira execução, sem fail/skip/retry, 18.224,0551 ms. Cobrem três
alvos reais e intruso/anônimo; quatro namespaces privados; 53 fichas locais antes
do global; aliases com documentId repetido entre origens; clock alterado sem
fallback; manifesto antes dos corpos; edição comum stale; mesma origem novamente
autorizada e recriação nativa recusada; persona raiz sem cena e herança no bloco;
CAS, recibo, fence e cleanup metadata-only após a raiz desaparecer. Subasserts não
são contados como novos casos. Log externo writer-v2-editor-chat-qa/context-sdk.log;
resultado context-sdk-result.json, exit0. Emulador demo encerrado ao final.

Os quatro grupos privados têm deny SDK explícito e fieldOverrides sem índices
por campo: todas as consultas implementadas nesses grupos são por documentId,
sem busca por prosa, acumulador ou manifesto. Nenhum callable foi exportado ou
implantado nesse checkpoint.

Adaptador do host: 18 unidades positivas inicialmente; a revisão identificou que
o guard do PM precisava existir antes da leitura de fonte e sobreviver à
liberação do lock. A correção passou nos 20 casos dirigidos, incluindo essas duas
janelas sem confirmação nova de autosave, e lint dirigido. A revisão confirmou o fechamento do guard; o TypeScript final
do recorte bridge/capabilities também passou com esse adaptador presente. Isso
ainda não conecta o novo chat aos hosts de escrita.

Conversa/histórico, geração/BYOK, aplicação, interface e validate completo
permanecem pendentes. O próximo marco de conversa/histórico foi liberado após os
quatro grupos SDK; contratos privados de armazenamento serão alinhados antes do
código. Nenhuma entrega A ou avanço de fase é declarado por estes testes.

## Checkpoint interno — capacidades e bridge do editor

RichEditor separa chat, autocomplete e ações legadas por capacidades explícitas,
com defaults legados preservados. O novo bridge captura somente contribuição
própria, sem persona/lore do cliente; conserva guard de documento PM, HTML,
seleção e lifecycle durante hashes assíncronos e preparo. Prepare não despacha
antes do aceite; commit é único. Os hosts novos ainda não foram ativados.

Matcher opt-in usa o helper puro no resumo, nas decorações, no menu de menções e
no minimapa, com chave qualificada inclusive para documentId local/global igual.
O recorte novo preserva pares UTF-16 nos limites de 18.000 e 22.000 caracteres;
o ramo legado mantém os cortes anteriores. Revisão corrigiu estado de menu antigo
após revogar legacyActions, recuperando as ações de seleção do chat.

O cliente registrou 88 casos únicos positivos nas suítes dirigidas afetadas;
último ajuste do menu teve 12/12 e repetição dirigida de um caso após adequação de
lint. TypeScript, lint e formato dirigidos verdes. Revisão independente dos 17
arquivos e releitura final dos dois do ajuste sem P1/P2 restante. Freeze agregado
7e62d4f7a9235af8f4989b7cc942ffed465449f65416a799637c2cc7655d6bdd.
Isso fecha somente esse marco interno; não comprova fluxo nativo integrado,
geração, aplicação, validate completo ou entrega A.

## Checkpoint interno — conversas, histórico e aplicação

Conversas/histórico tiveram 20/20 unidades dirigidas positivas (18 novas e duas
regressões de cleanup). Os quatro grupos SDK passaram na primeira execução,
sem fail/skip/retry, em 20.194,2141 ms. Cobrem catálogo e cursores com CAS, Rules
privadas, perguntas próprias separadas dos derivados, revogação/reautorização da
mesma origem e recriação nativa recusada, closure transitiva de histórico e
exclusão retomável com 151 documentos. Log externo
writer-v2-editor-chat-qa/conversations-sdk.log, SHA-256
d0d53d07012495e80dc1fd59c78b21bdb2afcc915f58a07379332d03a71439f0.
Turnos concluídos foram semeados com contextos reais; esse marco não prova o
produtor send, quota ou geração. Emulador demo encerrado ao final.

Aplicação atômica usa os escritores reais de cenas e blocos e o ledger existente.
As 16 unidades dirigidas passaram, sem skip, em 342,0353 ms; lint dirigido verde.
Revisão independente sem P1/P2 concreto. Cobrem três recursos, CAS, crédito,
recibo, replay, reapply explícito e BYOK; preservam audiência e outros blocos.
O fixture passou a atribuir cenas a grupos pelos serviços reais para provar a
contagem do manuscrito, sem alterar a regra de exclusão de cenas não atribuídas.
Atomicidade e corrida reais ainda aguardam SDK de aplicação.

Geração, controlador, interface, integração, validate completo e entrega A
permanecem pendentes. Nenhum callable novo está publicado.

## Checkpoint interno — SDK de aplicação e composição do callable

Os quatro grupos SDK de aplicação passaram após corrigir somente uma expectativa
da spec: aventura mantém o total no ledger, não no cache raiz exclusivo do livro.
Primeira execução 0/4, preservada em apply-sdk.log; repetição explícita 4/4,
0 fail/skip, em 58.599,9024 ms, apply-sdk-ledger-fix.log. Nenhum retry automático.
Três alvos com escritores e ledger reais, mesmo updateTime nativo para texto,
saldo, paid e recibo, corrida do mesmo operationId, reapply sem nova cobrança,
CAS/fence/saldo insuficiente sem mutação e revogação antes do corpo. Turnos
concluídos foram semeados com contexto real; não é prova de send. Emulador demo
encerrado. Hashes e limites em writer-v2-editor-chat-apply-sdk-verification.json.

Composição editorChat.mjs e binding no index têm sintaxe e lint verdes, com
Auth/AppCheck, prompt→text no transporte existente e erros neutros. Cleanup de
conversa e contexto usa o dispatcher de Conversations, que trata ambos os tipos.
Sem deploy. Geração teve revisão independente sem P1/P2 concreto; SDK próprio
ainda será executado com geradores injetados.

Transporte cliente BYOK teve 10/10 testes dirigidos, lint e TypeScript app verdes,
sem requisições reais. Conserva provedor/modelo originais e chave só em header;
não apresenta deltas antes da confirmação autorizada. Expectativa inicial para
entrada de plataforma foi corrigida para a rejeição do contrato puro, antes do
HTTP. Aceite integrado no editor está em implementação; A segue pendente.

## Checkpoint interno — geração SDK e integração inicial no editor

Geração: quatro grupos SDK positivos na primeira execução, sem fail/skip/retry,
49.521,6031 ms, generation-sdk.log. Os turnos nasceram pelo produtor real via
composição editorChat, sem seed Admin: claim/consumo/quota/recibo, concorrência,
limite compartilhado com chat legado, closure transitiva, stop/revogação por
callback awaited, BYOK recuperado e limpeza vencendo retorno tardio. Geradores
injetados; nenhuma chamada paga. Manifesto externo
writer-v2-editor-chat-generation-sdk-verification.json. Emulador encerrado.

O callable exportado também teve dois negativos HTTP reais locais positivos
para App Check ausente/inválido. A resposta é a rejeição da infraestrutura, sem
details do serviço nem eco do pedido. Project ID demo evita buscar credenciais
reais. Isso não é ativação/deploy nem prova com tokens de produção válidos.

Controlador/journal/host tiveram 101 casos únicos positivos no marco inicial;
revisão encontrou leitura getTurn/BYOK atrasada atravessando exclusão+cleanup.
Dois novos dirigidos fecharam esse P2 e a revisão confirmou a cerca. Painel teve
27 casos positivos inicialmente; mais dois fecharam exclusão metadata-only sem
host. Integração de bloco teve 34 casos únicos positivos; ajuste chatOpen teve
repetição dirigida 1/1. Cenas tiveram 32 casos positivos mais novo caso de persona
e retake do launcher (2/2 filtrados, 31 não selecionados). Tipos/lint dirigidos e
checagens de arquitetura/styleguide verdes nos checkpoints informados.

Aceite cliente: 16 casos dirigidos positivos, incluindo leitura completa dos
metadados antes da adoção; ações BYOK/apply: 11 positivos após fechar retorno
atrasado de provedor que ignora abort; composição Workspace: sete positivos.
São unidades com mocks das fronteiras, não provas de backend ou editor nativo.

Primeira passagem nativa em desktop-dark: seis jornadas positivas, sem retry,
47,3 s. Livros/cenas e aventura principal/adicional usam Tiptap, undo/autosave,
stores, controller, Locks/CAS e journal reais; só transporte é fictício. Inclui
edição durante geração/retarget, revogação e pergunta própria, reload de pedido
desconhecido observe/cancel e BYOK pendente sem provedor externo. Evidência em
writer-v2-editor-chat-qa/native-desktop-first.json e pasta de capturas associada.
Ainda falta matriz final móvel/temas e repetição afetada após os ajustes de persona.

Revisão de persona identificou continuidade de contexto antes de handoff e
pendência externa que prendia o modal. Correções coordenadas em andamento, sem
forçar exclusão de conversas/histórico nem inventar grant textual para o setter.
Persona na página da aventura teve 17/17 e diálogo 10/10 antes desse novo ajuste;
esses resultados não aprovam automaticamente as correções posteriores.

Validate completo, revisão integrada final, documentação de entrega e Git A
permanecem pendentes. F2-09 segue em andamento; nenhuma entrega A declarada.

## Checkpoint interno — persona e matriz final

Service/Session/Dialog de persona fecharam 54 casos únicos positivos, incluindo
contexto/cleanup não terminal, conversa preservada, prova explícita de exclusão,
setter→setter sem perda de refs, origem recriada e pendência de outra ação que
permite fechar o modal. Houve falhas iniciais de arranjo de IDs e shape do setter,
corrigidas sem reduzir assertivas. Revisão cruzada encontrou e fechou o guard
setter→setter; fontes congeladas no manifesto externo
writer-v2-adventure-persona-controls-source-freeze.json, SHA-256
8528e6d5e6d43fd202fa4cb96ba008f748097edb8267ea47a8763340140d04b7.
Controller teve sete novos dirigidos positivos (cinco negativos de origem/CAS e
dois de retomada), além da regressão de encarnação normal. Tipos/lint/formato verdes.
Revisões recíprocas sem outro P1/P2 confirmado nos arquivos finais.

Desktop final inicial: 7/7, sem skip/flaky/retry, 51,348326 s. A inspeção visual
identificou nomes/aliases longos cortados no conteúdo interno de contexto;
correção CSS e assert de overflow interno exigem nova passagem afetada. Primeira
seleção da matriz de temas não encontrou casos por filtro ancorado no título
completo; não foi uma execução de testes. Após corrigir filtro, o primeiro móvel
falhou no clique no centro do contenteditable mais alto que o viewport. Matriz
interrompida por SIGINT antes de repetir o mesmo gesto nos demais; artefatos
preservados. O gesto passa a tocar o primeiro parágrafo visível, sem force.

Duas jornadas dirigidas adicionais fecham os critérios explícitos do plano:
troca UID durante recuperação e aceite confirmado com resposta perdida, cada uma
em desktop-dark/mobile-dark. Matriz final prevista: 18 principais, seis dirigidos
originais, duas de persona e quatro desses novos dirigidos = 30 combinações
únicas. Repetições serão informadas separadamente. Não confundir fixture de
transporte/autorização com as provas SDK reais do backend.

## Fechamento local — 2026-10-21

Implementação dos três alvos validada localmente; [evidência A](../../../entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md).
Validate completo exit0 com 2.527 frontend/219 arquivos, 85 scripts e 615 Functions.
Cobertura 90,96% statements, 85,59% branches, 90,67% functions e 93,61% lines.
Depois dele, apenas classes de um botão de recuperação foram ajustadas; estilo,
lint/formato e persona desktop/mobile foram repetidos, sem terceiro validate.

Matriz nova: 30 combinações únicas positivas; três regressões legadas positivas.
Últimos 33 coletores sem runtimeErrors/blockedRequests, retry0. Os 18 principais
passaram em 121.953,495 ms. Dirigidos: revogação/retarget, recuperação, BYOK,
persona, troca UID durante resposta de cancelamento e apply incerto com corpo
posterior não adotado. SDKs reais continuam sendo a prova de autorização/atomicidade;
UI usa transporte fictício. Nenhuma chamada paga ou implantação.

Inspeção móvel identificou botão longo cortado e exigiu quebra de texto; teste
interno de largura foi preservado. Duas correções de arranjo dos novos casos
preservaram a navegação explícita e a observação DOM sob diálogo. Falhas/execuções
interrompidas permanecem nos logs, sem contá-las como passes ou retries.

Revisões finais sem P1/P2 remanescente confirmado. Manifestos externos prendem
fontes, log e seleção de execuções; detalhes e hashes na entrega. CI do novo head
será acompanhada em paralelo, preservando PR em rascunho, master original limpa,
aceites humanos/comerciais e sequência P1 → P2 → P3 → D. F2-09 não está concluído.
