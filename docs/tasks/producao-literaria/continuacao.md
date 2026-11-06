# Continuação da implementação

## Objetivo vigente

Implementar integralmente as cinco etapas aprovadas a partir de
`codex/writer-v2`, em nova worktree. Executar testes e validações somente no
gate anterior à integração com a branch principal. O objetivo segue ativo;
este checkpoint não significa conclusão nem redução do escopo.

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Branch: `codex/producao-literaria`. Base inicial: `8b02f22`; principal incorporada: `b666233`.
Reconferência atual: [base e resultados](validacao-atual-principal-b666233.md).
Sem commit das alterações, push, integração ou implantação.

## Trabalho presente, ainda sem validação

- Feature `literary-production`, aba em BookPage, contrato e decisões,
  guia editorial, comparação e consulta de versões imutáveis.
- Decisões append-only com substituição explícita. Salvamentos sem mudança
  confirmam recibo sem criar versões indistinguíveis.
- Contrato opcional na proposta assistida e criação atômica de sua primeira
  versão com livro/lore/créditos; decisões da IA ficam propostas/lacunas.
- Chat legado de capítulo captura contrato; servidor confere conteúdo/revisão
  e bloqueia aceite com contrato alterado. Contexto utilizado é inspecionável.
- Documentos tipados: visão do livro, tratamento de ato, ficha de capítulo,
  conhecimento de personagem, plantio/retorno e continuidade entre volumes.
- Referências nativas: atos, capítulos, cenas, arcos, eventos, lore local/global.
  Vínculo de unidade planejada difere de fonte de análise versionada.
  Unidade planejada não fica obsoleta apenas por editar sua prosa.
- Histórico de planos com listagem paginada e leitura de versão específica.
- Journal local guarda somente metadata/hash do pedido antes da RPC.
  Consulta de recibo após recarregar não reenvia conteúdo. CAS/IDs preservados.
- Guard de navegação por rascunho ou salvamento pendente. As duas áreas internas
  ficam montadas para conservar o rascunho ao alternar.
- Propostas/auditorias de planejamento pela plataforma, com fontes escolhidas,
  teto de contexto e evidências literais validadas. Resultado separado da
  aplicação explícita ao rascunho; salvar continua uma ação distinta.
- Pedidos de IA ficam no livro e podem ser consultados após recarregar.
  Cancelamento tem fence para pedido ainda ausente, não espera o produtor e
  impede resultado tardio de reabrir pedido cancelado.
- Gerações não debitam créditos e compartilham a cota existente de 60 pedidos/h
  de assistência de capítulo. Não há nova operação paga.
- Coleções novas negadas ao SDK e incluídas no coletor limitado do livro.
  Limpeza das fases planas agora consulta somente metadata antes de excluir.

## Arquivos centrais

Servidor:
literaryContracts.mjs, literaryProduction.mjs, literaryPlanningSchema.mjs,
literaryReferences.mjs, literaryPlanning.mjs, literaryAIContext.mjs,
literaryAI.mjs; integração em index.mjs, assistedBook.mjs, chapterChat.mjs
e sceneJobs.mjs. Regras/índices têm as coleções e o índice de versões de planos.

Frontend:
src/features/literary-production (model/services/components),
BookPage.tsx, AssistedBookPage.tsx, modelo assistedBook e integração em
useChapterChat, capítulo ChatContext e ChapterChatPanel.

Testes escritos, não executados:
functions/test/literaryProduction.test.mjs,
functions/test/literaryPlanning.test.mjs,
functions/test/literaryAI.test.mjs,
literaryRecoveryStorage.test.ts,
tests/EditorialContractPanel.test.tsx.

## Próxima sequência de implementação

1. Completar E1: extração assistida do contrato em livros existentes com
   revisão de inferências; estados de ausência/erro e aceites individuais.
2. Completar E2: auditar mapa em lotes e trajetórias; visão contextual dos
   vínculos entre tratamentos, fichas e narrativa nativa; reconciliação
   explícita de fontes alteradas, sem duplicar lore/cenas/arcos existentes.
3. Implementar E3: compilar guia/decisões efetivas deterministicamente;
   resolver planos da unidade; registrar fontes, cobertura e omissões;
   integrar chat nativo de cenas e autocomplete, além do chat legado.
   Preservar parâmetros congelados/retry e bloquear aceite obsoleto.
4. Implementar E4: preparação de cenas, mundo local e gate com evidências;
   redação por cenas com checkpoints; marcos de primeira versão/revisão pelo
   histórico nativo; revisão estrutural e de prosa com achados localizados,
   aplicação segura, comparação e reconferência das dependências.
5. Implementar E5: integração de atos e livro com cobertura integral versionada,
   acompanhamento por etapa, invalidação/impacto, publicação explícita de
   versões identificadas, projeções públicas sem dados internos e portabilidade
   privada com restauração em cópia nova.
6. Só então executar o gate de testes/validações/revisão visual, corrigir falhas,
   revisar diff, fechar documentação/ADRs/AGENTS/entregas e preparar integração.
   Não integrar, fazer push ou implantar implicitamente.

## Atenções para o fechamento

- O código desta worktree ainda não passou por format, lint, typecheck, testes,
  build, Rules ou navegador. Não afirmar que os fluxos funcionam/estão concluídos.
- Mocks e fixtures existentes do chat/criação precisarão suportar as chamadas
  novas. Acrescentar testes de Rules, integração atômica da criação e fluxos visuais.
- A cota compartilhada e a política de análises sem débito precisam constar na
  documentação/ADR final; preservar cobrança atual de sugestões no manuscrito.
- Revisões próprias não devem ser confundidas com aprovação de IA nem publicação.
- Associação por identidade e fonte por versão são conceitos separados; não
  invalidar a ficha de um capítulo só porque sua escrita avançou.
- Retomar análise incerta consultando o pedido, sem reenviar geração ao abrir.
- Resultado de IA cobre fontes selecionadas; ainda não é revisão integral.
- Não reimplementar cenas, arcos, cronologia, histórico ou progresso já nativos.
- O index_repository foi rejeitado pela revisão automática por risco de enviar
  código a grafo externo. Usar leitura local como fallback; não contornar a rejeição.

## Atualização posterior ao checkpoint inicial

A inferência do contrato para livros existentes também foi implementada:
ContractInferencePanel escolhe fontes nativas explícitas, usa o job persistente
de literaryAI em mode contract e preenche somente lacunas, preservando campos e
decisões anteriores. As inferências podem ser consultadas após recarregar.
A IA nunca aprova decisões; IDs são gerados pelo servidor e propostas não podem
substituir decisões aprovadas automaticamente.

literaryEditorialComposition.mjs é puro/browser-safe, com declaração .d.mts.
A mesma composição é usada na UI e nos pedidos de chat legado/plano. Uma
substituição ainda proposta não revoga a decisão aprovada anterior; a aprovação
de uma descendente encerra a cadeia anterior. Requisitos/preferências/hipóteses
e pendências são apresentados separadamente. Há testes escritos para isso.

Os testes novos continuam NÃO executados. Próxima tarefa é concluir a integração
de contexto da etapa 3, a partir do planejamento já salvo e das fontes nativas.
E1/E2 ainda exigem revisão e o gate final; não marcar as etapas como aprovadas.

Atenção: campos de uma fonte global/local só são incluídos se ela foi escolhida
como fonte; vínculo de unidade planejada inclui identificação. Provas da geração
incluem revisões dos planos de apoio e seus vínculos explícitos. O contexto é
limitado a 24 referências distintas, 120 mil caracteres por fonte e 500 mil bytes
de documentos; excessos falham, sem truncamento silencioso.

Cancelar geração cria fence mesmo antes da chegada do start, preserva resultado
já concluído e impede conclusão tardia. A UI libera a ação após confirmação do
cancel sem aguardar produtor e ignora ACK antigo. Não interpretar state running
como prova de processo vivo ou reenviar ao abrir.

Ainda é necessário adicionar a cobertura visual/Rules e ajustar os mocks
existentes de chat que agora consultam getLiteraryContract antes de enviar.

## Continuação: contexto de escrita e preparação (implementação ainda não validada)

Estado real desta continuação:

- Objetivo integral continua ativo. Não integrar, fazer push ou implantar.
- Nenhum teste, formatador, lint, typecheck, build, Rules, navegador ou validate
  foi executado. Os novos testes foram apenas escritos, conforme a autorização.
- Branch codex/producao-literaria, criada de codex/writer-v2 em 8b02f22.
  O ponteiro atual de codex/writer-v2 avançou em outro checkout; reconciliar
  somente na fase de integração, preservando o trabalho paralelo.

### E3: alterações posteriores ao checkpoint anterior

- literaryWritingProtocol.mjs/.d.mts define manifest/snapshot fechados,
  versões, origens, seleção explícita/automática e cobertura, com orçamento
  compacto para autocomplete. literaryWritingContext.mjs resolve planos por
  vínculos nativos, captura contexto e separa autorização de origem de frescor.
- literaryReferences expõe identityToken distinto de versionToken.
- literaryPlanLinks indexa referências por plano/tipo/ID/finalidade.
- hasLiteraryResources opta o livro no método; literaryRevision é clock
  exclusivo de writers do servidor. Rules preservam ambos em clientes.
- Chat nativo registra manifesto literário em proveniência e snapshot
  congelados. Histórico reautoriza origens antes de derivados e verifica
  frescor separadamente. Contexto antigo de livros não adotados permanece.
- Chat legado captura contexto canônico e revalida antes da aplicação atômica.
  Leitura/geração/finish usam headers e origens do histórico transitivo antes
  de ler derivados. Perguntas próprias sobrevivem à revogação; respostas e
  sugestões derivadas são ocultadas. Origens achatadas limitam travessia.
- EditorChatPanel e ChapterChatPanel têm escolha de fontes e prévia.
- getLiteraryWritingContext e checkLiteraryWritingContext disponíveis.
- PENDENTE: autocomplete usa o caminho legado. Integrar contexto, invalidação
  e aceite atômico sem habilitar débito SDK em cenas/blocos. Não basta conferir
  frescor assincronamente antes de deductCredit: há corrida no aceite.
- PENDENTE: observadores de metadata/hints para invalidar contexto transitório,
  com relógios e identidades atuais. Hints não são autorização.
- Novos testes literaryWritingContext/Protocol foram escritos, não rodados.

### E4: preparação e gate agora implementados em código

- Schema de planejamento ampliado com scenePreparation e localWorldbuilding.
  São documentos complementares vinculados às cenas/lore nativos existentes.
  Geração/auditoria existente recebe o novo schema automaticamente.
- literaryGateProtocol.mjs/.d.mts define 14 critérios, resultados,
  justificativas, até três citações literais por critério e aceite separado.
  Critérios estruturais não podem ser dispensados com não se aplica.
- literaryPreparation.mjs captura ficha/cenas/mundo local do capítulo,
  exigindo vínculo subject ao capítulo correto e fontes revalidadas.
  Salvamento compara stateToken e revisão, confere citações literalmente e
  grava cabeça, versão e recibo atomicamente. Não altera manuscrito/créditos.
- Getter autoriza metadata/origens antes de ler citações; fonte alterada
  remove prontidão/aceite efetivos, preservando o que foi registrado na versão.
- Repetição sem mudança cria apenas recibo no-op, sem versão indistinguível.
- LiteraryPreparationPanel escolhe capítulo/fontes, mostra fontes capturadas,
  critérios/evidências/pendências, aceite autoral e histórico somente leitura.
  Novas fontes exigem reconferência dos resultados, preservando justificativas.
- Guarda de navegação inclui este rascunho e seus pedidos incertos. Journal
  local continua somente com metadata/hash, agora com kind gate.
- Coleções literaryPreparationGates/literaryPreparationGateVersions negadas
  ao SDK e inventariadas no coletor do livro.
- Testes novos, NÃO executados: literaryGateProtocol.test.mjs,
  literaryPreparation.test.mjs e LiteraryPreparationPanel.test.tsx.

### E4: marcos de primeira versão/revisão pelo histórico nativo

- literaryMilestones.mjs cria captura privada por job/chapítulo e tipo
  firstDraft/revised. É preservação de texto, não certificado de qualidade ou
  prova de redação/revisão integral.
- Legacy captura uma versão nativa do capítulo. Capítulo composto enumera
  cenas ativas ordenadas por slot em páginas de 25; captura uma cena por
  avanço e mantém manifesto paginado em literaryMilestoneUnits.
- Usa createWorkHistoryService/createWorkVersion para corpos/pins/recibos,
  com operação determinística por unidade. Não copia prosa em estado editorial.
- Congela nascimento do livro e metadata nativa do capítulo, verifica tokens
  das fontes e hashes das versões; finalização confere todas as unidades e
  historyRevision, reiniciando a conferência se o histórico mudar.
- Cancelamento pode instalar fence antes de start; retorno tardio não reabre
  checkpoint. Capturas nativas que terminarem após cancelamento permanecem
  como versões privadas no histórico, sem progresso fictício.
- Criação de job e recibo literário são atômicos. Journal genérico aceita
  kind milestone; recuperação consulta metadata sem reenviar conteúdo.
- LiteraryMilestonePanel, dentro da preparação do capítulo, oferece início,
  retomada explícita até concluir, pausa local depois da chamada atual,
  cancelamento e consulta de checkpoints/versões. Montar/listar não avança.
  Leitura integral usa readCompleteWorkVersion pela API pública de
  manuscript-history; renderização sanitizada por renderRichText.
- Novas coleções privadas literaryMilestones/literaryMilestoneUnits têm Rules
  e limpeza plana. Índice jobId/index para paginação.
- literaryMilestones.test.mjs escrito e NÃO executado: legacy, 27 cenas,
  fonte alterada, cancelamento pré-start, captura tardia e autorização.
- PENDENTE: testes de UI dos marcos; conferir os fluxos/mocks no gate final.

### Correção de edição identificada

firestore.indexes.json tinha inserções literárias repetidas dentro de
fieldOverrides[].indexes, oriundas de uma substituição anterior ampla.
Foi recomposto com o documento original de HEAD e somente os quatro índices
literários necessários: PlanLinks(kind/refId/purpose), PlanVersions(id/revision),
PreparationGateVersions(chapterId/revision), MilestoneUnits(jobId/index).
Nenhum índice original foi intencionalmente removido. A sintaxe/implantação
ainda serão verificadas no gate final; isto não é evidência de validação.

### Próximas ações, preservando todas as cinco etapas

1. Concluir E3: contexto no autocomplete e aceite seguro, invalidação derivada.
2. E4: usar gate/fontes e cenas nativas para redação assistida retomável;
   salvar primeira versão pelo marco nativo e não avançar estado por contagem.
3. E4: revisão estrutural e de prosa com texto integral por segmentos,
   achados localizados e fontes/versões; comparação e aplicação autorizadas,
   reconferência de dependências e captura de versão revisada.
4. E5: integração de atos/livro com cobertura comprovada, fronteiras,
   progresso por etapa, invalidação/impacto e critérios de conclusão.
5. E5: seleção explícita de versões para publicar, guia público sem spoilers,
   portabilidade privada e restauração em nova cópia de todos os artefatos.
6. Só depois: dependências de functions, testes/validate/Rules/navegador,
   correções, revisão do diff, ADRs/AGENTS/docs/entregas e preparação da
   integração. Nenhum commit/push/merge/deploy foi feito nesta continuação.

### Painel dos marcos conectado

LiteraryMilestonePanel.tsx e literaryMilestoneService.ts foram acrescentados.
O painel está dentro da preparação, com chave por capítulo. O começo usa o
journal literário genérico (kind milestone), e start registra recibo junto do
job. listLiteraryMilestones permite recuperar capturas já registradas depois
de recarregar. A recuperação genérica confirma somente existência por máscara
vazia; não lê conteúdo de versões para consultar um recibo.

A retomada avança sequencialmente apenas depois do clique. Pausa local termina
após a chamada atual; cancelamento do job preserva versões nativas já feitas.
A prévia reconstrói/hash-confere cada versão pelo serviço público de histórico
e sanitiza HTML. Pedidos de início incertos entram na guarda de navegação.

A interface de gate distingue confirmação de salvamento de atualidade:
depois de um recibo, não afirma que as fontes continuam atuais sem nova
consulta. Os testes de UI de gate usam serviço mockado; os marcos ainda
precisam de seus testes de UI e de verificação completa no gate final.

Pendências integrais permanecem: E3 autocomplete/aceite/invalidação; E4 geração
de prosa por cenas e revisão integral; E5 integração, progresso, publicação
versionada e portabilidade/restauração. E1/E2 também precisam do fechamento
contra todos os critérios. Nada foi validado ou declarado concluído.

## Continuação: propostas de redação e revisão de cenas

Implementação feita nesta continuação, ainda SEM testes/validação:

- literaryProseProtocol.mjs/.d.mts: segmentação determinística em núcleos de
  18000 caracteres com contexto de 1200 em cada borda, sem quebrar pares UTF-16.
  Núcleos cobrem o texto projetado sem lacunas; offsets são nessa projeção.
  Resposta JSON fechada, citações literais e prosa simples convertida em HTML
  escapado. Saída parcial/complete diferente de true é rejeitada. A declaração
  do modelo não substitui conferência literária/aceite do autor.
- literaryProse.mjs: operações draftScene, reviseScene, reviewStructure,
  reviewProse. Serviços exigem livro próprio, capítulo composto e cena ativa.
  Fixam nascimento de livro/capítulo/cena, versão textual, composição do capítulo,
  guia/decisões/fontes, plano nativo da cena e cena anterior integral (se couber).
- draftScene exige cena vazia e gate atual com aceite autoral. As fontes são
  exatamente as do gate. reviseScene/review* exigem prosa existente, para não
  contornar a preparação chamando uma redação inicial de revisão.
- Revisões/reescritas admitem seleção automática ou explícita de até 8 planos.
  Snapshot e documentos enviados são inspecionáveis. Mesmo a ausência de guia
  é congelada por manifesto canônico; salvar contrato posteriormente invalida
  a proposta, enquanto preservar histórico sozinho não a invalida.
- Conferência de versão antes da geração, antes de entregar ao provedor,
  depois da resposta e no aceite. Inserção/reordenação/edição de outras cenas
  no capítulo muda a composição e torna a proposta obsoleta.
- Revisão trabalha no segmento pedido e declara cobertura; NÃO é revisão
  integral de capítulo/ato/livro. Suporta cenas maiores através de segmentos;
  reescrita integral limita a fonte a 60000 caracteres e a saída a 80000.
  Cena anterior acima de 60000 falha explicitamente; não é truncada.
- Jobs persistentes literaryProseRequests, cotas compartilhadas de 60/h e
  configuração de modelo/raciocínio da plataforma congelada. Não há BYOK
  neste novo fluxo estruturado; os chats existentes mantêm seus caminhos.
  O helper assistedGenerator já rejeita finishReason diferente de STOP.
- Cancel cria fence mesmo antes de start e resultado tardio não reabre job.
  Reconsultar/start repetido não inicia outro produtor. running é apenas
  registro pendente, não prova de processo vivo; UI não reenvia ao montar.
- Leitura usa headers para reautorizar origem antes de texto/resultado.
  Origem retirada/recriada oculta derivados e preserva instrução própria.
- Propostas e análises não debitam. Aplicação explícita usa o writer nativo de
  cenas e a mesma unidade de débito das sugestões da plataforma (1 crédito).
  Texto/contagens/ledger/paid/recibo são atômicos. Captura nativa anterior é
  idempotente e precede a gravação, preservando o texto mesmo se o aceite falhar.
- Achados blocking tornam a proposta inaplicável até nova decisão/conferência.
  Nenhuma mudança de lore/planejamento, publicação ou conclusão editorial
  decorre automaticamente de gerar ou aplicar prosa.
- literaryProseApplications contém recibos de metadata. Journal genérico
  agora admite prose/proseApply e confirma contra as coleções privadas, sem
  ler conteúdo. ExpectedRevision do journal de aplicação é a revisão nativa
  observada; resposta incerta conserva o mesmo operationId e destino.
- Novas callables ligadas em index.mjs, SDK negado em Rules e ambas coleções
  incluídas na limpeza plana do livro. Sem novas dependências ou segredos.
- LiteraryProsePanel + literaryProseService montados na preparação.
  Escolha de cena/operação/segmento, fontes, comparação, custo explícito,
  confirmação de substituição, histórico de pedidos, cancel e recuperação.
  Trocar seleção remove a proposta mostrada e a proposta identifica a cena
  própria. Guard inclui orientação não enviada e aceites incertos.
- CaptureGeneration da plataforma passado do BookPage até este painel.
- Testes APENAS ESCRITOS: literaryProseProtocol.test.mjs,
  literaryProse.test.mjs, LiteraryProsePanel.test.tsx. Cobrem cobertura,
  unicode/HTML seguro, gate, aplicação/recibo/crédito, fontes mudadas,
  cancel tardio, origem retirada, aceite explícito e replay do mesmo pedido.
  Não foram executados, nem formatação/typecheck/build/regras/navegador.

Próximo trabalho:

1. Orquestrar capítulos por cenas e as duas camadas de revisão, com todas
   as unidades/segmentos, checkpoint, fronteiras e evidência de cobertura.
   A UI atual opera UMA cena/segmento por ação, não conclui capítulos.
2. Concluir E3 autocomplete com contexto/aceite seguro e invalidação.
3. E5 integração de atos e livro inteiro, matriz/impacto, progresso por etapa,
   publicação de versões identificadas, projeção pública e portabilidade
   privada/restore em nova cópia. Incluir os novos artefatos editoriais,
   respeitando a revogação de fontes e a separação de conversas privadas.
4. Fechamento E1/E2 também pendente contra os critérios integrais.
5. Só após implementação integral: gate final de testes/validate/Rules/UI,
   correções, diff, ADRs/docs/AGENTS/entregas e preparar a integração.
   Não houve commit/push/merge/deploy. Objetivo permanece ativo.

## Continuação: revisão integral por cenas e segmentos

Implementado em código, SEM executar testes ou validações:

- literaryReview.mjs coordena enumeração paginada das cenas nativas do capítulo,
  cada segmento completo em reviewStructure e reviewProse e a conclusão por
  cobertura, sem chamar uma análise de trecho de revisão integral.
- Núcleos precisam ser contíguos e alcançar o fim do texto; contexto sobreposto
  não conta duas vezes. Analyses contêm IDs/cobertura; citações e texto ficam
  somente nos pedidos de prosa já autorizados.
- Jobs sob literaryReviewJobs, unidades sob literaryReviewUnits e referências
  sob literaryReviewAnalyses, todos privados, negados ao SDK e no cleanup.
- Source proof reúne identidade/composição nativa do capítulo, sceneRevision,
  narrativeRevision, localLoreVersion, vínculo/encarnação/revisão de universo
  e literaryContextRevision. Mudanças invalidam cobertura/aceite atuais.
- Novo literaryContextRevision incrementado SOMENTE por contrato e planos.
  literaryRevision continua tendo seu uso amplo anterior. AssistedBook cria
  ambos quando há contrato; Rules impedem alteração SDK dos contadores.
  Preservar histórico e atualizar apenas metadata de publicação não devem
  invalidar uma análise do mesmo manuscrito/fontes.
- Modelo e raciocínio ficam fixos por job e efetivos por pedido. Se as
  capacidades do modelo mudarem, novo pedido exige nova revisão explícita.
- Retomada consulta o pedido determinístico existente antes de iniciar algo.
  Running não é prova de produtor vivo. Resposta incerta não cria outro ID.
- Falha terminal entra em attention; nova tentativa requer ação explícita,
  incrementa attempt apenas para a análise pendente e preserva anteriores.
- Cancelamento pode atingir todo o job ou somente o pedido pendente.
  Cancelar somente a análise permite regenerar sem perder cobertura anterior.
  Pedido que já terminou é consumido ao retomar, sem nova geração.
- Gate de conclusão é leitura completa das duas camadas. Achados blocking
  impedem aceite autoral. Cobertura pronta não declara que correções foram
  aplicadas, capítulo editorialmente concluído ou livro integrado.
- Primeiros fluxos atendem capítulos compostos por cenas. Capítulos legados
  não são convertidos silenciosamente; conversão explícita nativa preserva
  fonte legada. Avaliar suporte direto a legado ao fechar critérios globais.
- LiteraryReviewPanel + literaryReviewService conectados à preparação:
  início/retomada explícitos, pausa, cancel, consulta de checkpoint,
  achados/evidências e aceite separado. Guard cobre orientação e start incerto.
- Start tem recibo/journal de metadata (kind review). Cancelamento confirmado
  do start incerto encerra o mesmo acompanhamento local, sem perda de ponteiro.
- Leitura de prosa histórica ajustada: quando origens continuam autorizadas,
  getLiteraryProse pode mostrar análises/propostas de versões antigas,
  marcadas historical, com applicable false. Origem retirada/recriada continua
  ocultando derivados e conservando a instrução própria.
- readLiteraryMilestoneEnvelope exportado para reutilizar identidade/prova
  nativa em vez de duplicar capturas de conteúdo.
- Callables em index.mjs; avanço recebe segredo existente para os pedidos
  da plataforma. Nenhum segredo/chave vai para dados/metadata de recuperação.
- Testes apenas ESCRITOS: literaryReview.test.mjs (cobertura, replay,
  invalidação, bloqueios, regeneração, cancel, metadata de publicação);
  LiteraryReviewPanel.test.tsx (início não produz, aceite separado e cancel
  tardio). literaryProse.test foi atualizado para leitura histórica.

Próximo incremento:

1. Fechar redação de capítulo por cenas com checkpoint/aceite por unidade e
   marcos de primeira versão/revisão; integrar relatórios e correções ao fluxo.
2. E3 autocomplete contextual com aceite atômico e invalidação por metadata.
3. E5 integração de atos/livro, matrizes e impacto, progresso, publicação
   por versões e portabilidade privada/restauração dos artefatos.
4. Auditar escopo completo E1/E2, suportes legados e fontes/personas nativas
   em todos os caminhos novos antes de declarar as etapas prontas.
5. Só depois: testes, Rules, validate, UI real/temas/responsivo, revisão,
   ADRs/AGENTS/docs/entregas e preparação de integração.

Nenhum teste, validação, build, formatador, navegador, commit, push, merge ou
deploy foi executado nesta continuação. Objetivo integral permanece ativo.

## Continuação: redação supervisionada do capítulo por cenas

Implementado em código, ainda SEM testes/validações:

- literaryDrafting.mjs coordena enumeração paginada das cenas ativas ordenadas,
  geração por unidade, aceite explícito e preservação da primeira versão.
- Exige capítulo composto, fora de reordenação, e gate atual aceito.
  Fonte congelada usa nascimentos nativos e contadores lógicos de composição,
  cena/narrativa/lore/contexto e universo; não copia prosa no estado do job.
- Proposta por cena usa literaryProse. Retomada consulta pedido determinístico
  existente. Running/unconfirmed não autoriza criar outro produtor.
- Cena com texto entra em existingText, sem geração ou cobrança. Adoção é
  explícita, preserva versão nativa e tem replay por unitIndex/sourceToken.
- Aceite usa extensão interna de applyLiteraryProse, inacessível por JSON/HTTP:
  prepareCommit lê fonte/job/unidade antes de qualquer escrita; commit grava
  checkpoint e vínculo de recibo na MESMA transação que texto/ledger/crédito.
- O avanço permitido por escrita própria é calculado dos resultados lógicos
  do writer nativo (assemblyRevision/projectRevision), sem desativar CAS nem
  aceitar uma edição concorrente como se fosse da própria execução.
- literaryDraftReceipts liga aceite ao job/unidade atomicamente. Replay
  confirma recibo sem cobrar ou avançar duas vezes. Se uma proposta foi aplicada
  fora do fluxo, não inventa checkpoint; preserva texto/recibo e pede conferência.
- Captura anterior pelo histórico nativo continua fora da transação principal,
  idempotente. Falha posterior pode preservar essa versão, mas não grava texto,
  crédito ou checkpoint parcialmente.
- Regenerar é ação explícita, incrementa attempt somente na unidade atual.
  Impedimentos estruturais não são dispensados por regeneração: primeiro
  resolver decisões/preparação. Cancelamento impede reabrir etapas seguintes;
  cenas/versões já salvas permanecem.
- Ao aceitar/adotar todas as cenas, o job executa captura nativa firstDraft
  por literaryMilestones e só conclui após ela. Interrupção da preservação tem
  tentativa explícita própria, preservando artefatos anteriores.
- Contadores drafted/adopted/accepted são separados. done significa primeira
  versão preservada, não capítulo revisado, ato integrado ou publicação.
- LiteraryDraftPanel + literaryDraftService montados na preparação:
  registro, retomada até próxima decisão, leitura/adoção de texto existente,
  proposta, confirmação de 1 crédito por aplicação, recuperação exata,
  cancelamento e checkpoint. Guard inclui orientação, start/aceite incertos
  e confirmação de adoção. Start/cancel usam journal de metadata kind draft.
- Coleções privadas literaryDraftJobs/Units/Receipts negadas ao SDK e incluídas
  no cleanup plano. Novas callables e despacho em index.mjs; avanço usa segredo
  já existente da plataforma. Nenhuma nova dependência ou chave no cliente.
- Instrução de prosa corrigida para respeitar idioma do contrato/manuscrito,
  com português como fallback e idioma dos relatórios. Gravidades e fontes
  aparecem por nomes editoriais, sem expor códigos internos na UI.
- Testes somente ESCRITOS: literaryDrafting.test.mjs (geração separada do
  aceite, checkpoint/crédito/texto atômicos, replay, continuidade da cena
  anterior, preservação integral, adoção, edição concorrente, rollback,
  bloqueios e cancelamento); LiteraryDraftPanel.test.tsx (ações separadas e
  recuperação do mesmo aceite). Nenhum foi executado.

Próximas ações integrais:

1. E3 autocomplete com contexto, aceite atômico e invalidação por metadata.
   Auditar persona/lore nativos também nos novos caminhos estruturados.
2. E4 reconciliação explícita de fontes/preparação mudadas sem refazer prosa
   válida por formalismo; ligar revisão/correções/marco revisado ao progresso.
   O modo atual é supervisionado por cena; auditar modos de colaboração.
3. E5 integração de atos/livro com leitura integral/cobertura, matrizes/impacto,
   progresso por etapa, publicação por versões e projeção pública sem spoilers.
4. E5 portabilidade privada/restauração em cópia nova, incluindo decisões,
   planos, gates, versões e relatórios, respeitando fontes revogadas.
5. Fechamento E1/E2 e casos legados contra todos os critérios do plano.
6. Só após implementação integral: testes/Rules/validate/browser/UI responsiva
   nos temas, correções, revisão do diff, docs/ADRs/AGENTS/entregas e preparação
   da integração. Não houve commit/push/merge/deploy.

Objetivo permanece ativo. Esta continuação alterou estado real da worktree,
mas não constitui evidência de fluxos funcionais ou etapas aprovadas.

## Continuação: personas canônicas e backend de autocomplete

Estado real: código alterado; NENHUM teste, typecheck, formatação, build,
Rules, navegador ou validate executado. Objetivo completo segue ativo.

### Persona nativa compartilhada

- literaryPersona.mjs reutiliza readEditorChatPersona e o compilador puro
  existente. Resolve livro + complemento do capítulo para capítulo legado
  ou cena. Não duplica regras de traits, perfis/presets ou disponibilidade.
- Metadata guarda identityToken/versionToken e seleção histórica dos perfis,
  sem credenciais. Binding births vêm dos snapshots reais. Reautorização
  histórica consulta os perfis originais na biblioteca atual, antes de corpos.
- Mudar vínculo/revisão torna a persona anterior histórica; retirar/recriar
  perfil ou perder sua autorização oculta derivados. Configuração corrente
  inválida não autoriza material histórico sem reautorizar suas origens.
- literaryProse inclui persona canônica como documento, congela metadata e
  reautoriza antes de geração/leitura/aplicação. Contrato/POV/reservas prevalecem
  sobre preferências estilísticas.
- Provas de literaryDrafting e literaryReview incluem a versão da persona.
  Retirada de perfil remove prontidão/aceite atuais sem remover prosa aplicada.
- Teste literaryPersona.test.mjs escrito, NÃO executado.

### Backend do autocomplete contextual

- literaryAutocomplete.mjs implementa prepare/complete/get/cancel/apply e
  consulta de aplicação. ESTÁ SOMENTE NO BACKEND; RichEditor/useAIAutocomplete
  AINDA usam o caminho anterior. Não declarar E3 concluída.
- Unidade suportada é capítulo legado. Cenas/blocos continuam com autocomplete
  e débito legado desabilitados, preservando o contrato nativo existente.
- Captura contexto compacto literaryWriting, ausência de guia por manifesto,
  persona canônica e prefixo autoral, com beforeHash do HTML ainda não salvo.
  Fontes/POV/reservas essenciais não são truncadas; excesso falha explicitamente.
- Plataforma gera no servidor. BYOK recebe prompt/configuração pública
  congelados e completa pelo cliente; não recebe chave no servidor. A integração
  local de BYOK/parse do JSON ainda precisa ser escrita no adapter frontend.
- Limite separado de 120 preparações/autor/h em chapterChatLimits/autocomplete,
  sem consumir a cota current do chat. A coleção de cotas já é limpa pelos
  fluxos de exclusão de perfil/conta existentes.
- Sugestões disponíveis por 10 minutos. Reservas permanentes de metadata
  impedem reutilizar IDs/ressuscitar produtor após expiração ou cancelamento.
  Textos expirados têm cleanup assíncrono limitado (100 por rodada/hora);
  reservas e recibos ficam até excluir o livro, para preservar idempotência.
- Apply reautoriza origem/frescor, compara o texto salvo com beforeHash,
  verifica HTML seguro/inserção da proposta e usa prepareLegacyChapterTextWrite.
  Manuscrito, contagem/ledger, crédito e recibo são atômicos. Plataforma custa
  1 no aceite; BYOK não debita. Replay retorna metadata do mesmo recibo.
- Recibos NÃO contêm manuscrito. A recuperação futura no editor deve usar
  IDs/hashes e consultar o texto atual, preservando novas edições locais.
- Novas coleções privadas: literaryAutocompleteRequests/Reservations/Applications.
  Regras negam SDK, cleanup do livro inclui todas. Índice de grupo em expiresAt
  para a rotina cleanupExpiredLiteraryAutocomplete.
- index.mjs registra callables/despacho/schedule e limita autocomplete da
  plataforma a 1024 tokens de saída no helper JSON já existente.
- Teste literaryAutocomplete.test.mjs escrito, NÃO executado: plataforma,
  BYOK, crédito/recibo atômicos, nonce, cancel, expiração e texto divergente.

### Próximo trabalho prioritário

1. Conectar backend ao RichEditor/useAIAutocomplete e EditorPage:
   - prop explícita book/chapter (documentId atual é só chapter.id);
   - captura beforeHash do HTML e posição/transaction estáveis no RichEditor;
   - geração canônica e BYOK sem chaves em snapshots;
   - aceite pelo host do EditorPage: lock, saveNow, serialização por capítulo,
     compare de fonte, RPC atômica, commit local e resetSavedContent;
   - journal somente metadata/hashes, recuperação de resposta incerta sem
     reaplicar/deduzir de novo nem sobrescrever rascunhos mais recentes;
   - invalidação passiva por metadata e epoch/abort em troca de escopo.
     Não basta consultar frescor e continuar usando deductCredit do SDK.
2. Revisar suporte a persona/lore em todos os caminhos novos, resultados
   históricos e privacidade. Autocomplete antigo ainda não incorpora o guia.
3. E4 reconciliação explícita de fontes mudadas, modos de colaboração,
   correções/revisão/marco revisado e ligação ao progresso.
4. E5 integração de atos e livro com cobertura/matrizes/impacto, publicação
   versionada, projeção pública e portabilidade privada/restore em cópia nova.
5. Fechar E1/E2 e legado contra os critérios completos.
6. Só depois: gate final completo, correções, revisão, documentação/ADRs/
   AGENTS/entregas e preparar integração. Sem commit/push/merge/deploy.

## Continuação — autocomplete canônico conectado ao editor legado

Implementação em código, SEM testes/format/lint/typecheck/build/regras/browser executados.
Sem commit/push/merge/deploy. Objetivo completo permanece ativo.

### Autoridade e correção de direção

- A continuação anterior respondeu com plano, sem avançar implementação.
- Retomada pelo objetivo explícito: implementar cinco etapas na worktree própria
  a partir de codex/writer-v2; executar validações somente antes da integração.
- Não tocar master ou trabalho paralelo. Worktree canônica continua esta.

### Alterações atuais

- Novos atomicAutocomplete.ts, autocompleteApplyStorage.ts e
  literaryAutocompleteService.ts na feature ai-assistant.
- Journal usa uma chave imutável por operationId/ator/livro/capítulo, apenas
  IDs e hashes; WebLocks curtos protegem escrita/remoção. Corrupção é preservada.
  Nenhum manuscrito, prompt ou credencial entra nesse novo journal.
- Cliente prepara contexto canônico no servidor; BYOK reautoriza antes da
  entrega, usa credencial local atual para o provedor/modelo congelados,
  saída JSON STOP e teto1024. Credenciais nunca vão aos callables.
- aiClient aceita frozenGeneration para BYOK e ignora partes thought Gemini.
  Fluxos legados mantêm suas opções anteriores quando não congelados.
- Backend abandonLiteraryAutocompleteApplication cria fence permanente por
  operationId. Cancelamento que vence impede aplicação tardia; aplicação que
  vence devolve o recibo. getApplication reconhece canceled/confirmed/unconfirmed.
  Recibos confirmados têm state:'confirmed'. Callable está em index.mjs.
- Hook useAIAutocomplete tem atomicScope/captureDocument/planIds/contextVersion,
  snapshot editorial da oferta e expiração. Oferta atômica só aplica via host;
  nunca recorre a deductCredit SDK. ConfigVersion usa campos públicos+revision,
  não serializa credenciais. Falha incerta não abre modal de saldo indevidamente.
- RichEditor recebe bookId, onAtomicAutocompleteApply, autocompletePlanIds,
  autocompleteContextVersion. Captura HTML/hash e doc+seleção, monta transaction
  com DOMSerializer e texto literal, pede confirmação ao host e só então
  dispatch. Corrigido regexp de espaçamento /\s$/ anteriormente escapado demais.
- EditorPage passa scope explicitamente, oferece WritingSourcePicker para
  autocomplete e RichEditor mostra WritingContextPreview da captura REAL
  retornada pela geração. Não usa preview atual como prova de geração antiga.
- Backend retorna editorial no resultado ready e prepared após grants/frescor;
  platform usa captura do claim ainda validada, complete BYOK lê corpo só após
  current=true. Snapshot fica só em RAM na oferta, não no journal.
- Host saveNow ANTES da fila serial; compara live/saved/persisted antes de
  begin journal e RPC. Atualiza texto local/contagem/crédito só após recibo
  correspondente (request/op/chapter/before/after hashes). Perda de resposta
  mantém fence, bloqueia novo aceite/history/navegação até resolver.
- Recuperação consulta metadata do recibo e lê o manuscrito ATUAL do capítulo,
  sem reenviar proposta antiga. Edições locais divergentes vão ao diálogo de
  rascunho existente, com cópia preservada, para decisão explícita do autor.
- useAutoSave ganhou paused separado de enabled. Pausa pendências/corrupção do
  journal (não autocompleteBusy: é necessário completar saveNow antes da RPC).
  Mantém backup local, não agenda save nem flush no unmount durante incerteza.
  Remover pausa reativa save normal; confirmedContent atualiza base de verdade.
- subscribeWritingBindings tem 5o callback opcional onContextHint(version).
  Usa apenas root literaryContextRevision/localLoreVersion/sceneRevision/
  narrativeRevision/universeId e chapter actId/createdAt/contentMode. Não usa
  updatedAt genérico para evitar invalidar a cada autosave. API original de
  settings não mudou. Editor combina hint e versões de lore para abort/epoch.
  Esses eventos são hints; não concedem permissão/frescor de fonte.
- globalLoreError também desabilita IA do editor enquanto indisponível.
- Os controles nativos de cenas/blocos continuam autocomplete:false.

### Testes escritos, NÃO executados

- literaryAutocomplete.test.mjs: acrescentados fence antes de aplicação e
  cancelamento após commit (mesmo recibo, sem segundo débito).
- autocompleteApplyStorage.test.ts: operações simultâneas independentes,
  identidade imutável, escopo, corrupção e indisponibilidade de locks.
- literaryAutocompleteService.test.ts: plataforma, nonce não cancelado após
  oferta, contexto BYOK canônico/config congelada/sem chaves em callables,
  metadados de cancelamento.
- useAIAutocomplete.test.ts: host atômico, nenhum SDK debit/fallback, resposta
  incerta não dispara diálogo de saldo.
- useAutoSave.test.ts: backup sem flush na pausa e retomada após cancelamento.
- EditorPageAutocomplete.test.tsx: confirmação, resposta perdida, leitura da
  versão atual sem replay e cancelamento pelo fence.

### Próximos passos concretos (não encurtar escopo)

1. Ler código atual do host/hook/service para continuar; não reiniciar.
   E3 ainda precisa auditoria completa de todas as fontes/caminhos/legado.
   Considerar frescor por grants de fontes indiretas além dos hints raiz;
   servidor já bloqueia aceite obsoleto. Verificar seleção/coverage e UI final.
   subscribeWritingBindings agora aceita 5o argumento; possíveis asserts antigos
   de mocks precisam adaptação no gate final. Nenhuma suíte foi executada.
2. E4: reconciliação explícita de fontes alteradas, modos de colaboração,
   correções/revisão/marco revisado e ligação ao progresso.
3. E5: integração integral ato/livro com cobertura real/matrizes/impacto,
   publicação versionada, projeção pública spoiler-aware e pacote privado/
   restore em nova cópia. Essencialmente pendente; não declarar concluído.
4. Fechar E1/E2 contra critérios originais, compatibilidade nativa/legado.
5. Somente depois executar gate completo de testes/validate/rules/browser,
   corrigir/revisar e atualizar docs/ADRs/AGENTS/entregas antes da integração.

### Continuação — reconciliação explícita de referências de planejamento

- getLiteraryPlan/getVersion agora retornam currentReference somente quando a
  mesma origem continua autorizada (sourceToken igual). Fontes indisponíveis/
  outra origem retornam null, sem expor seu título nem reatar ID reciclado.
- LiteraryPlanningPanel mostra revisão registrada e revisão atual e oferece
  atualizar apenas o vínculo no rascunho. Mantém conteúdo da ficha e manuscrito;
  rebaixa a nova proposta a working, exige salvar e aprovar explicitamente.
  Não confunde atualização de referência com revisão da prosa/gate.
- Testes literaryPlanning.test.mjs acrescentados para preservação de texto/
  histórico/aprovação anterior e recusa de shortcut para origem indisponível.
  NÃO executados.
- Isso é uma parte da reconciliação, não encerra E4: revisão/marco revisado,
  reuso conferido de análises válidas e impacto de alterações ainda precisam
  implementação integral.

## Continuação — versão revisada vinculada à revisão integral aceita

Tudo abaixo permanece SEM execução de testes/validações/format/build/browser.
Sem commit/push/merge/deploy. Objetivo completo continua ativo.

### Backend

- literaryReview.mjs exporta readLiteraryReviewSource(tx,c,chapterId), com root,
  manuscriptToken (envelope nativo do capítulo) e token da revisão.
- Revisão v2 não inclui root.sceneRevision global no token. O envelope do
  próprio capítulo já muda com suas gravações/estrutura de cenas. Assim, escrever
  em outro capítulo não descarta esta revisão. Mantém invalidação conservadora
  por narrativa, guia e lore; reconciliação/reuso mais preciso segue pendente.
- Novo advanceLiteraryReviewedVersion({target,jobId,expectedSourceToken,restart?}):
  exige cobertura done de todas as cenas nas duas camadas, unidades>0,
  zero blocking, aceite autoral e fonte atual igual ao token esperado.
- Captura revised via literaryMilestones/histórico nativos, uma etapa por RPC.
  milestoneId determinístico por reviewId+attempt, checkpoint no próprio job
  (sem coleção extra). Repetição não duplica captura. Não gera/revisa prosa.
- Finalização compara novamente fonte atual, envelope do manuscrito,
  milestone.chapter/kind/sourceToken, planejadas=capturadas=verificadas
  iguais às unidades da revisão e checksum historyRevision atual.
- Propriedades públicas: revisedMilestoneId, preservationState
  (unrecorded/capturing/attention/done), preservationCurrent, preservedAt e
  preservationProgress(planned/captured/verified). Fonte e história devem ser
  reconferidas para preservationCurrent:true; listas não anunciam atualidade.
- current() recompõe estado da preservação; mudar manuscrito revoga aceite e
  preservationCurrent. start replay também chama current antes de devolver
  metadata, evitando anunciar resultado antigo como atual.
- Se uma captura vira stale/canceled, preservationState=attention; outra
  captura requer restart:true explícito e attempt novo. Anterior preservada.
- literaryMilestones ganhou recheckLiteraryMilestone: após mudança de
  historyRevision, marco done retorna a verifying com verified=0. Confere todos
  os vínculos nativos sem criar versões novas.
- Verificação de marco trata versão excluída/indisponível como stale em vez
  de ficar eternamente lançando erro na mesma unidade.
- Callables advanceLiteraryReviewedVersion/recheckLiteraryMilestone em index.
  Instância de literaryReview recebe milestones já compartilhado no index.
  Não há coleções novas nesta continuação.

### Interface

- literaryReviewService adiciona os tipos/callable.
- LiteraryReviewPanel tem ação explícita Preservar versão revisada aceita,
  retomada em loop com pausa após chamada, progresso, conferência e mensagens
  separadas de integração. Após histórico mudar permite reconferir versões.
  Captura attention exige Registrar nova captura revisada.
- onWorkChange reporta pending durante busy/canceling para proteção de saída.
- Não transforma avaliação técnica em aceite nem marco genérico em revisão.

### Testes ESCRITOS e NÃO EXECUTADOS

- literaryReview.test.mjs: captura revisada exata só após aceite, replay sem
  novas versões/geração, fonte alterada, historyRevision mudou e reconferência,
  escrever capítulo diferente não invalida revisão atual.
- literaryMilestones.test.mjs: recheck após excluir versão detecta stale.
- LiteraryReviewPanel.test.tsx: captura só por ação explícita, retomada, nova
  tentativa só após pedido.

### Próximos passos (preservar todo o objetivo)

1. Completar E4: reconciliação/reuso de análises válidas após mudanças reais
   de fontes/guia/narrativa, correções ligadas aos achados e modos de colaboração.
   A invalidação global por literaryContextRevision/narrativeRevision/lore ainda
   é conservadora. Não basta remover checks: análises de cenas podem incluir
   planejamentos específicos que o contexto de capítulo não contém.
2. E5 segue por implementar: integração integral de atos/livro (cobertura real,
   transições/matrizes/impacto), progresso derivado de artefatos atuais,
   publicação identificada, spoiler público, pacote editorial privado e restore
   em cópia nova. Não redefinir sucesso como snapshots/revisão de capítulo.
3. Fechar E1/E2/E3 contra critérios originais e compatibilidade nativa/legado.
4. Executar gate completo somente quando implementação integral estiver pronta
   para integração; corrigir falhas, revisar, docs/ADRs/AGENTS/entregas.

## Continuação — fontes canônicas e contrato da integração de ato/livro

Código e testes escritos; NENHUM teste/format/lint/typecheck/build/Rules/browser
executado. Sem commit/push/merge/deploy. E5 NÃO está concluída.

### Novos módulos (ainda internos; nenhum callable/UI da integração criado)

- functions/src/literaryIntegrationSources.mjs:
  - readLiteraryIntegrationFence(tx,c): ownership e birth do livro, fence
    conservador root.updatedAt+sceneRevision+narrativeRevision+
    literaryContextRevision+localLoreVersion+universeId e stamp do universo.
    Não é hash do manuscrito e não comprova cobertura.
  - listLiteraryIntegrationChapters(tx,c,{level:'act'|'book',actId?,afterId?}):
    metadata em páginas25 por **name**, conferência de capítulo/ato e filtro
    de ato. Retorna token por capítulo baseado em birth/updateTime, título,
    ordem, modo, composição e vínculo do ato. Sem leitura de bodies nessa etapa.
  - orderLiteraryIntegrationChapters(chapters): mesma organização do
    groupChapters nativo (atos em ordem, capítulos em ordem, não atribuídos
    por último; vínculo de ato ausente permanece visível em não atribuídos).
  - listLiteraryIntegrationUnits(tx,c,{chapterId,chapterToken,after?}):
    legado = uma fonte canônica; cenas = páginas20 na rankSlot atual,
    token com origem/metadata/bodyHash. Rejeita mudanças na composição.
  - readLiteraryIntegrationUnit(tx,c,unit): legado usa readBookChapterText
    (inclusive chunks), cena usa readHistorySource (body nativo verificado),
    devolve plaintext/literal offsets de base, hash HTML e token.
    Não lê snapshot de conversão nem usa sinopse como conteúdo.
    Rejeita vazio, origem alheia, outro livro, arquivamento, formato desconhecido,
    substituição ou mudança de token. IDs stable manuscript:chapter:kind:id.
- functions/src/literaryIntegrationProtocol.mjs + .d.mts:
  - Oito eixos: time/knowledge/relationship/planting/causality/promise/voice/
    reservation.
  - normalizeLiteraryIntegrationReading: resposta complete, report, até40
    findings e40 matrix,1-3 evidências literais por item em fonte identificada;
    offsets originais (offsetBase+posição). Findings open, matriz proposal.
    Escopos unit-segment/chapter-boundary nunca anunciam capítulo/ato/livro
    integral. Fonte duplicada, quote inventada e resolved automático rejeitados.
  - normalizeLiteraryIntegrationSynthesis: conclusions/findings só podem citar
    evidenceIds realmente fornecidos; síntese não vira leitura do manuscrito.
  - advanceLiteraryIntegrationCoverage: cursor contíguo dos intervalos core,
    mesma fonte e segmentCount; rejeita sobreposição, lacuna, replay, começo
    no meio e último segmento sem alcançar o fim.
- Tests literaryIntegrationSources.test.mjs e
  literaryIntegrationProtocol.test.mjs escritos, NÃO executados.
  Cobrem ordem nativa, legado e cenas, origem revogada, vazio, literalidade,
  encadeamento de síntese e cobertura core.

### Próxima implementação concreta de E5

É necessário ligar esses módulos a um serviço/workflow persistente, callables,
regras/cleanup/índices, recuperação e painel; não confundir helpers com entrega.
Projeto proposto para continuar (ainda não implementado):

1. Job privado com escopo act/book, modelo/raciocínio congelados, fontes/guia
   versionados, idempotência/cancel fence e estado planning/reading/boundaries/
   synthesizing/verifying/done/stale/attention/canceled.
2. Enumerar capítulos e suas unidades em páginas; persistir metadados separados
   para não impor quantidade fixa nem ultrapassar documento1MB.
   Ordenar pela organização real, não pela ordem de descoberta **name**.
3. Ler cada fonte em segmentos literários (literaryReviewSegments), com core
   ledger sem duplicação. Cada análise tem quota/erro/retry explícitos, fonte
   e evidência preservadas; análise não aplica correções nem debita manuscrito.
4. Conferir também as transições. Para ato é obrigatório incluir a passagem do
   ato anterior (helper atual filtra só ato; localizar predecessor pela ordem
   do livro é trabalho restante). Não usar apenas relatórios dos capítulos.
5. Matriz/achados paginados com evidência de reading/boundary; síntese do conjunto
   precisa manter cadeia até as fontes originais. Proposta: nós em árvore,
   lotes de até4 com orçamento <=500k e saída <=120k, encadeamento de evidenceIds;
   não truncar/dropar linhas nem anunciar leitura completa só pela síntese.
6. Revalidar manifestos e cobertura antes de aceite. root.updatedAt é fence
   conservador (metadados/publicação podem mudar sem mudar texto); implementar
   reconferência de fontes sem regenerar análises válidas. Não simplesmente
   remover checks de concorrência/privacidade.
7. Correções/impacto, progresso, publicação de versões específicas, spoiler
   público, export/restore editorial privado em nova cópia seguem pendentes.

### Restante do objetivo anterior continua

- E4: reconciliação/reuso preciso de análises válidas, achados/correções,
  modos de colaboração. Revisão aceita e marco revisado foram ligados na
  continuação anterior, ainda sem validação.
- Fechar E1/E2/E3 completos e legado.
- Gate final somente após implementação integral: testes/validate/regras/UI,
  correções, revisão/docs/ADRs/AGENTS/entregas. Não executar antes.

## Continuação — workflow e painel de integração de ato/livro implementados em código

Ainda SEM executar testes, formatação, lint, typecheck, build, regras ou browser.
Sem commit/push/merge/deploy. O objetivo completo continua ativo e NÃO concluído.

### Serviço novo: functions/src/literaryIntegration.mjs

- createLiteraryIntegrationService({db,generator,now}) usa os leitores canônicos
  e o contrato puro adicionados na continuação anterior.
- start/get/advance/cancel/accept/list; cancelPendingAnalysis e retryAnalysis
  explícitos; listResults e getResult. Callables registrados em index.mjs e
  instância integrada ao despacho. Apenas advance exige segredo do gerador.
- start é metadata apenas, modelo/raciocínio resolvidos/congelados, contrato de
  operationId/jobId imutável, recibo literaryOperations e marcador de adoção.
  cancel-before-start cria fence que impede registro/geração tardios.
- Planejamento pagina capítulos25 por **name**, depois os percorre na ordem
  nativa via índices sortActOrder/sortActId/order/chapterId. Não usa ordem de
  descoberta como sequência narrativa.
- Em ato, inclui o capítulo predecessor na ordem do livro como role:passage
  antes do primeiro capítulo do escopo. Lê esse capítulo integralmente como
  contexto (mais que uma janela da passagem); cobertura principal separa esses
  units/chapters dos do ato. Em livro, inclui todos, inclusive sem ato.
- Units paginados20 por capítulo; legado canônico ou cenas em rank atual.
  Não aceita capítulo vazio/sem cena nem texto vazio como cobertura integral.
- Leitura por literaryReviewSegments (cores18k, overlap1200), ledger contíguo
  por unidade. Cada transição entre capítulos tem análise adicional de janelas
  de2400 caracteres, com offsets reais, sem se apresentar como leitura integral.
- Guia/contexto canonical snapshot por unidade: contrato/fichas/fontes
  selecionadas. Snapshots completos só em RAM do gerador; request guarda
  manifesto de fontes. Integração NÃO usa personas como fonte de seu relatório
  nem redige prosa. Guia e texto sustentam avaliação de voz.
- Análises custam cota de assistência compartilhada60/h, sem débito de
  manuscrito. Se a cota esgotar, checkpoint permanece e usuário retoma depois.
- Resultado reading/boundary é literal-normalizado com matriz/achados.
  Findings open, linhas de matriz proposal; IA não aplica correção nem aceite.
- Síntese em árvore de até4 nós por lote, lote adaptativo <=495k, cada saída
  <=120k. Todos os nós originais ficam preservados e navegáveis, mesmo quando
  uma conclusão final não cita cada um. evidenceIds só do lote fornecido.
  Normalização falha/saída interrompida vira attention, sem mascarar resultado.
- Corpo de cada resultado separado do header; headers guardam sources,
  manifesto, coverage, children e estado. IDs determinísticos por tarefa/
  segmento/round/attempt. running não dispara outra geração por retomada.
  Só erro/cancel pode ser regenerado por pedido explícito, attempt novo.
- Commit de resultado, node/sequence, ledger e checkpoint atômicos; resultado
  tardio não confirma após cancelamento, mudança da fonte ou outro checkpoint.
- Verificação final relê cada unidade canônica e reautoriza cada análise/
  manifesto. Só após todos os units/analyses/transitions e síntese final retorna
  cobertura wholeAct ou wholeBook. Aceite é outro comando, exige done atual,
  contagens conferidas, zero blocking e sourceToken correspondente.
- Achados de camadas diferentes podem duplicar diagnóstico; contagem é de
  registros, não problemas únicos. Bloqueio de folha não some na síntese.
- getResult revalida ownership/fence e fontes/manifesto de request antes de ler
  corpo. Mudança de fonte retorna stale sem corpo. Histórico derivado permanece
  armazenado mas consulta atual é conservadora; reconciliar histórico/reuso sem
  perder privacidade ainda é trabalho restante.
- Fence conservador inclui root.updatedAt, scene/narrative/literary context,
  localLoreVersion/loreVersion, birth de livro e stamp/autoria do universo.
  Ele não substitui cobertura. Publicação/metadados também podem invalidá-lo;
  reconferência de fontes sem regeneração ainda precisa implementação.

### Persistência/segurança/recuperação

- Novas coleções privadas deny SDK e no cleanup completo do livro:
  literaryIntegrationJobs, Chapters, SelectedChapters, Units, Requests,
  Results, Nodes, Sequence (todas com prefixo literaryIntegration).
- Índices compostos para Chapters(jobId,sortActOrder,sortActId,order,chapterId)
  e Sequence(jobId,index). Excluída indexação de Results.result/sources e
  Requests.sources/manifest; JSON escrito em LF.
- literaryRecoveryStorage e getLiteraryOperation aceitam kind integration,
  recibo aponta ao job. Journal mantém só IDs/hash, nunca texto/credenciais.
  RecoveryPanel reconhece nome de integração.

### Interface

- literaryIntegrationService.ts expõe contratos/callables com timeout120s.
- LiteraryIntegrationPanel integrado à quarta área do LiteraryProductionPanel,
  mantendo painéis visitados montados e guard agregado de dirty/pending.
- Escolha livro/ato, consulta atos, instrução, WritingSourcePicker, registro
  explícito, retomada/pausa, consulta/cancelamento, retry de análise,
  cobertura, matriz, cadeia inteira de evidências e aceite separado de publicação.
- Listagem avisa que registros são históricos; abrir checkpoint confere
  atualidade. Síntese permite abrir TODOS os nós de apoio, além das referências
  escolhidas pela IA. Operações em voo entram no guard de navegação.
- Não há publicação, progresso geral ou aplicação de correções nesse painel.

### Testes ESCRITOS, NÃO executados

- functions/test/literaryIntegration.test.mjs: cobertura real/segmentos/
  transições/árvore/aceite separados, predecessor de ato, nenhum débito/
  manuscrito alterado, bloqueios preservados, source drift e privacidade,
  retry explícito, cancel-before-start, produtor tardio cancelado e autoria.
- src/features/literary-production/tests/LiteraryIntegrationPanel.test.tsx:
  registro sem geração, retomada, aceite separado e retorno tardio cancelado.

### Próximo trabalho concreto (todo o escopo restante permanece)

1. Inspecionar o código atual antes de continuar, sem executar validações ainda.
   Conferir source grant/fence contra TODOS os contratos nativos (lore, restores,
   narrativa, exclusões): não remover proteção para facilitar retomar.
2. Implementar reconferência/reconciliação de integração após mudança de fence:
   distinguir metadados/publicação de alteração de fonte, reaproveitar evidências
   válidas e preservar histórico autorizado. Hoje stale é conservador.
3. Ligação de achados/correções/decisões e análise de impacto; progresso
   derivado por etapa/artefato atual. Integração de ato deve distinguir capítulos
   revisados e versões preservadas da simples leitura do manuscrito atual.
4. Publicação com versões específicas e manifesto confirmado; bíblia privada
   versus catálogo público por progresso de cada volume/spoilers.
5. Portabilidade editorial privada e restore em nova cópia, com decisões,
   planejamento, versões/vínculos/checkpoints sem credenciais.
6. Fechar E4 colaboração/reconciliação/reuso preciso e E1/E2/E3 completos.
7. Só após implementação integral: executar gate de testes/validate/regras/
   browser, corrigir/revisar e fechar docs/ADRs/AGENTS/entregas. Sem integração,
   push ou deploy implícitos.

## Continuação — reconferência sem geração e reutilização entre integrações

Todos os testes continuam apenas ESCRITOS. Nenhum teste/validate/lint/typecheck/
format/build/Rules/browser foi executado. Sem commit/push/merge/deploy.
Objetivo permanece ativo, com as cinco etapas completas ainda por concluir.

### Reconferência de integração já concluída

- Novo functions/src/literaryIntegrationRecheck.mjs e quatro callables
  start/get/advance/cancelLiteraryIntegrationRecheck (sem gerador/segredo).
- Origem precisa ser integração integral concluída (phase done, finalRequestId,
  completedAt, sourceFence esperado). Nonce/recibo/fingerprint imutáveis e
  cancel-before-start. Uma reconferência ativa por integração; outra não a troca.
- Snapshot do novo fence, enumeração paginada25, ordenação e seleção real
  (inclusive predecessor do ato), comparação com SelectedChapters original,
  releitura canônica de cada unidade e conferência de todas as Requests/manifests.
- Mudança apenas de metadados/publicação pode atualizar o fence sem chamar IA
  nem criar análises. Reconfere todas as provas antes de restaurar state done.
- Não restaura authorAccepted automaticamente: novo aceite explícito é exigido.
  Reconferência preserva previousFence/newFence/previousAcceptedAt/finalRequestId.
- Mudança real termina state changed com a PRIMEIRA divergência localizada
  (chapter/unit/editorial/organization/coverage etc). Não afirma mapa completo de
  impacto e não renova aprovação da fonte alterada. Registro original fica stale.
- Mudança durante conferência termina changed/concurrent; cancel fence impede
  avançar tardiamente. Operação concluída é idempotente.
- Coleções literaryIntegrationRechecks e literaryIntegrationRecheckChapters
  privadas (deny SDK), incluídas no cleanup do livro; índice de capítulos por
  operationId/sortActOrder/sortActId/order/chapterId.
- Journal getLiteraryOperation/literaryRecoveryStorage reconhece
  integrationRecheck, apenas IDs/hash. Sem plaintext/credenciais persistidas ali.

### Reutilização comprovada em integração sucessora

- literaryIntegrationSources agora devolve identityToken estável separado do
  token de versão: birth do livro/capítulo/cena + escopo/ator. Troca/recriação do
  mesmo ID não recupera identidade antiga. Leitura de versão antiga continua
  exigindo token de versão atual; não removido nenhum check nativo.
- Cada tarefa tem inputHash de TODA a entrada: documentos/textos/offsets,
  schema, system instruction, orientação do autor, geração congelada, escopo/
  papel (main/passage), identidades das fontes e origens de planos/referências.
- Busca bounded5 em Requests(inputHash,state done). Reautoriza manifesto
  histórico antes de ler resultado. Igualdade de texto sozinha não permite
  reatar origens recriadas.
- Resultado equivalente é copiado para uma NOVA request/checkpoint, com
  reusedFrom e fontes atuais. Não chama gerador nem consome cota. Todas as
  verificações finais da integração sucessora continuam obrigatórias.
- Achados/blocking da folha copiada são preservados. Novo job não herda aceite.
- Mudança no trecho/pedido/contexto exige geração. Transições alteradas são
  reanalisadas. Síntese da sucessora usa novas identidades de nós e é refeita.
- Nó de síntese carrega kind/role/chapterId para distinguir o predecessor
  (contexto) do escopo principal. Todo nó incluído continua navegável.
- Índice Requests(inputHash,state) adicionado; novas identidades são metadata
  interna, sem novas credenciais ou manuscrito no journal.
- Summary expõe reusedAnalyses, canRecheck, recheckOperationId/lastRecheckId.

### Interface

- LiteraryIntegrationRecheckPanel e serviço públicos: registro explícito,
  consulta/retomada/pausa/cancelamento, progresso, primeira divergência e novo
  aceite. Busy/pending integrados ao guard do painel pai.
- Integração permite Preparar integração sucessora com estas orientações:
  getLiteraryIntegrationSetup devolve só configuração pública e instrução do
  autor, respeitando a criação de rascunho antes de registrar. Não sobrescreve
  orientação já digitada; descartar preparação é uma ação explícita.
- Mostra configuração do modelo recuperada e opção usar configuração atual,
  contagem de análises reaproveitadas e sua origem. Registro de nova integração
  fica bloqueado enquanto a reconferência local está em voo.
- getSetup não expõe relatórios de fontes revogadas: só inputs próprios do
  autor/configuração pública. Não há chaves.

### Testes escritos, NÃO executados

- literaryIntegrationRecheck.test.mjs: publicação/metadados sem regeneração,
  texto mudado não aprovado, primeira divergência e concorrência, cancel
  antes do start, exclusão mútua, sucessora reaproveita só trechos equivalentes,
  IDs recriados com texto igual não reaproveitam origem antiga.
- LiteraryIntegrationRecheckPanel.test.tsx: início explícito, retomada, novo
  checkpoint sem aceite automático, divergência e retorno tardio cancelado.
- As suítes antigas podem exigir atualização de fixtures/mocks/índices no gate;
  nada foi executado para descobrir falhas ainda.

### Restante prioritário do objetivo

1. Ligar achados a decisões/correções reais e mapa de impacto completo, com
   reconferência das dependências; primeira divergência não substitui isso.
2. Progresso por etapa derivado de artefatos atuais; ato integrado deve
   distinguir versões revisadas/preservadas da mera análise do texto atual.
3. Publicação de versões específicas/manifesto confirmado; catálogo público
   com progresso por volume/spoilers, separado da bíblia privada.
4. Pacote editorial privado e restore em cópia nova, incluindo decisões,
   planejamentos, versões/vínculos/checkpoints e ausência de credenciais.
5. E4 colaboração e reconciliação/reuso do capítulo, E1/E2/E3 completos e
   compatibilidade nativa/legado.
6. Gate final somente quando a implementação integral estiver pronta para
   integração: testes/validate/regras/browser, correções, revisão e docs/
   ADRs/AGENTS/entregas. Nenhum merge/push/deploy implícito.

## Continuação — backend de decisões de achados e provas de correção

Nenhum teste/validate/lint/typecheck/format/build/Rules/browser executado.
Sem commit/push/merge/deploy. Objetivo integral ainda ativo.
ATENÇÃO: a interface de decisões AINDA NÃO foi criada/conectada. Há serviço
frontend tipado e callables, mas o autor ainda não consegue usar o fluxo pela UI.

### Módulos novos

- literaryFindingTargets.mjs: destinos tipados chapter/scene/act/arc/event/
  localLore/globalLore/plan/contract, separados de escopo book. Resolve origem,
  versão, hash/revisão e rótulo autorizados; texto usa readHistorySource;
  guia/planejamento usam conteúdo atual e identidade imutável; outras fontes
  certificam revisão nativa, não julgamento automático de conteúdo.
  Capítulo composto exige escolher cena para prova textual.
- literaryFindings.mjs: getFindingContext, save/get/list decisões, list/get
  versões e confirmLiteraryFindingCorrection. Todos registrados em index.
- Serviço frontend literaryFindingService.ts com contratos e wrappers de
  recuperação, ainda sem componente.
- Correção importante no wire: target é SEMPRE escopo do livro;
  correctionTarget é destino da alteração. O modelo frontend usa targetResource
  e converte para correctionTarget no serviço. Não voltar a duplicar target.

### Decisões

- Identidade do achado = digest({jobId,requestId,index}); findingIndex0..39
  validado no resultado real, com header/state/ownership/fence/manifestos e
  fontes autorizados ANTES de ler corpo da análise.
- Ações investigate/correct/retain/defer com justificativa obrigatória.
  correct exige destino, capturado com baseline identity/version/hash.
- CAS, recibo imutável literaryOperations, histórico append-only por revisão.
  Recibos não contêm quotes ou manuscrito. Decisão guarda só own rationale,
  destino/versão, severity e fingerprint do achado, nunca copia o diagnóstico.
- Reter (retain) é escolha explícita do autor, não correção. Mantém raw blocking
  intacto; job.dismissedBlocking e summary retainedBlocking/unresolvedBlocking
  contam decisões vigentes. Aceite usa unresolvedBlocking, não apaga achados.
- Save de decisão revoga authorAccepted do job; mudar decisão de retain para
  investigate reabre impedimento. Replay de recibo não reaplica delta.
- findingDecisionEpoch no job + boundEpoch no registro: recheck reinicia
  dismissedBlocking0 e incrementa epoch, mesmo se fence não mudou. Exige
  renovar retenções específicas; replay de nonce antigo não as renova.

### Confirmação de alteração

- Só para decisão correct já salva, mesma identidade, conteúdo/hash diferente
  do baseline. Nota sozinha, texto igual ou ID recriado são recusados.
- Exige integração SUCESSORA done/current do MESMO level/actId, unidades/
  análises verificadas e finalRequestId, com prova de leitura do destino.
  Não exige aceite da sucessora: a confirmação é de um achado e não aprova
  outros impedimentos que a nova análise possa manter.
- Para texto, cria/reutiliza versão nativa via createWorkVersion, op estável
  por sourceToken/decisão, depois verifica recurso/hash e checkpoint/CAS.
  Não modifica manuscrito nem debita créditos.
- Guia/planejamento exigem revisão imutável correspondente em
  literaryContractVersions/PlanVersions, também conferida no getter.
- Outras fontes comprovam revisão nativa alterada; proofKind reference explicita
  que isso não é inspeção automática de todos os campos nem qualidade literária.
- Grava correctionConfirmed como atestado AUTORAL com note e evidências,
  conserva revisão anterior e não limpa os achados da sucessora.
  Job original fica stale/authorAccepted false.
- Consulta separa confirmationCurrent de histórico. Reconfere fonte, sucessora
  e versão nativa/editorial; excluir versão retira atualidade da confirmação.
- get/list de decisões permitem ler own authored notes mesmo após manuscrito
  mudar. Rótulo de fonte não autorizada é ocultado. Versões históricas não
  recebem efetividade; baseline.label histórico é redigido para null.

### Vínculos de cobertura

- IntegrationUnitLinks por digest({jobId,kind,id}) criado ao enumerar unidade.
- IntegrationSourceLinks por digest({jobId,kind,id,scopeId}) criado ao confirmar
  análise com manifesto: contrato/revisão, plano/revisão, refs purpose source/
  versionToken. Subject não é certificado como conteúdo lido.
- ScopeId normalizado para book ou universo atual, inclusive referências
  antigas com scopeId null.
- Recheck recompõe esses vínculos de registros anteriores só depois da
  verificação da unidade/análise. Não é preciso regenerar para ganhar índice.
- Links confirmam que a sucessora incluiu a fonte, sem aceitar corpo DTO/
  sinopse/stub como manuscrito.

### Persistência

- literaryFindingDecisions, literaryFindingDecisionVersions,
  literaryIntegrationUnitLinks, literaryIntegrationSourceLinks: deny SDK e
  incluídos no cleanup completo do livro.
- Índices de decisões por source.jobId/**name**, versões por id/revision desc.
- Rationale e correction.note excluídos da indexação automática.
- getLiteraryOperation e journal/recovery aceitam kind finding, apontando para
  versão da decisão. Contexto frontend só persiste IDs/hash no journal.
- Summary de integração e botão de aceite da UI já usam unresolvedBlocking;
  legenda distingue retain do diagnóstico bruto. Mas criação/edição/confirm da
  decisão ainda carece de UI.

### Testes ESCRITOS, NÃO executados

- literaryFindings.test.mjs: retain/undo/CAS/receipt/versões; recheck da mesma
  fence reabre retenções; nota/texto igual não provam correção; texto alterado+
  sucessora preserva versão nativa e confirma sem crédito, replay idempotente,
  exclusão de versão retira atualidade; alteração editorial exige versão
  preservada lida; ownership/frescor/escopo conferidos.
- Nenhuma suíte rodou. Os testes podem exigir fixtures/ajustes no gate final.

### Próximo trabalho concreto

1. Criar e conectar UI de decisões:
   - Para cada finding, abrir editor de decisão (action/rationale/target).
   - Manter editores visitados montados/ocultos, inclusive ao navegar entre
     análises e jobs, para preservar drafts. Pending/dirty no guard agregado.
   - Listar decisões do job mesmo stale, abrindo own notes/confirmations sem
     recuperar corpo revogado da análise.
   - Seletores de destinos: getFindingContext dá fontes diretas/fichas/guia;
     outras opções podem usar APIs públicas listLiteraryReferences/listPlans.
   - Confirmação escolhe sucessora do mesmo escopo, note autoral, preserva via
     backend; não pedir IDs técnicos de versões ao usuário.
   - Resultado incerto mantém mesmo payload/opId em RAM e journal metadata;
     CAS posterior requer comparar, sem sobrescrever draft.
   - Histórico de decisões consultável por revisão.
   - Wrapper por actor/book/decisão para apagar RAM privada ao trocar conta.
2. Completar mapa de impacto (o fluxo atual só tem um destino da decisão e a
   primeira divergência da recheck; NÃO representa impacto global completo).
3. Progresso por etapa/artefato atual, comprovação de capítulos revisados antes
   de declarar ato/livro pronto para publicação.
4. Publicação versionada/manifesta, catálogo sem spoilers por volume e pacote
   editorial privado/restore em cópia nova.
5. E4 colaboração/reconciliação do capítulo e fechamento E1/E2/E3 completos.
6. Gate final apenas após implementação integral: testes/validate/regras/browser,
   correções/revisão/docs/ADRs/AGENTS/entregas. Sem merge/push/deploy implícitos.

## Continuação — interface de decisões de achados conectada

Testes continuam apenas ESCRITOS. NENHUM teste/validate/format/lint/typecheck/
build/Rules/browser executado. Sem commit/push/merge/deploy.
Objetivo integral ainda ativo. Esta seção substitui a pendência de UI da seção
anterior: agora há componente conectado, mas ainda sem validação.

### Componente

- Novo LiteraryFindingDecisionPanel.tsx, com sessão por actor/book/trackingKey
  para limpar RAM privada ao trocar conta.
- Ações investigar/planejar correção/manter por decisão autoral/adiar,
  justificativa, destino canônico, consulta de outros destinos via APIs públicas
  listLiteraryReferences/listLiteraryPlans e guia editorial.
- targetKey usa tupla kind/scopeId/id, não ordem de chaves do mapa Firestore.
- Contexto inicial carrega getFindingContext apenas ao abrir um achado.
  Registro histórico abre por decisionId sem pedir corpo da análise revogada.
- Rótulos distinguem retain, planned e correctionConfirmed, com
  effectiveRetention/confirmationCurrent e originalSourceCurrent.
- Confirmação escolhe integração sucessora do mesmo escopo e nota autoral.
  Não exige digitar IDs de versões: backend preserva versão nativa.
  Prova atual já confirmada não é repetida sem alteração do rascunho.
- Resultado incerto preserva MESMO payload/opId em RAM; journal existente
  armazena só IDs/hash. Campos/fechamento ficam bloqueados até recuperar.
- Consulta de revisão posterior abre comparação, sem substituir rationale
  local. Adotar revisão descarta rascunho só por ação explícita.
- Depois do recibo, avisa revisão confirmada e atualiza checkpoint pai antes
  da consulta complementar; falha nessa consulta não reclassifica gravação.
- Histórico de decisões paginado, versões próprias consultáveis sem herdar
  efetividade. Confirmação histórica não anuncia fonte atual.
- Rascunhos de decisão e de confirmação têm descarte explícito. Prosa não é
  editada por este componente.

### Conexão à integração

- Botão Tratar este achado em cada finding.
- Consultar decisões e correções acessível mesmo quando job stale; mostra
  own authored records, sem recuperar diagnóstico derivado não autorizado.
- Editores visitados ficam montados em uma área própria de decisões abertas,
  ocultos ao alternar. Trocar relatório/job não apaga drafts.
- Abertura por source ou decisionId deduplica pelo mesmo job/request/index.
  Lista do job muda ao abrir/registrar outra integração; editores persistem.
- Dirty/pending de todos os editores entram no guard agregado. Operações de
  integração/recheck ficam bloqueadas em voo conforme os guards.
- Fechar editor sujo tem rótulo explícito Descartar rascunho e fechar decisão.
- IntegrationPanel também ganhou wrapper actor/book para descartar relatórios,
  listagens e drafts privados quando muda a conta/livro.
- Serviço de decisões exportado pela interface pública da feature.

### Testes ESCRITOS, NÃO executados

- LiteraryFindingDecisionPanel.test.tsx:
  retain explícito separado de correção; payload idêntico após resposta incerta
  e fechamento bloqueado; revisão posterior não sobrescreve rationale; correção
  por sucessora sem solicitar ID técnico; RAM privada some ao trocar conta.
- LiteraryIntegrationPanel.test.tsx:
  navega entre análises/decisões, volta ao primeiro draft intacto, sem
  gravação implícita nem recarga de contexto ao alternar.
- Nenhuma comprovação browser/temas/mobile ainda. Não declarar UI validada.

### Próximo trabalho prioritário do objetivo

1. Mapa completo de impacto e reconferência de dependências. Atualmente há
   destino único da decisão, SourceLinks/UnitLinks e primeira divergência da
   recheck, não uma auditoria global completa do impacto.
2. Progresso por etapa/artefato atual; diferenciar capítulos revisados/
   preservados de simples cobertura de integração.
3. Publicação por versões específicas com manifesto confirmado; separar
   bíblia privada e catálogo público com spoilers/progresso por volume.
4. Pacote editorial privado e restore em nova cópia, incluindo decisões/
   planejamentos/versões/vínculos/checkpoints sem credenciais.
5. E4 colaboração e reconciliação/reuso do capítulo e fechamento E1/E2/E3.
6. Quando implementação integral estiver pronta para integração, só então
   executar testes/validate/regras/browser, corrigir/revisar e fechar docs/
   ADRs/AGENTS/entregas. Nenhum merge/push/deploy implícito.

## Continuação — motor interno do mapa de impacto

Objetivo integral continua ativo. NÃO executar testes/validate/format/lint/
typecheck/build/Rules/browser ainda. Sem commit/push/merge/deploy.

### Implementado neste incremento (SEM validação)

- functions/src/literaryImpactProtocol.mjs + .d.mts:
  locators fechados por kind/scopeKind/scopeId/id; chaves-tupla; arcMilestone
  virtual inclui arcId/id nativos validados; originToken separado de
  identityToken/versionToken/revision; relações source/composition/subject/
  narrative/target/preserves.
- advanceLiteraryImpactVisit processa até 64 links puros, sem truncar; mantém
  origem, efeito e testemunhas distintas. Associação permanece incerta nos
  descendentes, preservação pede conferência de relevância histórica.
  visitKey não inclui depth, permitindo deduplicação finita de ciclos.
- literaryImpactCoverage exige cada inventário esperado, scanComplete,
  verified, zero unavailable/unsupported e fences iguais; sempre retorna
  semanticCompleteness/authorAccepted/publicationReady false.
- literaryImpactLinks.mjs:
  adaptação de composição ativa (parentActive precisa vir de conferência
  autoritativa do pai em modo cenas), planos source/subject, manifestos,
  gate, jobs capítulo, SourceLinks/UnitLinks de integração, decisões com
  baseline/sucessora, sceneLoreLinks e narrativeLinks bidirecionais como
  associação. Self-reference nativa é ignorada por não adicionar dependência.
  Manifest resource é sujeito da operação, NÃO prova de prosa consumida.
  UnitLink da integração é dependência registrada, NÃO prova de leitura feita.
- literaryImpactGraph.mjs: motor INTERNO, SEM callable/export em index/UI.
  createLiteraryImpactGraphStore exige readFence(tx,c,job), sem default.
  initialize/append/seal/advance/finish/cancel são chamadas dentro de tx.
  Jobs têm bookIds (até64), universeId, sourceFence, inventários e seeds (até16).
  Associações locais só dentro dos livros autorizados e universo selecionado;
  auth de cada livro/universo é reconferida durante cada passo.
  initialize cria nós/visitas-semente e marcador hasLiteraryResources.
  append deduplica nós/links, até32 por página, recusado após seal.
  seal exige censo completo. advance percorre adjacency32, mantém activeVisitId/
  cursor, deduplica visitas por fonte/unidade/efeito e testemunhas por origem/
  aresta. Não executa IA nem altera manuscrito/saldo.
  travessia termina em traversed, NÃO done. finish exige segundo censo completo.
  Fence divergente -> stale; cancel impede passos tardios.
  Query fromKey/sourceKey usa digest64; chaves-tupla extensas ficam sem índices.
- Coleções literaryImpactJobs/Nodes/Links/Visits/Witnesses: Rules false,
  exclusão por sceneJobs, índices jobId/fromKey/name e jobId/state/name,
  map/key fields extensos sem índice.
- AGENTS/architecture/literary-production atualizados com a fronteira privada.

### Testes ESCRITOS, NÃO executados

- literaryImpactProtocol.test.mjs: escopos/homônimos; transitividade; associação
  incerta; histórico; ciclos; testemunhas; identidade capturada; páginas;
  inventário incompleto, não suportado, fonte indisponível e concorrência.
- literaryImpactLinks.test.mjs: composição ativa; planos; manifestos; escopos;
  lore nativo; SourceLinks/UnitLinks; marcos por arco; jobs; decisões/sucessora;
  origem nativa capturada (não combinar apenas ID e revision).
- literaryImpactGraph.test.mjs: censo antes/depois; replay append; ciclos;
  página33/reconstrução do serviço; fence alterado; cancel; auth crossvolume/
  universe; escopo; identidade de job; hashes de consulta de tamanho fixo.
  StudioDb exige leituras antes de escritas e queries limitadas, mas esses
  cenários ainda NÃO foram rodados.
- tests/firestore/literaryImpact.rules.test.mjs: dono/outro/anônimo não leem,
  listam, criam, alteram nem removem metadata privada, inclusive pai publicado.

### Próximo passo: terminar o mapa (NÃO declarar mapa pronto)

1. Implementar produtor paginado de TODOS os inventários e resolução atual
   de identidade nativa antes de emitir links/labels. O motor interno não
   autoriza metadados por si só e não pode receber links/census do navegador.
2. Definir readFence completo de fontes + TOPOLOGIA. O fence de integração
   sozinho é insuficiente: novos jobs/manifestos/decisões podem nascer sem
   alterar updatedAt/sceneRevision/literaryContextRevision.
   Candidato: literaryDependencyRevision exclusivamente relacional; bump
   atômico em TODOS os produtores/mutadores de vínculos incluídos e limpeza/
   exclusão pertinente, protegido nas Rules, FORA de writing/integrationFence.
   Reavaliar custo antes de escolher. Sem cobertura completa não expor um
   certificado global com base só em dois scans ou timestamps.
3. Jobs devem congelar fonte/incarnação e manifesto de escopos; censo esperado
   deve ser gerado pelo servidor a partir do registro completo de inventários,
   não escolhido pelo cliente. Não omitir outro volume/universo silenciosamente.
4. Adicionar serviço/callables, recibos/recuperação metadata, índices necessários,
   consultas privadas reautorizadas de impactos/evidências e UI com dirty/pending.
5. Depois: progresso por artefato/versão revisada; publicação versionada com
   manifesto e spoilers por volume; portabilidade editorial privada; E4
   colaboração/reconciliação/reuso; fechamento integral E1/E2/E3.
6. Somente quando implementação integral pronta para integração: testes/
   validate/regras/browser, correções/revisão/docs/ADRs/AGENTS/entregas.

### Contexto de ferramentas

Worktree/branch continuam C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria, base 8b02f22 de codex/writer-v2. Escritas exigem
exec_command require_escalated. Um comando longo excedeu Windows os206 e foi
reemitido por arquivo, com sucesso. Nenhuma validação executada.
Grafo MCP existente não tem literary nodes (busca retornou0); indexação desta
worktree já foi rejeitada pelo auto-review em turno anterior. Usar fallback
local para esses módulos, sem reenviar source nem contornar a rejeição.

## Continuação — clock relacional e coleta inicial de inventários

Estado: implementação integral permanece ativa, SEM qualquer execução de teste,
validate, lint, format, typecheck, build, Rules ou browser. Sem commit/push/
merge/deploy. Alterações somente na worktree de produção literária.

### Mudanças de código

- NOVO literaryDependencyClock.mjs:
  prepareLiteraryDependencyWrite(tx,c) lê/autoriza livro, valida contador,
  devolve revision/commit idempotente do handle; grava
  literaryDependencyRevision e hasLiteraryResources, sem updatedAt.
  Prepare é chamado DENTRO de cada tentativa e antes das escritas.
  NÃO há WeakMap/cache por tx: Firestore pode reutilizar o mesmo objeto nas
  tentativas e cache impediria nova gravação após abort/retry.
  Dois prepares antes das escritas leem a mesma revisão e gravam o mesmo
  avanço por transação. Mesmo handle commit repetido não duplica.
  prepareLiteraryDependencyCleanup autoriza origem por metadata da raiz,
  incrementa pai vivo e não recria raiz ausente/deleting.
- Instrumentação atômica:
  literaryAI start; literaryProse start; literaryReview start;
  literaryDrafting start; literaryAutocomplete prepare + cleanup;
  literaryFindings save + confirm correction;
  literaryIntegration start, UnitLinks durante plano de unidades, Request
  creation e SourceLinks durante resultado;
  literaryIntegrationRecheck reconstrução UnitLinks/SourceLinks.
  Replay que encontra artefato/recibo antes do caminho novo não incrementa.
  Planos/contrato/gates/milestones já usam clocks semânticos/literary/history
  capturados no novo fence. Auditar todos os writers no fechamento.
- Rules: dependencyRevision inicial deve ser0; update SDK preserva o campo.
  Toda atualização SDK de capítulo agora exige bookStructureClockAdvanced.
  Clientes atuais bookService/chapterOrganization já gravam updatedAt da raiz
  nas transações; compatibilidade ainda NÃO foi validada. Nenhum deploy.
- NOVO literaryImpactFence.mjs:
  readLiteraryImpactFence(tx,c,{bookIds}), até64 volumes, sem duplicatas.
  Reautoriza cada raiz e cada universo distinto ligado aos volumes.
  Token inclui UID, births, updatedAt, scene/narrative/literary/context/
  dependency/localLore/lore/history revisions e stamps nativos dos universos.
  Não inclui updateTime do livro (adoption marker do próprio mapa não deve
  stalar o processo). Book/world recriado muda token.
  Essa leitura ainda NÃO certifica todos os produtores: chats e origens de
  persona estão pendentes. Não ligar ao finish com censo incompleto.
- literaryImpactGraph:
  universoIds derivados dos universos de TODOS os livros selecionados,
  guardados em universeIds, além de universeId de seleção principal.
  scoped/load/init autorizam todos os universos, sem reduzir série a um só.
  Leitura de arrays antigas mantém fallback interno de universeId.
- NOVO literaryImpactInventory.mjs:
  registry SUPORTADO de16 coleções (não é o registro integral do projeto):
  acts,chapters,scenes,literaryPlans,sceneLoreLinks,narrativeLinks,
  literaryPreparationGates,literaryDraftJobs,literaryReviewJobs,
  literaryMilestones,literaryProseRequests,literaryAutocompleteRequests,
  literaryIntegrationJobs,literaryIntegrationUnitLinks,
  literaryIntegrationSourceLinks,literaryFindingDecisions.
  readLiteraryImpactBookInventoryPage(tx,c,{bookId,collection,afterId})
  autoriza livro atual e fonte; query .select de metadata fechada, limit1,
  cursor por ID. Não é callable.
  Cena só compõe capítulo se pai real for ativo/modo scenes; capítulos e
  cenas de outra autoria/livro são recusados.
  Retorna recordToken com births/stamps/metadata para reconferência.
  Vínculos candidatos incluem manifesto, prosa fonte/anterior, jobs e
  decisões. Cada item tem sourceIdentitiesVerified:false. Persona/token
  presente sinaliza persona-origin-not-inventoried. Fonte com metadata
  incompatível/escopo global antigo produz issue explícita, sem rebind.
  Não lê texto, título privado, relatório, rationale, prompt ou selection de
  persona. Persona projeta apenas identityToken/versionToken.
  collectionComplete só true na página vazia terminal e wholeProject false.
  Até64 links por record; orquestrador deverá append em chunks32.

### Cenários de teste escritos (NÃO executados)

- literaryDependencyClock.test.mjs:
  isolamento de clocks/prosa/saldo; prepares/commits repetidos;
  tx object reutilizado entre retries; auth/contador inválido/overflow;
  limpeza viva/deleting/órfã; start/replay de integração não invalida próprio
  sourceFence e incrementa revisão relacional só na criação.
- literaryImpactFence.test.mjs:
  metadata de topologia invalida impacto sem stalar integração; dois volumes
  em dois universos, autorização de todos, nascimento e clocks nativos,
  adoption marker neutro.
- literaryImpactInventory.test.mjs:
  paginação metadata sem corpo, composição ativa, origem capturada,
  escopo global antigo não rebind, persona inline não lida, autoria,
  coleção não registrada e identidade recriada.
- literaryImpactGraph.test.mjs ganhou universo distinto por volume.
- literaryImpact.rules.test.mjs ganhou proteção do contador e avanço da
  raiz nas alterações SDK de capítulos, com controles positivos escritos.

### Próxima implementação obrigatória

1. Completar inventário de literaryGenerations, chats (legado em
   users/{uid}/chapterChats/{bookId}/chapters/{chapterId}/conversations/
   {conversationId}/messages e nativo em editorChatContexts/closureManifest),
   origens de personas, publicação e identidades de fontes.
   Não assumir parent docs de chat existentes: subcoleções podem ter pais
   ausentes. Pode ser necessário índice nativo de dependências + backfill
   limitado/reautorizado antes de declarar a coleta completa.
2. Marcar criação, fechamento, expiração/limpeza e mudança de vínculos desses
   produtores com clock transacional; não enviar chaves/prosa ao índice.
3. Gerar registro esperado COMPLETO de inventários no servidor. A lista
   LITERARY_IMPACT_BOOK_INVENTORIES é somente dos adaptadores já suportados.
   SourceIdentitiesVerified:false NÃO pode virar census.verified true.
   Resolver por grant/encarnação capturada, antes de labels/derivados;
   metadados de referência/locators não concedem acesso.
4. Orquestrar coleta + graphStore + verificação + fechamento, com censo
   paginado/cancel/recibos e ponteiros recuperáveis; revisar limites512
   inventários/100k header do protótipo para séries grandes, sem omissão.
5. UI privada de impactos/evidências/decisões e guard dirty/pending.
6. Depois: progresso por versões revisadas/artefatos; publicação versionada
   com manifesto, catálogo sem spoiler por volume; pacote editorial privado
   e restore nova cópia; E4 colaboração/reconciliação; fechar E1/E2/E3.
7. Somente após implementação integral pronta para integração: executar gates
   adiados, corrigir/revisar/docs/ADRs/AGENTS/entregas. Sem merge/push/deploy.

A busca MCP do módulo literário retornou0 em turno anterior e a indexação desta
worktree já foi recusada pelo auto-review; fallback local continua justificado.

## Continuação — gerações e conferência das identidades de fontes

Objetivo integral ainda ativo. NENHUM teste/validate/lint/format/typecheck/build/
Rules/browser executado. Sem commit/push/merge/deploy. Trabalho somente na
worktree codex/producao-literaria, base 8b02f22 de codex/writer-v2.

### Implementação deste incremento

1. NOVO literaryGenerationDependencies.mjs:
   - normalize/capture metadata dependencies v1: bookBirth, contractRevision,
     plans(id/identityToken/revision), references(reference/identityToken/
     versionToken/bodyToken). Sem labels/docs/prosa/nota/provider secrets.
   - Schema fechado, hash64, orçamento8/24, timestamp real e duplicatas
     rejeitados. Legado sem identidade não é auto-upgraded de ID/revision.
   - dependencies sem índices em firestore.indexes.json.
2. literaryAIContext:
   - Cada plano de apoio agora tem identidade writing-plan-v1 ligada ao
     bookToken e createTime nativo do plano, além de revision.
   - Referências do proof guardam identityToken/versionToken, com unidades
     subject usando identidade como versão; scopeId fica canônico.
   - literaryAI.start grava dependencies sanitizado na MESMA criação do job,
     já coberta por literaryDependencyRevision.
   - Jobs anteriores podem ficar stale quando sua prova antiga não sustenta
     a composição atual. Não apagar nem reescrever jobs antigos.
3. literaryReferences:
   - Referências não locais agora usam readWorkMetadata com máscaras
     ownerId/bookId/deleting/deleted/archived/revision/updatedAt e name/title
     só quando labels=true. World só authorId/deleting; book só birth.
   - C1 do lore LOCAL continua o reader nativo: pode ler documento inline
     limitado para validar origem, sem payload chunks. Não afirmar que
     nunca toca campos inline internamente.
   - mergeLiteraryReferences compartilhado por geração E writing context:
     normaliza scope nulo (book/current universe), dedup por espécie/escopo/
     ID/purpose, ordena deterministicamente e REJEITA concessão/revisão
     conflitante antes de uma Map insertion ocultá-la.
     Subject tolera revisão diferente do texto, nunca origem diferente.
4. literaryImpactProtocol/.d.mts:
   - capture.scheme opcional na entrada antiga; normaliza para unknown.
   - reference,writing-plan,editorial-revision,history-source,content-hash,
     finding-target. Esquema entra na identidade da aresta/testemunha.
     Hashes de domínios diferentes não são intercambiáveis.
5. literaryImpactLinks:
   - Capturas de manifesto/plano/matriz/finding têm scheme explícito;
     factory aceita bookToken para contrato/reverse association.
   - Novo adapter generation(dependencies), sem snapshot/body/rótulo.
   - integrationSource preserva scheme/originToken/identityToken/version.
   - SourceLinks criados em integração e reconstruídos por recheck agora
     preservam prova writing-plan, editorial-revision ou reference nativa.
6. literaryImpactInventory:
   - 17 coleções suportadas (acrescentou literaryGenerations).
   - Geração projeta APENAS dependencies/state, não snapshot/request/result.
     Falta de metadata antiga -> generation-dependencies-not-recorded;
     bookBirth divergente -> generation-book-origin-changed.
     Schema inválido da geração vira issue, sem abortar origens independentes.
   - SourceLinks projeta formato/tokens. Prosa projeta originToken nativo
     da cena e da cena anterior, classificados history-source; autocomplete
     hash do texto classificado content-hash (ainda não verificado).
   - Consulta pontual recordId por where('**name**','==',id), limit1, mesma
     projeção; não pode combinar cursor. collectionComplete sempre false
     na consulta pontual, inclusive registro ausente.
7. NOVO literaryImpactVerification.mjs:
   - createLiteraryImpactSourceVerifier(tx,c,{bookId}); somente uso interno
     com link reconstruído de registro próprio e conferido na mesma tx.
   - reference compara concessão capturada, identidade nativa e versão,
     respeitando subject. writing-plan confere birth + revision; contrato
     usa bookToken + controle atual. Plan revision sem identidade não basta.
   - sourceIdentityVerified só quando origem disponível e identidade provada.
     status current/changed/recreated/origin-mismatch/unavailable/unverified.
     Formatos history/content/finding e desconhecidos continuam unverified.
   - Não autoriza corpo derivado antigo nem lê manuscrito para conferir token.
8. NOVO literaryImpactRecordVerification.mjs:
   - verifyLiteraryImpactInventoryLink recebe recordToken e linkId hash64.
     Reconsulta registro nativo pelo registry fechado, reconstrói aresta,
     exige o mesmo recordToken e hash da aresta ANTES de conferir a fonte.
     Não recebe captura livre do cliente. Record/link alterado não é aprovado.
   - Item continua sourceIdentitiesVerified:false no inventário até agregar
     as conferências de todos os links. Não transformar só uma aresta atual
     em census.verified de todo o registro/projeto.

### Testes ESCRITOS, NÃO executados

- literaryGenerationDependencies.test: allowlist/sem títulos-prosa-segredos,
  cópia independente, timestamp, duplicata, budget, legado sem identidade.
- literaryReferences.test: aliases determinísticos, conflito em qualquer
  ordem, subject/intenção e projeções sem prosa/descrições globais.
- literaryImpactVerification.test: atual/alterado/recriado, subject estável
  após texto mudar, acesso global revogado, plan birth e formatos distintos.
- literaryImpactRecordVerification.test: reconstrução nativa, recordToken/
  linkId divergentes, registro removido, ponto não encerra coleção.
- literaryImpactInventory.test ganhou gerações sanitizadas/legadas e
  encarnação de livro divergente sem abrir rótulos antigos.
- literaryAI.test ganhou source plan recriado com mesmoID/revision -> stale
  e dependencies sem título privado.
- literaryImpactProtocol.test ganhou hash igual em formatos diferentes.

### Próximos passos para terminar impacto (não declarar concluído)

1. Verificadores específicos history-source (cena nativa + body header/hash e
   token originToken existente), content-hash de capítulo e finding-target,
   associações/composição sem prova capturada. Não comparar seus hashes
   com reference/versionToken, nem conceder acesso por ID/revision.
2. Completar origens de personas e indexação/vida dos chats legado/nativo,
   com relógio de relações em create/closure/expire/cleanup e backfill
   limitado/atual autorizado. Chats podem ter subcoleções sem parent doc.
3. Registro COMPLETO esperado de inventários gerado no servidor; não usar
   só os17 adapters suportados para declarar wholeProject/census completo.
   Reavaliar expected<=512 e header<=100k para séries grandes sem omitir.
4. Orquestrar coleta/graphStore/verificações/recheck/finish, recibos metadata,
   cancel/recovery e UI privada com evidências e dirty/pending.
5. Depois completar progresso por artefatos/versões revistas, publicação
   versionada/manifesta e spoilers por volume, pacote editorial privado e
   restore nova cópia, E4 colaboração/reconciliação e fechamento E1/E2/E3.
6. Só com implementação integral pronta para integrar: executar gates adiados,
   corrigir/revisar/docs/ADRs/AGENTS/entregas. Sem merge/push/deploy implícitos.

MCP da worktree literária permanece sem nós e a indexação já foi recusada em
turno anterior por auto-review. Fallback local continua justificado.

## Continuação — fontes de texto, agrupadores e destinos editoriais

Objetivo integral ATIVO, não marcar completo. NENHUM teste/validate/lint/format/
typecheck/build/Rules/browser executado. Sem commit/push/merge/deploy.

### Novas mudanças

1. NOVO functions/src/literarySourceOrigins.mjs:
   - literaryNativeBirth valida exists e timestamps precisos.
   - literaryProseOriginToken preserva EXATAMENTE a fórmula anterior de
     origem (uid/target/book birth/chapter id+birth/scene id+birth).
   - literaryFindingEditorialIdentity preserva fórmula de finding-target.
   - literaryAutocompleteChapterIdentity novo domínio com births livro/
     capítulo e ID. Nenhum texto/configuração/chave nesses tokens.
   - literaryProse.origin e literaryFindingTargets reutilizam as fórmulas,
     sem alterar os domínios originais.
2. literaryAutocomplete:
   - Header passa a guardar chapterIdentityToken no prepare (antes dos
     writes; clock relacional já existente cobre a criação).
   - authorized lê a encarnação nativa atual antes de manifesto/persona.
     Missing token -> failed-precondition (view stale, pedir captura nova).
     Recriado -> permission-denied (view revoked, sem texto/aplicação).
     Não auto-upgrade pedidos antigos. Expiração continua10min e recibos
     pagos permanecem metadata; replay não reaplica texto nem cobra de novo.
   - Token não é enviado ao cliente, que conserva o contrato de view atual.
3. NOVO literaryImpactTextVerification.mjs (interno, nunca callable):
   - history-source/cena: auth livro/cena/pai ativo em modo scenes; confere
     originToken da prosa; body/current só hash, sem content; hash nativo
     consistente com bodyHash/revision; reconstrói readHistorySource token
     v1 com timestamps reais. Não afirma auditoria de bytes.
   - content-hash/capítulo: exige mesma identityToken de autocomplete ANTES
     de conteúdo. Sem identidade fica unverified. Recriado não carrega
     corpo. Após identidade, opener nativo valida linha REAL, sem inventar
     content:null para contornar shape/C1.
     Inline: hash do texto, manuscriptRead=true/byteIntegrityChecked=true.
     Chunked: manifesto/header nativo, sem chunks, ambos flags=false.
     Em ambos editorialReview/wholeUnitRead=false (sem leitura editorial).
   - prose-assembly: NOVO scheme separado. Lê header próprio de
     literaryProseRequests e metadata de cena/pai; exige originToken e
     assemblyToken capturados; verifica assemblyRevision e updateTime
     nativo do capítulo. Não confunde mesmo texto de cena com contexto de
     capítulo/ordem inalterado.
   - Helpers conferem escopo book antes de source IO. Formatos incompatíveis
     retornam null/unverified, não tentam comparar hashes de outro domínio.
4. NOVO literaryImpactFindingVerification.mjs:
   - Baseline finding-target de refs nativas -> identity/version metadata
     pelo reader nativo, sem manuscrito.
   - Baseline de plan/contract -> birth/identidade primeiro; depois conteúdo
     próprio e hash de versão no formato original. Sem identidade não lê
     corpo. Flags dizem editorial-hash, nunca correção/aceite confirmado.
5. literaryImpactVerification:
   - Liga os dois readers específicos. Protege formatos writing-plan/
     editorial-revision contra campos de hash que ainda não sabe conferir.
   - Reference source também exige revision coerente quando fornecida
     (subject continua tolerando mudança de prosa).
   - Retorna explicitamente editorialReview=false e byteIntegrityChecked.
     Source availability/identity/version/grant continuam separados.
6. literaryImpactInventory:
   - Autocomplete projeta chapterIdentityToken para captura content-hash.
   - Prosa projeta originToken E assemblyToken. Além da cena e anterior,
     emite capítulo->prose com scheme prose-assembly. Sem isso uma mudança
     do agrupador poderia ficar fora dos vínculos diretos da operação.
   - Enum/tipos de capture.scheme incluem prose-assembly.
7. literaryImpactRecordVerification:
   - Quando from é a PRÓPRIA linha nativa congelada (acts/chapters/scenes/
     literaryPlans, mesmo ID/escopo), recordToken matching já prova birth/
     versão da origem: identityEvidence native-record-snapshot.
   - Não prova encarnação histórica do destino nem integridade de bytes/
     leitura editorial. RecordToken divergente continua barrando a conferência.
   - Inventário ainda não promove item.sourceIdentitiesVerified globalmente;
     orquestrador precisa agregar todos os links/pendências.

### Testes ESCRITOS, NÃO executados

- NOVO literaryImpactTextVerification.test.mjs:
  nativeHistory token real vs metadata header; body/version alterados;
  pai recriado; hash inconsistente; inline identidade antes do corpo;
  legado sem identidade; body em chunks com manifesto nativo e sem
  auditoria de bytes; composição alterada independentemente da cena.
  Fixture de chunks usa write.kind/id nativos (text-body/text-chunk).
- NOVO literaryImpactFindingVerification.test.mjs:
  baseline nativo, hash editorial, revisão alterada, identidade recriada,
  ausência de identidade e token de prosa idêntico ao formato anterior.
- literaryAutocomplete.test.mjs ganhou mesmo ID/prosa em capítulo recriado
  (não entrega/não escreve/não cobra) e pedido antigo sem token (stale).
- literaryImpactRecordVerification.test.mjs ganhou source físico nativo por
  snapshot e recordToken divergente após recriação.
- Testes anteriores continuam NÃO executados. Nenhuma evidência de UI,
  build ou funcionamento validado deve ser anunciada.

### Próximo trabalho integral

1. Completar origens de personas e índices/ciclo dos chats legado/nativo
   com literaryDependencyRevision em create/closure/expire/cleanup e
   backfill limitado/reautorizado. Subcoleções podem não ter parent docs.
2. Resolver associações/destinos sem captura e fontes de jobs (draft/review/
   milestone/integration UnitLinks) ainda sem provas completas no índice.
   Ler cabeçalhos já existentes antes de inventar novos formatos. Não
   confundir origem da própria linha com encarnação histórica de todo destino.
3. Gerar registro esperado COMPLETO de inventários no servidor (17 adapters
   suportados não bastam), com censo/itens/verificações paginados, sem
   truncar série em limites512 inventories/100k header do protótipo.
4. Orquestrar coleta, graphStore, verificações, reconferência e fechamento;
   recibos metadata/cancel/recovery e UI privada de impactos/evidências.
5. Progresso por artefato/versão revisada; publicação versionada/manifesta e
   spoilers por volume; pacote editorial privado/restore nova cópia;
   E4 colaboração/reconciliação/reuso e fechamento E1/E2/E3 completos.
6. Só após implementação integral pronta para integração executar gates
   adiados, corrigir/revisar/docs/ADRs/AGENTS/entregas. Sem integração/
   push/deploy implícitos.

Worktree C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria, base 8b02f22. Escritas require_escalated no escopo
autorizado. MCP de literário sem nós e indexação recusada antes; fallback
local continua justificado, sem reenviar código ao serviço.

## Continuação — personas no inventário e clock do catálogo

Objetivo completo continua ATIVO. NÃO executar testes/validate/lint/format/
typecheck/build/Rules/browser ainda. Sem commit/push/merge/deploy.

### Implementado neste incremento, SEM validação

1. literaryPersonaDependencies.mjs (novo):
   - DTO fechado v1 ownerId/target/resource/identityToken/versionToken/
     bindings/profiles. Bindings só book/chapter, configuração nativa com
     IDs e overrides numéricos. Profiles só kind/id/identity/revision/stamp.
   - Exige papéis base/complement coerentes com bindings, recurso de capítulo
     correto e hashes leaves/proof iguais aos tokens compostos originais.
     Sem nome/instructions/traits/descrição nem instrução compilada.
   - capture usa readEditorChatPersona nativo; reader existente e suas
     validações/C1/restore availability continuam a autoridade.
2. editorChatContextRead.mjs:
   - Porta server readEditorChatPersonaProfileMetadata(tx,db,uid,id), que
     reutiliza readProfile(...,false), sem carregar instrução privada.
     Não é callable. Presets/customs/restore grants seguem os mesmos checks.
3. readLiteraryPersona:
   - Acrescenta dependencies como sibling de metadata/instruction.
     metadata v1 original (4 campos) e seus hashes continuam iguais.
   - Prose e autocomplete guardam personaDependencies; Draft.source/Review
     source retornam DTO e seus jobs novos também guardam.
     Clocks semânticos .token/.proof não passaram a incluir DTO novo.
4. Grafo/protocolo:
   - kind personaBinding com ID virtual canônico JSON([book|chapter,id]),
     escopo book; kind persona mantém escopo user. Tipos .d.mts atualizados.
   - Schemes persona-profile/persona-binding.
   - literaryImpactLinks.persona valida owner/target, emite bindings e
     perfis para consumidor, sem confundir com agregado do manuscrito.
     UserUID da factory deve corresponder ao owner do DTO.
   - literaryImpactPersonaVerification.mjs novo:
     perfil -> reader nativo metadata-only + identity/revision/stamp;
     binding -> identity nativa + valor/revision próprio, sem prosa.
     Perfis arquivados/recriados/restore indisponível não reautorizam origem.
     .identity/.version e .sourceAvailable continuam separados.
   - literaryImpactVerification liga schemes; nada vira aceite editorial.
5. Inventory (ainda17 coleções suportadas, NÃO inventário integral):
   - Projeta personaDependencies de Prose/Autocomplete/Draft/Review.
   - Emite metadados desses vínculos; valida resource do DTO contra header.
   - DTO ausente -> persona-origin-not-inventoried.
     Resource divergente -> persona-resource-mismatch.
     Schema/hash inválido -> persona-dependencies-invalid.
   - Mantém outras fontes do registro se falhar apenas a metadata persona.
   - Não projeta selection/instructions dos antigos perfis para recuperar
     provas silenciosamente. Legacy recovery ainda pendente.
6. Catálogo:
   - personaCatalogProtocol.mjs/.d.mts novos: contrato puro browser/server,
     snapshot nulo=>visão rev0; documentos válidos começam1; next lê RAW
     snapshot ou null (não passar visão rev0 como documento persistido).
     Chaves fechadas schemaVersion/revision, inteiros seguros, overflow
     rejeitado. Dados inválidos não são sobrescritos.
   - personaCatalogClock.mjs novo: readPersonaCatalogFence metadata de
     revision/birth/update + digest público de DEFAULT_PERSONAS.
     preparePersonaCatalogWrite dentro de cada tentativa, sem WeakMap/tx
     cache; commit do handle é idempotente. Prepare lê doc completo pequeno
     para não apagar campos inesperados; fence só projeta2 campos.
   - personaService.savePersona SDK lê controle e grava
     users/{uid}/aiPersonaCatalog/current junto do perfil (CAS anterior
     permanece; erro não incrementa contador).
   - Rules: dono lê current; create rev1/update rev+1, schema fechado,
     <=MAX_SAFE_INTEGER, delete false. CRUD aiPersonas exige getAfter
     contador==getBefore+1 na mesma gravação.
   - Native Admin ativações bookRestoreActivationEffects e
     adventureRestoreActivation preparam contador se batch.profileCount>0,
     antes de qualquer write; commit junto do batch ativo.
     Preservam receipts/artefatos existentes. Prepare/cancel de lotes
     preparing não disponibiliza perfis. Guard de cleanup exige preparing.
     Auditar TODOS os writers ativos antes de fechar gate, incluindo conta.
7. Fence:
   - readLiteraryImpactFence inclui catálogo (birth/update/revision/presets).
   - Inclui personaId/personaRevision do livro, mesmo se SDK mantiver
     updatedAt. Capítulo já tem clock da raiz obrigatório nas mutações.
   - Não altera writing/integration semantic fences nem créditos.
   - ImpactGraphStore já aceita user scope do próprio UID. Ainda falta
     registry/orquestrador completo antes de expor certificação.
8. Índices:
   - personaDependencies sem índices em ProseRequests/AutocompleteRequests/
     DraftJobs/ReviewJobs. Counter consulta doc direto, sem novos compostos.

### Testes escritos/atualizados, NÃO executados

- NOVOS literaryPersonaDependencies.test.mjs:
  provas nativas preservadas e sem strings privadas; schema/trait/scope/
  token alterados rejeitados; autocomplete guarda projeção separada.
- NOVO literaryImpactPersonaVerification.test.mjs:
  profile e binding distintos; current/change/archive/recreate; sem
  instrução/nome lido; escrita de prosa não altera vínculo; DTO estrangeiro/
  resource errado; inventário novo e legado.
- NOVO personaCatalogClock.test.mjs:
  closed schema/null vs inválido, overflow, catálogo muda impact fence sem
  mudar integração/saldo, livro binding sem updatedAt, retry mesmo objeto tx.
- literaryImpactProtocol.test ganhou domínio virtual de vínculo book/chapter.
- personaService.test.ts mock distingue profile/catalog e afirma avanço
  atômico, CAS/falha sem incremento.
- tests/firestore/helpers/personaCatalog.mjs novo: set/update perfil com
  contador em tx para os testes de validação/C1.
- personas.rules.test atualizado e cenário de clock ausente/incremento/
  privacidade; clear chapter complement agora avança book clock em batch.
- personaRestoreAvailability.rules, adventurePersonaAvailability.rules e
  bookBackupDraft.rules adaptados nos caminhos SDK de perfil conhecidos.
  Ampliar busca no gate final para outros positivos diretos não adaptados.
- Nenhuma evidência de execução/CI/browser/deploy.

### Próximo trabalho para o objetivo integral

1. Chat legado/nativo: índices/ciclo/closure/expire/cleanup com clock
   relacional; backfill limitado e reautorizado. Subcoleções de chat podem
   não ter parent docs. Aproveitar closureManifest/proofCoverage nativos,
   sem indexar perguntas, respostas ou instruções.
2. Backfill de personaDependencies antigo somente quando a prova nativa
   histórica for reautorizada e identity/version composta casar EXATAMENTE.
   .persona.metadata pode ter selection histórica; projetar IDs/overrides
   conhecidos antes de qualquer conteúdo, nunca abrir snapshot antigo
   para buscar labels. Casos sem prova suficiente permanecem explícitos.
3. Completar fontes de Draft/Review/Milestone/Integration UnitLinks e
   associações/destinos sem captura. A origem da linha não certifica
   encarnação histórica de outro nó.
4. Incluir APLICAÇÕES de IA no grafo: hoje perfil->pedido e cena->pedido
   existem, mas falta pedido aceito->unidade como associação de impacto.
   Ler literaryProseApplications/literaryAutocompleteApplications e receipts
   dos chats; não afirmar que o texto atual ainda é igual ao aplicado.
   Manter replay/clock/ausência de débito extra e evidência histórica clara.
5. Registry COMPLETO de inventários esperado no servidor (17 suportados
   não bastam), censo paginado e limiares512 inventories/100k header
   revistos sem omitir volumes/artefatos.
6. Orquestrar coleta/graph/verificações/recheck/finish, receipts metadata,
   cancel/recovery e UI privada de impactos/evidências com dirty/pending.
7. Progresso por etapa/versões revisadas; publicação versionada/manifesta/
   spoiler por volume; pacote editorial privado + restore nova cópia;
   E4 colaboração/reconciliação/reuso e fechamento E1/E2/E3 completos.
8. Só quando implementação integral pronta para integrar: executar gates
   adiados, corrigir/revisar/docs/ADRs/AGENTS/entregas. Sem push/merge/deploy.

### Atenção de integração

Rules de escrita de persona agora exigem cliente com contador; ativação de
restores também deve estar no servidor atualizado antes de habilitar o mapa.
Fazer rollout coordenado e tratar clientes antigos no gate, sem deploy agora.
Catalog clock global do usuário não é recurso de um livro; não apagá-lo ao
excluir livro nem misturá-lo aos artefatos/resto do pacote privado do projeto.
Novos writers Admin de perfis ATIVOS ou de disponibilidade devem avançá-lo.

Worktree C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria, base8b02f22. Escritas require_escalated autorizadas.
MCP search_graph para create/update/archivePersona retornou0; fallback local
usado nos caminhos descobertos. Indexação desta worktree já recusada antes
por auto-review; não reenviar código nem contornar esse bloqueio.

## Continuação — contextos nativos de chat no inventário

Implementação adicionada nesta continuação, TODA SEM VALIDAÇÃO:

- Novo literaryChatContextIndex.mjs: índice privado books/{id}/
  literaryChatContexts/{digest(uid,contextId)}. Apenas metadados fechados:
  owner/target/resource/contextId/contextToken/sourceToken/closureHash,
  closureManifest e personaDependencies. Não copia source DTO com labels,
  snapshot, seleção, prompt, pergunta, resposta ou instrução privada.
- editorChatContext ready prepara o índice após conferir o fechamento e
  antes de qualquer escrita; commit junto do cabeçalho/corpo/recibo +
  literaryDependencyRevision. Aventuras retornam noop. Fonte book é cena;
  blocks nativos pertencem a aventuras e não são incluídos neste índice.
- Exclusão inicia remoção atômica do índice + clock antes do corpo.
  Limpeza terminal repete conferência para operações de versão anterior.
  contextToken diferente protege nova encarnação; raiz com authorId
  diferente não recebe clock de limpeza de contexto antigo.
- literaryImpactChatContext.mjs: reconstitui candidatos só após confronto
  com native users/{uid}/editorChatContexts/{id}, projeção limitada
  schemaVersion/owner/contextId/summary tokens+scope+phase/sourceToken/
  closureHash+manifest/cleanupId. ready e consumed aceitos; indisponível,
  recriado, alterado, canceled/deleted ou cleanup => issue e zero links.
- Inventário BOOK passa a18 coleções suportadas, incluindo
  literaryChatContexts. CONTINUA INCOMPLETO. Não representa turnos ou todos
  os chats, e não infere ausência de chats por falta de índices.
- Manifestos literários usam adaptador existente; personas usam provas
  nativas capturadas, não leitura dos perfis privados.
- Esquema native-chat-target em protocol/.d.mts: originToken projectToken,
  identityToken resourceToken, versionToken sourceToken, revisionnull.
  Verifier resolve por readEditorChatSource com withContentfalse, metadata
  do corpo somente hash; confere encarnação e versão, não bytes/editoria.
- Lore nativo projetado como localLore/globalLore com captureunknown +
  issue native-chat-lore-verification-required; seus tokens não são
  intercambiáveis com literaryReferences. Deve impedir censo verificado.
- SDK bloqueado em Rules; wildcard field override sem índices; coleção
  no deleteSceneBook. Fonte do índice e própria closure não são grants
  para abrir respostas antigas, mesmo após origem revogada.
- Testes ESCRITOS: literaryChatContextIndex.test.mjs cobre captura/replay,
  inventário sem corpo, verificação de cena, cabeçalho morto/recriado,
  exclusão imediata, cleanup tardio com token diferente, raiz de outro
  autor, aventuras e cena alterada/recriada. Rules test inclui coleção.
  NÃO EXECUTADOS. Nenhum lint/typecheck/build/Rules/browser/validate rodou.

Próximo incremento:

1. Completar lore nativo no verificador por contrato próprio (sem traduzir
   identidades para reference), versões/concessões e universo revogado.
2. Native turn claim está em editorChatGeneration.mjs (~276-420), lido
   parcialmente. Ele obtém readyContext, seleciona history, mergeclosures,
   cria turn/questions/bodies e marca contexto consumed no mesmo commit.
   A closure da resposta inclui histórico transitivo; o índice de contexto
   NÃO substitui isso. Projetar origem da resposta e consumo/saída separadas.
   Não atribuir sourceToken atual a leituras históricas sem versão.
3. Ciclo de conversas/turnos (delete/retry/cancel/complete) deve atualizar
   fence/índice; indexação de contextos atuais não basta para completude.
   Cleanups nativos em editorChatCleanup.mjs são paginados. A exclusão
   de conversa ainda não está conectada a índice literário de turnos.
4. Legacy chapterChat.mjs mantém messages assistant/context.writing +
   historyOrigins, próprio user em separado. Índices, quota e ciclo de vida
   devem preservar privacidade das perguntas e grants dos derivados.
5. Backfill metadataonly, paginado, autorizado e versionado dos registros
   antigos, inclusive pais ausentes com subcoleções; não varrer snapshots
   privados para labels. Falta de prova permanece explícita.
6. Demais pendências integrais de E5/E4/E1/E2/E3 do checkpoint anterior
   continuam: aplicações, registry/fence completos, orquestração/UI,
   progresso, publicação/spoilers/portabilidade e auditoria completa.
7. Só executar gates adiados quando implementação integral estiver pronta
   para integração. Sem commit/push/merge/deploy nesta continuação.

Worktree mantém codex/producao-literaria baseada em8b02f22. MCP graph
consultado para chat; definições nativas encontradas. Novos módulos desta
worktree não estão no índice; indexação já negada anteriormente não foi
repetida. Leituras locais usadas para o estado real. Não houve nova recusa
de aprovação; escritas require_escalated da worktree foram aprovadas.

## Continuação — lore versionado, turnos e histórico nativos

PROGRESSO concreto: implementados novos módulos e hooks; nenhuma validação
executada. Sem commit/push/merge/deploy. Objetivo integral continua ativo.

1. literaryChatLoreDependencies.mjs: DTO fechado sem textos/labels, versões
   com domínio literary-native-chat-lore-version-v1 + reference/scopeToken/
   identity/capturedStamp. Exige um para um com closure.lore; rejeita
   duplicatas/concessões conflitantes, campos privados e hashes forjados.
   ready passa lore ao índice; índices antigos sem campo continuamunknown.
2. readEditorChatLore agora aceita metadataOnly internamente. Novo wrapper
   readEditorChatLoreOrigin devolve leaf+capturedStamp, reutilizando guards
   nativos e metadata masks: global sem name/summary/aliases/details;
   livro mantém bookOriginFields+tombstone/reservation/creationHead. Sem
   chunks, sem snapshots privados ou corpo de resposta. Sem byteaudit.
3. native-chat-lore resolve origem pelo resource do índice book+context/turn,
   readEditorChatSource metadataonly + readEditorChatEnvironment com
   includeLiteraryfalse + readEditorChatLoreOrigin. Compara native identity,
   scope grant e stampversion. Global desvinculado/revogado indisponível.
4. editorChatCatalog.mjs extraído do módulo Conversations, que preserva
   export e chamadas existentes. Fence captura revision/updatedAt e birth/
   updateTime nativos; ausente com conversas presentes/malformado é erro.
   ImpactFence inclui nativeChats, fora de tokenssemânticos/credits.
   Import da extração ainda está em posição intermediária do módulo
   Conversations (ESM válido); organizar imports quando necessário.
5. literaryChatTurnIndex.mjs:
   - book literaryChatTurns/{digest(uid,conversationId,turnId)}
   - claim atômico cria índice + literaryDependencyRevision.
   - SELECT de índice do contexto em metadados; copia contextOrigins
     (closure/hash/sourceToken/persona/lore) sem perguntas/instruções/textos.
   - Contexto antigo sem índice => null explicitamente; enviar continua.
   - selectEditorChatModelHistory devolve novo origins metadata[] dos
     selected turnId/attemptToken/closureHash; a ordem deve igualar turnIds.
   - turn índice guarda closure transitiva normalizada + historyOrigins.
     Nenhum índice do turno depende da sobrevivência do input context.
6. literaryImpactChatContext refatorado com export
   projectLiteraryImpactChatOrigins para reutilizar projeção direta.
   literaryImpactChatTurn confronta cabeçalhos nativos de conversa e turno
   (masks sem títulos/perguntas/proofCoverage.source labels/bodies),
   computa nativeState/nativeRevision na metadata do recordToken e projeta
   diretas + edges native-chat-turn de cada resposta histórica.
   Histórico sem índice ou índice divergente gera issue explícita.
   Consumer é tentativa nativa, não garantia de resposta aplicada/revisão.
7. native-chat-turn verifier reconstitui o origin.turnId pela lista do
   consumer index e sua função deID. Confere conversa open/scope/token +
   native done turn owner/attempt/closure. Nada de turnBodies/questions.
   Não prova integridade do modeloanswer nem editorial quality.
8. Deleting/deleted com cleanup nativo válido = retired, zero links sem
   issue (origens deixam de ser consumidor ativo). Índices removidos na
   fase turns da limpeza nativa, página23 em livros para <=50 writes.
   Native docs e índices removidos no mesmocommit + dependencyclock uma
   vez quando há índices. Aventuras ficam47/noop. Contador deleteddocuments
   inclui sidecars removidos. Não mexe raiz foreign/new token.
9. Rules e wildcardnoindexes para literaryChatTurns; deleteSceneBook
   inclui. Inventários BOOK agora19 SUPORTADOS, NÃO censo integral.
10. Testes ESCRITOS e NÃO EXECUTADOS:
    literaryImpactNativeChatLore.test.mjs: current/edit/recreate/local
    tombstone/globaldetach/ownerdrop/metadata masks/legacymissing/closedDTO.
    literaryChatTurnIndex.test.mjs: claim/metadata/replay/transitivehistory/
    originrecreated/contextdelete/legacyhistory/Byokcompletionfence/
    nativeconversationretire+cleanup bounded actual sidecardcount.
    editorChatCatalog.test.mjs: semantic separation/nativebirth/shape/
    foreign/missing/revision. Rules test inclui coleção.
    Nenhum test/lint/typecheck/build/emulator/browser/npmvalidate rodou.

Próximos trabalhos obrigatórios preservados:

- Auditara cobertura dos NOVOS hooks na árvore real antes de afirmar censo
  integral. Conteúdo de respostas não é prova de manuscrito aplicado.
- Legacy chapterChat origem/historyOrigins/ciclo de vida + relógios/index.
- Backfill metadataonly autorizado, paginado e versionado: contextos e
  turnos anteriores sem índices/provas, pais ausentes com subcoleções;
  não inferir vazio pela ausência do pai. Faltas explícitas até resolver.
- Aplicações de Prose/Autocomplete/Native+Legacy Chat precisam edge origem
  aceita->unidade como associação histórica, recibo/crédito/replay seguros.
- Registry esperado completo (não19 apenas), censo grande sem omitir,
  graphorchestration/receipts/recover/recheck/finish/UI, mapas/impactos.
- Draft/Review/Milestone/IntegrationSource capturaorigem lacunas; personas
  antigas sem prova; progressoversões revisadas; publication/spoilermanifest/
  pacote+restore privado; E4 colaboração/reconciliação/reuso e auditoria
  completa das etapas1/2/3. Só então gates adiados/fixes/review/docs/ADRs/
  AGENTS/entregas. Não reduzir o objetivo a estes incrementos.

MCP graph consultado readEditorChatLore/environment/version; os módulos
novos não estão indexados. Indexação desta worktree já negada anteriormente
e não repetida. Todos os writes desta continuação ficaram na worktree
autorizada C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria baseada em8b02f22, via require_escalated aprovado.

## Continuação — aplicações de Prose/Autocomplete no mapa de impacto

PROGRESSO concreto sem validação. Nenhum test/lint/typecheck/build/Rules/
browser/npmvalidate executado. Sem commit/push/merge/deploy. Goal ativo.

- literaryApplicationIndex.mjs: sidecar BOOK literaryApplications privado,
  ID digest(author,target,kind,operation). Kinds hojeprose/autocomplete
  APENAS, não chats. Identidade nativa genérica inclui bookbirth/nodekind/
  nodeid/native rowbirth. Destino scene/chapter capturado antes da escrita.
- prepareLiteraryApplicationIndex lê cabeçalhos autorizados/recibo projetado/
  rootbirth/destbirth/existência de sidecar e prepara clock antes das escritas.
  Commit atômico junto do native textwriter+credit+receipt; replay nativo
  retorna antes da criação e não repete relógio. Clientes não recebem campo
  extra no recibo. Colisão impede aceite antes de texto/saldo/confirm.
- Ao aplicar, Prose/Auto gravam appliedOutputToken digest(rawacceptedtext)
  no pedido, no mesmo estadoapplied/paid; serve como metadado de versão da
  proposta, NÃO integridade de bytes da saída ou equivalência atual.
- Sidecarclosed schema1 guarda owner/target/kind/op/sourceidentity+version/
  destinationidentity/receiptlocator+token/afterHash/revision/historicaltrue
  e dependencies (chapterId,manifest,persona,assemblyToken,
  chapterIdentityToken,beforeHash,originToken,sourceToken,sourceRevision,
  previousscene3tokens). Sem instruções, textos, titles, prompts ou saldo.
  Normalizador cruza escopo/resource de manifest/persona e domínio nativo.
  Lista duplicada de assemblyToken gerada durante edição já foi corrigida.
- Autocomplete cleanup já remove pedidos applied ao expirar (fluxo nativo
  lido nesta continuação). NÃO mudar retenção para conservar prompts!
  Dependências sobrevivem somente como metadados do aceite. Desaparecido
  o pedido, application-source usa índice atômico + recibo nativo conferido,
  facts sourceRepresentationpreserved-metadata/liveSourceAvailablefalse/
  identityEvidencenative-application-receipt e statuspreserved no adapter.
  Não confundir com source viva nem autorização para abrir conteúdo antigo.
- literaryImpactApplication: receiptmetadata/hash deve corresponder ao
  source/destino/afterhash. Destino indisponível/recriado -> issue + zero
  links, não rebinding automático por ID. Linktarget pedido->unit é
  associação histórica, currentManuscriptEquivalence not-checked.
  Projeta também manifest/persona/leituras nativas preservadas -> pedido.
  Sem manifest/persona legado retorna issues explícitas.
- Source vivo: application-source compara nativebirth de livro/pedido,
  appliedstate/paid e appliedOutputToken. Versão mudada/origem recriada
  distintas. Metadata checks manuscriptRead/wholeUnitRead/editorialReview/
  byteIntegrityChecked false. No fallback se pedido existe recriado.
- literaryImpactTextVerification prose-assembly aceita record
  literaryApplications e lê origem preservada por máscara antes de
  reconstruir tokens nativos; caminho original ProseRequests permanece.
- AbandonAuto aceita criação de recibo canceled com dependencyclock
  atômico, replay sem novo clock. Não cria sidecar de aceite.
- literaryApplications no registry (agora20 BOOK suportados, NÃO completo),
  Rulesfalse, wildcardnoindexes e limpeza do livro. Não publicável.
- Testes ESCRITOS functions/test/literaryApplications.test.mjs:
  aceite Prose/Auto debit1/metadados/replay;
  retenção somente de dependências após pedido desaparecer;
  alteração posterior não vira equivalência atual;
  destino recriado excluído; source recreado e recibo adulterado;
  colisão aborta antes do texto/saldo/recibo; cancelclock uma vez.
  Não executados, inclusive novos testes de Rules.

Próximos trabalhos (não reduzir escopo):

1. Aplicações de nativeChat e legacyChat ainda faltam. native apply em
   editorChatApply.mjs usa readAuthorizedTurn + writeScene/Block +
   nativecatalog + writeEditorChatReceipt atomic. Recibos nativos em
   users/{uid}/editorChatOperations/{operationId}, shape fechado com
   action/requestHash/state/receipt.result. Não adicionar campos aos DTOs
   fechados desses cabeçalhos/recibos; preparar índice privado próprio.
   Para book, resource éscene; blocks pertencem às aventuras.
2. Legacy capítulo chat índice/origins/history/ciclo de vida e fence.
3. Backfill das aplicações anteriores sem sidecars deve reautorizar metadados
   e apontar lacunas reais. Não buscar labels em snapshots revogados.
   Destino/source recriado nunca é inferido como encarnação antiga.
4. Native chat backfill/index ciclo devida cobertura completa e metadata
   de registros antigos, inclusive órfãos/subcoleções sem pai.
5. Todos os próximos da seção anterior: registry/fence/censo completo,
   orquestração/UI/recuperação, progressoversões revisadas/publicação/
   spoilers/pacoteeditorial+restore, E4 colaboração/reconciliação/reuso e
   auditoria integral E1/E2/E3. Só depois executar gates adiados e corrigir/
   revisar/docs/ADRs/AGENTS/entregas. Não declarar feito pelo índice parcial.

Worktree autorizada mantém codex/producao-literaria base8b02f22. MCP graph
consultado para apply suggestion; novos módulos fora do índice. Indexação
já negada antes não repetida. Escritas require_escalated aprovadas, todas
na worktree C:/Users/gaabr/.codex/worktrees/producao-literaria/writer.

## Continuação — aceites de chat nativo no mapa

PROGRESSO concreto, código ainda SEM VALIDAÇÃO. Nenhum test/lint/typecheck/
build/Rules/emulator/browser/npmvalidate executado. Sem commit/push/merge/
deploy. Objetivo integral ativo.

- Novo literaryNativeChatApplication.mjs prepara BOOK
  literaryChatApplications/{digest(uid,target,operationId)}, privado.
  Noop para adventure/block. Estado fechado schema1:
  owner/target/resource/op/requestHash/sourcechatId+nativebirthidentity+
  closureversion/nativeconversationId+token/turnId+attempt/
  destinationIdentity/suggestionHash/afterHash/revision/receiptToken/
  origins/historicaltrue. Sem perguntas, afterHTML, respostas/instruções.
- source nodeID é literaryChatTurnIndexId; identidade usa domínio de
  literaryApplicationIdentity com bookbirth+chatNodeID+native turnbirth.
  Destino scene também inclui bookbirth e nativebirth. Não religar porID.
- Normalizador async fecha shapes e cruza escopos/identidades, verifica
  closures e contextOrigins com persona/lore por protocolos existentes.
  Retém apenas metadata disponível do índice do turno autorizado.
  Turno antigo sem índice pode ser aplicado pelo fluxo nativo; originsnull
  gera lacuna no grafo, não se inferem fontes por labels/nomes.
- editorChatApply importa normalizeEditorChatReceipt, monta receiptResult
  uma única vez antes das escritas; expectedReceipt igual ao emitido por
  writeEditorChatReceipt. Prepareindex antes de writes; commit do índice/
  dependencyclock junto de nativewriter/credit/catalog/receipt. DTOs
  fechados de turn/context/receipt não ganham campos. Replays retornam
  antes; reaplicação opnova cobra conforme regra existente (pode0).
- literaryImpactNativeChatApplication:
  receipt privado em users/{uid}/editorChatOperations/{op};
  consulta masks outer schema/owner/op/action/requestHash/state/receipt.
  settled + confirmed applySuggestion, hash/IDs/contentHash/revisão
  devem bater. Destino ausente/recriado => issue e zero links.
  Linksource chat->scene relationtarget histórico. Projeta directOrigins
  preservadas como source->chat, com recordID diferente do consumerID.
- projectLiteraryImpactChatOrigins recebeu consumerId opcional, defaultid
  preserva paths anteriores. NativeChatVerification aceita a coleção de
  aplicação, valida consumer pelo source.id, resolve lore e history
  por seus protocolos nativos (sem corpos).
- Scheme native-chat-application-source: confere native turno identity/
  owner/conv/attempt/closure em metadata, sem abrir turns/Questions/Bodies.
  Se turno removido, receipt+índice atômico conferidos dão statuspreserved/
  liveSourceAvailablefalse/sourceRepresentationpreserved-metadata/
  identityEvidencenative-application-receipt. derivedBodyAuthorizedfalse
  SEMPRE; equivalência atual not-checked e nenhum byteaudit/editorial.
- Histórico antecedente de origins.historyOrigins preserva tuples/edges,
  mas versões completas dos contextos anteriores ainda NÃO retidas:
  issue native-chat-applied-history-origins-incomplete é intencional.
  Nunca declarar proveniência transitiva completa só por closure nativa,
  que guarda identidades sem todas as versões históricas.
- Rulesfalse, wildcardnoindexes, deleteSceneBook e inventory incluídos.
  Agora21 BOOK inventários suportados, NÃO registry completo.
- Testes ESCRITOS em editorChatApply.test.mjs com fixture nativa existente:
  metadataonly/debit/clock/replay/free explicit reapply; receiptaltered;
  destrecreated; collision antes de texto/saldo/receipt; geração real
  selecionando seedlegacy + contexto direto, aceito, nativeconversation
  cleanup, appmetadata retida + statuspreserved sem bodies; adventure
  block sem índice. Rules test adiciona coleção. NÃO EXECUTADOS.
  Imports novos foram acrescentados no final do arquivo de teste (ESM
  válido); organizar na etapa de qualidade se necessário.

Próximas etapas integrais:

1. Fechar retenção de versões de ancestralidade dos aceites nativos com
   histórico. Sem cadeia ilimitada num doc, sem abrir corpo revogado,
   sem inferir perfil/lore versões pelo estado atual. Índices dos turnos
   são apagados ao excluir conversa; metadados do manuscrito aceito devem
   manter proveniência suficiente ou lacuna explícita até backfill.
2. Legacy chapterChat índices/clock/origins/history e aceites ainda faltam.
   Não copiar perguntas próprias para índices nem usar derived snapshot
   como grant. Serviços nativos privados permanecem fonte de autorização.
3. Backfill autorizado metadataonly/paginado de contextos/turnos/aceites
   antigos, inclusive pais ausentes com subcoleções; sem labels/textos de
   snapshots. Identidade recriada não é origem antiga por ID.
4. Registry/fence/censo integral, orquestração/recibos/recover/recheck/
   finish/UI/impact map, captura de fontes dos demais artefatos;
   progresso/revised versions, publicação/manifests/spoiler porvolume,
   pacoteeditorialprivado+restore nova cópia, E4 colaboração/reconciliação/
   reuso e auditoria completa E1/E2/E3 continuam exigidos.
5. Só no gate final antes da integração executar validações adiadas e
   corrigir/revisar/docs/ADRs/AGENTS/entregas. Não presumir integração,
   push ou deploy. Não reduzir o plano aos índices já implementados.

MCP search_graph consultado createEditorChatApplyService/authorizedTurn.
Módulos novos fora do índice; indexação recusada anteriormente não foi
repetida. Writes require_escalated aprovados ficaram somente na worktree
C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria baseada em8b02f22.

## Continuação — relógio e fronteiras do ciclo legado

PROGRESSO concreto sem executar validações; sem commit/push/merge/deploy.
Goal integral segue ativo. Nenhum test/lint/typecheck/build/Rules/emulator/
browser/npmvalidate rodou.

- Native legacy chapterChat.mjs inspecionado: parent
  users/{uid}/chapterChats/{bookId}/chapters/{chapterId}/conversations/{cid},
  messages filhos. Receipts de aplicação são IRMÃOS das conversas em
  .../chapters/{chapterId}/receipts/{requestId}, sobrevivem ao deleteconvo.
  Apply fica ANTES do dispatcher exigir parentexistente e mantém replay
  confirmado mesmo após deleteconvo. Não quebrar isso no índice futuro.
- Novo literaryLegacyChatLifecycle.mjs prepara relógio:
  workProject owner/deleting + chapter fields(bookId/deleting), depois
  prepareLiteraryDependencyWrite. Cleanupfinal só clock se rootauthoruid e
  não deleting, usando helpercleanup; não modifica rootforeign.
  Sem corpo/prompt/nomes/keys. Marca hasLiteraryResources como demais clocks.
- Hooks em chapterChat: create (no-op existente não ticka), sendclaim,
  capturehistory, finishsucesso/erro/revoked, preferences, applynovo,
  editinício+fim, deleteinício+fim. Todos preparados antes de writes.
  Replayterminal done/stopped e replayreceipts retornam antes. Draft próprio
  é ignorado pelo inventário e não recebe clock.
- Delete: primeiro tx marca deletingtrue/busydeleting + clock. Depois
  recursiveDelete; depois clockcleanup. Callers não entram em parent
  deleting (delete pode retomar se parentaindaexiste). loadfiltra deleting.
  finish retorna null se parentdeleting/ausente; deliverygates tx conferem
  parentexists/notdeleting/busy requestId antes de qualquer chunk.
- finish running também não conclui se perdeu busy para outra ação.
  send/preferences não ignoram busyediting após deadline. Editfim em tx
  confere parentexists/notdeleting/busyediting, prepara clock e clearsbusy.
- Limites NÃO RESOLVIDOS: legacyedit/delete ainda são operações longas
  fora de tx, sem journal/job/recibo próprios. Timeout de edit permite
  outro editor retomar, e ainda falta token/fence de execução para
  impedir conflito entre duas remoções tardias. RecursiveDelete parcial/
  parentausente com filhos exige protocoloretomável/backfill. Não declarar
  garantia integral de concorrência/recovery/censo por estes hooks.
- Nenhum índice de mensagem/aceite legado foi criado nesta continuação.
  Suas origens, historyOrigins e snapshots ainda precisam projeção privada
  metadataonly e C1 por fonte/versão. Não copiar perguntas/labels/textos.
- Fixture antigo chapterChat.test.mjs (custom in-memory) recebeu timestamps
  metadata, select no-op e tx.get de queries, para suportar a ativação do
  contexto canônico após relógio hasLiteraryResources. Não é prova de
  lifecycle real; studioDb/emulator nos gates são obrigatórios.
  Expôs db somente no objeto de fixture para controlar recursiveDelete.
- Testes ESCRITOS: clockcreate/send/history/finish/preferences/edit e
  replay/debit0; deletebloqueado antes de remover bodies, latecompletion
  e novosend recusados inclusiveafteruntil; loadsemconversadeleting;
  guard de busyeditingexpirado; raiz mudaautor dentro tx => semclockwrite.
  Sem execução. Não inferir cobertura por nomes desses cenários.

Próximos passos preservados:

1. Metadados de mensagem legado + encarnação estável por parent/chapter/
   book (IDs de mensagens podem reutilizar após edit), origens canônicas
   e histórico transitivo, source vs subject/partialeditorcapture sem
   alegar leitura nativa inteira de capítulo.
2. Aplicações legadas com receipt persistente no siblingpath acima;
   manuscrito/crédito/índice/recibo atômicos, replay afterdelete semdebito,
   retention metadata sem plaintext. Native acceptedhistory ancestry
   versões completas ainda pendentes da continuação anterior.
3. Recovery edit/delete (token/job/CAS/boundedpages/latefence), backfill
   autorizado incluindo parents ausentes e sidecars antigos. Nunca
   inferir coleção vazia pela ausência de documentos de pais.
4. Registry/fence/censo integral + orquestração/recibos/recuperação/recheck/
   finish/UI/impact map; demais fontes Draft/Review/Milestones etc.
5. Progresso por versões revisadas; publicação/manifests/spoiler porvolume;
   pacoteprivado+restore novacópia; E4 colaboração/reconciliação/reuso e
   auditoria integral E1/E2/E3. Apenas depois gatesadiados/fixes/review/
   docs/ADRs/AGENTS/entregas. Não reduzir objetivo aos incrementos prontos.

MCP graph consultado chapterChat send/apply/conversation. Worktree real é
a autoridade; novos módulos não indexados. Não repetir indexação negada
anteriormente. Escritas require_escalated aprovadas, só na worktree
C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria baseada em8b02f22.

## Continuação — jobs retomáveis para edit/delete legados

PROGRESSO concreto; ainda SEM VALIDAÇÃO. Nenhum test/lint/typecheck/build/
Rules/emulator/browser/npmvalidate rodou. Sem commit/push/merge/deploy.
Objetivo integral permanece ativo.

Implementação:

- legacyChatMutations.mjs: namespace privado user/chapterChats/book/
  chapters/chapter/mutationJobs/{mutationId}, ponteiro
  mutationHeads/{conversationId}. Bloqueados por Rules chapterChats/**.
  Não há perguntas/respostas/draft/keys no journal, só draftHash, comando,
  fingerprint, scopeToken (book/chapter nativebirth), conversationToken
  (parentbirth), token de execução, state/count/dates/IDs.
- Início atômico journal/head/parent(deleting ou editing)/clock. Draft
  edit vai ao campo privado existente do parent. source atual conferido
  por tx; ID concluído é replay e não repete remoção. Nova intenção não
  substitui headrunning; creationAvailable impede recriar conversa.
- Páginas de20 messages, metadata select(), deletes+job+clock no mesmo
  tx, leituras antes de writes. Sem cursor necessário: prefixo apagado
  revela próxima página. Vazio finaliza parent e head. Native messages
  são folhas; não usar recursiveDelete paralelo no final (dois resumes
  poderiam remover nova conversa depois que o primeiro concluísse).
- delete de parent ausente com messagechildren é suportado. Jobtoken e
  nativebirth conferidos por página. Two callers samejob serializam no
  Firestore; stalehandle/headtroca/parentrecriado recusados sem deletes.
- MAX10 páginas por callable. Retorna {mutation:{id,conversationId,kind,
  state:running,deletedDocuments}} quando falta trabalho. resumeMutation
  continua job conhecido. Tombstones/jobscompleted permanecem metadata.
- chapterChat routing delete/resume antes de exigir parent. load consulta
  pending antes de abrir messages. mutationHeads querypor scopeToken/state
  current, limit1 selectmeta; suporta descoberta sem selecionarcid/pai.
  Índice COLLECTION(scopeToken,state,**name**) adicionado no JSON.
  create consulta availability antes do write.
- Frontend chapterChatService gera fallbackmutationId para callers semID,
  continua páginas porresume sem draft, retoma pendingload e recarregaestado
  final. Guard contra resposta sem progresso não reinicia ID. Erros deixam
  journal nativo para retomar, não afirma cancelado/completo.
- Hook useChapterChat conserva ID em RAM key UID/book/chapter/cid/action/
  messageID+createdAt, sem texto. Loading durante operação. Resultado de
  outro escopo não altera estado; edit preserva draft que mudou e pedido
  posterior. Retry mesma intenção usa mesmoID após erro.
- draftEpoch no parent avança no begin. draft RPC compara epoch (ausente
  =0) e não grava durante editing/deleting. Hook envia epoch observado na
  page. Autosave antigo não sobrescreve edit completo. Clienteantigo fica
  failclosed após epoch>0; liberação servidor/cliente coordenada, sem deploy.
- Corpus cleanup conhecido: conversation + messages folhas. Receipts são
  siblings e sobrevivem ao delete para replay de aplicação. NENHUMA
  subcoleção de message é suportada pelo contrato; deve ampliar protocolo
  antes de adicionar. Não copiar jobs/head para restore reativável.

Cenários ESCRITOS, NÃO executados:

- functions/test/legacyChatMutations.test.mjs: páginas235, metadataonly,
  olderprefix preserved, resume/replay, orphanparent/recreateblocked,
  sourcebirth/token replacement, newcommand busy, concurrentcounts,
  foreignowner, pending discovery currentchapterbirth.
- chapterChat.test custom fixture tx.delete/collectionPath e barrier de
  query no lugar do antigo recursiveDelete; lateanswer guard mantido.
  Caso draftEpoch antigo recusado e atual aceito.
- chapterChatService.test: páginasmesmoID/sem draft, pendingload resume e
  reload, semprogress não reinicia. ChapterChatPanel expectations incluem
  mutationId no delete e draftEpoch no autosave. Nenhum teste rodou.
- Sem declaração de comportamento comprovado por esses arquivos; gates
  finais ainda obrigatórios.

Próximas pendências integrais (não encolher objetivo):

1. Índices de mensagens legadas e aplicações com origem estável: mensagens
   podem reutilizar requestId depois de edit. IMPORTANTE: finish/gates
   ainda usam busy requestId; se worker antigo sobrevivente e novo pedido
   reutilizar mesmoID/contexto, precisa attempt/incarnação por mensagem
   (inclusive BYOKcallback) para não concluir a nova com saída antiga.
   Integrar isso à captura/índice canônico e deixar tokens fora do público
   quando não necessários; nunca keys. Frozen provider/model preservados.
2. Aplicações legacy receipts siblings duráveis e índices atômicos
   manuscrito/crédito/recibo; source/dependency metadata sem plaintext,
   replay confirmado afterdelete sem cobrar. Native applied-history
   versões completas dos ancestrais ainda pendentes da seção anterior.
3. Backfill metadataonly autorizado/paginado, pais ausentes, sem adotar
   origens recriadas ou snapshots revogados. Incluir mutationJobs/Heads no
   registry privado esperado e considerar scopeToken nas contagens.
4. Registry/fence/censo completo, graphorchestration/receipts/recover/
   recheck/finish/UI/impact map; fontes dos demais artefatos.
5. Progresso/revised versions, publicação/manifests/spoilers porvolume,
   pacoteeditorialprivado+restore nova cópia, E4 colaboração/reconciliação/
   reuso e auditoria integral E1/E2/E3. Só então gatesadiados/fixes/review/
   docs/ADRs/AGENTS/entregas. Não inferir feito por jobs de cleanup.

Worktree codex/producao-literaria base8b02f22, em
C:/Users/gaabr/.codex/worktrees/producao-literaria/writer. MCP search_graph
consultado; definições novas fora do índice. Indexação negada anteriormente
não repetida. Escritas require_escalated aprovadas, todas na worktree.

## Continuação — identidade de tentativa e índice canônico do chat legado

Implementado em código, sem executar testes ou validações:

- chapterChat emite messageInstance por intenção e generationAttempt por claim.
  Worker antigo, stream atrasado e callbacks BYOK não concluem nova tentativa.
  Stop usa a instância conhecida; recuperação persiste somente a instância,
  nunca tentativa efêmera/chave. Cliente BYOK exige tokens retornados antes do HTTP.
- Testes de tokens, callbacks atrasados, recuperação e controles ausentes escritos.
- literaryLegacyChatIndex.mjs grava literaryLegacyChatMessages no mesmo tx do
  claim/captura de histórico. Origem inclui nascimento nativo de livro, capítulo
  e conversa; tentativa/instância e manifestos diretos/herdados fechados.
  Sem pergunta, resposta, seleção, corpo de lore, persona ou credenciais.
- literaryImpactLegacyChat.mjs reconstrói somente após comparar metadados nativos.
  Recriação/mudança de tentativa/manifesto não reaproveita origens. Relação de
  capítulo é subject; entradas não canônicas ficam explicitamente unversioned.
- Limpeza de mensagens projeta role/messageInstance/generationAttempt, remove
  índice correspondente atomicamente e conta documentos adicionais no journal.
  Página20 permanece abaixo de50 escritas mesmo com20 índices.
- Coleção privada nas Rules, sem índices de campos, incluída na exclusão de livro
  e inventário supported. Não representa censo integral nem backfill.
- literaryLegacyChatIndex.test.mjs escrito, não executado. Atualizar expectativa
  da projeção da limpeza em legacyChatMutations.test.mjs.

Nova instrução do usuário: incorporar a branch principal consolidada ANTES dos
testes finais. fetch atualizou origin/master para a89fc38. Base atual 8b02f22 é
ancestral de origin/master; preservar toda a worktree antes de fast-forward e
resolver reaplicação. Não executar testes finais até concluir implementação e
incorporar a principal. Sem push/deploy/merge de volta à principal autorizado.

## Continuação — principal consolidada incorporada antes dos gates finais

Instrução do autor atendida em parte estrutural, sem iniciar gates finais:

- git fetch origin atualizou master remota para a89fc38.
- Trabalho completo (tracked + untracked) preservado no stash
  0c4e9fc5c10b4ccebed463f59d984df2f7e1f160; mantido para recuperação.
- Branch codex/producao-literaria avançou por fast-forward de8b02f22 para
  a89fc38 (origin/master), sem alterar master ou outro checkout.
- Stash reaplicado; quatro conflitos resolvidos em AGENTS.md,
  docs/architecture.md, firestore.indexes.json e functions/src/index.mjs.
  Regras/docs somam os dois contratos; índices têm merge semântico de três vias.
- Preservada a organização por setor da principal: 83 ações literárias
  registradas explicitamente em functionDomains.mjs. Seis ações geradoras em
  generationApi com segredo;77 de estado/metadados em planningApi sem segredo.
  Composição lazy em domainServices.mjs, sem voltar a endpoints por ação.
- Clientes literários usam shared/api/domainCallable; app já injeta o registro.
  Streaming chapterChat/editorChat permanece no transporte nativo da principal.
- Limpeza expirada de autocomplete reutiliza cleanupAssistedSessions, sem
  exportar um scheduler extra. Cabeçalhos private/no-store nas ações literárias.
- Testes de composição/rotas já existentes abrangem as ações novas; cenário SDK
  de leitura editorial e rejeição por setor acrescentado, ainda NÃO executado.
- Node24 e suíte otimizada vieram da principal. npm ci/build/test/validate/Rules/
  navegador continuam adiados até terminar implementação, conforme objetivo.
- Próximo trabalho permanece: índices/aceites legados e histórico aplicado,
  backfill/censo/fence/UI de impacto; progresso, publicação/spoilers/portabilidade;
  reconciliação e auditoria integral. Depois gates finais nesta base atualizada.

## Continuação — aceites legados com origem preservada

Implementado, testes escritos, nenhuma execução de teste/validação:

- literaryLegacyChatApplication.mjs: índice immutable em
  literaryLegacyChatApplications criado no mesmo tx de manuscrito/crédito/recibo.
  Guarda births livro/capítulo/conversa/mensagem, instância/tentativa, hash da
  sugestão e do resultado, manifestos diretos/herdados fechados. Sem prosa.
- Recibo nativo sibling recebe literaryApplication {version,indexId,metadataToken}
  vinculando todos os metadados ao aceite. DTO público e replay confirmado
  continuam iguais; exclusão de conversa não apaga recibo/índice de aceite.
- Apply novo exige messageInstance/generationAttempt e suggestionHash da
  resposta exibida. Fingerprint inclui essas provas quando presentes; recibos
  antigos mantêm replay sem recapturar identidade de uma mensagem recriada.
- finish grava suggestionHash nativo; revogação o limpa. Editor captura provas
  na intenção de aceite e recovery as retém até confirmação. Diferente da
  recuperação de envio, este journal precisa da tentativa exata já aceita.
  chatApplyStorage normaliza/fecha DTO, elimina extras e não guarda chaves.
- Adapter literaryImpactLegacyChatApplication valida marcador/recibo e destino
  nativo antes dos vínculos. Nova prova legacy-chat-application-source distingue
  cabeçalho vivo de preserved-metadata após delete/recriação/revogação. Prova
  histórica nunca autoriza corpo derivado nem comprova manuscrito atual.
- Coleção no inventário supported, Rules false, sem índices, limpeza de livro.
  Limpeza de conversa conserva o aceite histórico. Backfill/censo integral faltam.
- Novos cenários escritos em literaryLegacyChatApplication.test.mjs e
  chatApplyStorage.test.ts, com ajuste do teste EditorPageChat e fixture
  chapterChat: atômico, rollback, replay após delete, recriação, privacidade e
  provas ausentes/alteradas. Não declarar passados.
- Pendências amplas: histórico ancestral aplicado do chat nativo, backfill,
  censo/fence/orquestração/UI do impacto; progresso por artefato, publicação por
  versão e spoiler porvolume, pacote privado/restore; reconciliação e auditoria
  E1/E2/E3/E4. Testes finais somente depois, com a principal já incorporada.

## Continuação — progresso por artefato e checkpoints versionados

Código acrescentado, testes escritos, não executados:

- literaryProgress.mjs expõe listLiteraryProgressArtifacts,
  getLiteraryProgressArtifact e saveLiteraryProgressNote em planningApi.
  Lê12 registros/página por etapa, com projeções fechadas. Contrato, planos,
  gates, redações, marcos, revisões e integrações ficam separados.
- Estado salvo de um job não certifica qualidade, atualidade de todas as fontes,
  revisão do manuscrito atual ou publicação. VersionId e contadores são próprios
  de cada artefato. Não existe percentual único de livro pronto.
- literaryProgressNotes guarda bloqueios (até12x600) e próximo passo (4000),
  versão CAS, origem nativa, captura de versão e data. NoteId inclui birth do
  livro e artefato; recriação não adota anotações antigas.
  literaryProgressNoteVersions preserva cada salvamento.
- Fonte alterada ou nota concorrente recusa escrita antiga. Rebase é explícito
  na UI após comparar o registro salvo, conservando rascunho do autor.
- Recibos literaryOperations suportam kind progress; replay confere bookBirth,
  preserva versão confirmada e não duplica escrita. Journal local existente
  guarda apenas identificação/hash, sem notas. A interface conserva pedido
  incerto e repete o mesmo operationId, ou consulta sem reenviar.
- LiteraryProgressPanel e serviço conectados à área de produção e DraftGuard.
  Cobre loading/empty/error/success, paginação, troca de livro, versões, bloqueios
  e próximo passo. IDs longos recebem quebra visual. Sem prova no navegador ainda.
- Rules server-only e exclusão nativa de livro abrangem notas/versões; sem índices
  de campos. Acrescentados aos testes de privacidade junto dos índices legados.
- Cenários escritos: literaryProgress.test.mjs (metadados, etapas, CAS, origem,
  recriação, recuperação, limites/paginação); LiteraryProgressPanel.test.tsx
  (consulta, retry exato, conflito/rebase explícito, estados e troca de livro).
  Nenhum rodou; SDK/Rules/browser/build/validate continuam pendentes.
- Histórico de notas existe no servidor; leitor/diff de versões na UI e inclusão
  no pacote editorial ainda precisam fechar a portabilidade.

Próximas frentes integrais:

1. Publicação versionada com manifesto de conteúdo, verificação, confirmação
   distinta do texto salvo e reserva do guia público por progresso de cada livro.
2. Pacote editorial privado e restauração em nova cópia, incluindo novos artefatos.
3. Fechar mapa de impacto (histórico nativo aplicado, backfill/censo/fence/
   orquestração/UI) e reconciliação/reuso E2/E4; auditoria E1/E2/E3.
4. Incorporar qualquer atualização posterior da principal ANTES dos testes
   finais; já contém origin/master a89fc38. Depois todos os gates/fixes,
   revisão, docs/ADRs/AGENTS/entregas. Não integrar/push/deploy implicitamente.

## Continuação — compilação versionada de publicação (confirmação ainda pendente)

Implementado em código, sem rodar testes/validações:

- literaryPublicationContracts.mjs e literaryPublication.mjs: start/get/list/
  advance/cancel, listManifest e listRemovals. Setor planningApi, sem modelos,
  créditos ou scheduler adicional.
- Políticas book/act/chapter. Act/chapter incluem o prefixo em ordem de leitura.
  Exigem integração concluída/aceita, bloqueios resolvidos e versão corrente;
  unidades cobertas conferem literaryIntegrationUnitLinks + Units +
  coverage.complete/sourceToken, além do cabeçalho da integração.
  Fora do escopo integrado só se inclui capítulo idêntico à edição anterior.
- Origem captura book birth, fence do manuscrito, título, privacidade e ponteiro
  público anterior. Consulta/cancelamento de metadados usa bookOrigin, portanto
  perda de universo não impede ver/cancelar o próprio job. Não concede corpos.
- Fases: candidates (25 metadata/page), selecting (1 ordenado), prior (20 IDs
  públicos/page e remoções), building (uma unidade canônica/chamada),
  verifyUnits (relê cada fonte/HTML), verifyChapters (confere projeções/atos),
  verifyCandidates (novo censo25 de todos os capítulos) e prepared.
- Unidade integral lê o kernel canônico; cenas em ordem e texto legado completo.
  Usa renderPublicRichText já existente internamente em visibleWordCount, agora
  exportado/declarado. Sanitizador parse5 existente, sem dependência nova.
  Projeção pública<=800k e documento<=900k; excesso recusa sem truncar.
- readLiteraryIntegrationMarkup extraído de readLiteraryIntegrationUnit; wrapper
  antigo conserva DTO/texto e bloqueio de prosa vazia.
- Compilação grava chapters/acts em publicBooks/{book}/revisions/{jobId}, mas
  NÃO cria header da revisão nem troca o ponteiro público. prepared não é
  published: URL/publishedAt null, publicationConfirmed false.
- literaryPublications, Candidates, Chapters, Units, Bodies e Removals privados,
  com índices de paginação e coleta de livro. Cache Bodies é removido por
  capítulo concluído. Cancelar preserva manifestos/staging; coleta dedicada
  de cancelados ainda precisa fechar retenção.
- ManifestHash encadeia versões/projeções/unidades e removalHash. Remoções são
  listáveis e nunca cortam silenciosamente a edição corrente.
- Flag permanente hasLiteraryPublications é adotada SOMENTE ao iniciar este
  fluxo validado, separada de hasLiteraryResources (método continua opcional).
  Rules bloqueiam SDK create em revisões/chapters/acts/lore e delete de staging
  gerenciado, exceto limpeza com book.deleting. SDK não cria/remove/limpa flag.
- publishBook legado direciona quem adotou o novo fluxo à produção literária.
  bookLorePublication stageLore recusa guias sem evidência neste caso e
  finalize chama assertLiteraryPublicationReady. Este guard exige estado
  verified/publicationSourceToken, que AINDA NÃO é produzido: confirmação,
  guia seguro e UI do novo publisher precisam ser implementados antes de liberar.
  Fluxo legado permanece para livros sem hasLiteraryPublications.
- Progresso ganhou etapa publication, contadores e escopo act/chapter. Journal
  e getLiteraryOperation suportam início kind publication/receipt de jobId.

Cenários ESCRITOS, NÃO executados:

- literaryPublication.test.mjs: legado integral/sanitizado sem exposição,
  cenas ordenadas, unit ledger aprovado, adulteração, remoções, fonte/ponteiro/
  birth, idempotência/cancel, censo final e ato ausente.
- visibleWordCountParity.test.ts agora compara também HTML exato com renderer
  independente do navegador; .d.mts recebeu renderPublicRichText.
- literaryImpact.rules.test.mjs: coleções privadas novas e staging gerenciado
  invisível antes do ponteiro, SDK não altera/remove e leitura pública posterior.
- Ainda nenhum build/typecheck/Rules/Chromium/validate; todos no gate final.

Próximo incremento — fechar a publicação, sem redesenhar a compilação:

1. Preferir confirmação totalmente server-side em transação final (sem janela
   longa de BookPublicationCapture, pois clocks privados alteram bookStamp).
   Exportar um wrapper de source(tx,db,loreScope) de bookLorePublication para
   reutilizar prova/privacidade nativa dentro da confirmação; new publication
   pode importar o wrapper, pois old module só importa Contracts (sem ciclo).
2. Guia explícito do leitor com campos públicos, evidências literais ligadas a
   capítulos/projeções deste manifesto e limite por chapterId DESTE livro.
   Não copiar bíblia, resumos futuros ou fallback global privado. Verificar
   consentimento/revogação de referências nativas usadas. Identidades distintas
   para homônimos. Formulário/edição e novo leitor precisam preservar o legado.
3. Congelar/reconferir guia, contagens e removalHash; aceite explícito da versão.
   Transação final cria revision header, troca publicBooks pointer, book.status,
   job published e recibo juntos, gravando URL/revisionId/manifestHash. Replay
   histórico não republica após unpublish nem sobrescreve outra edição.
   Manter raiz pública/universePrivacyVersion nativos e Rules de revogação.
4. Implementar LiteraryPublicationPanel e serviço, integrar aba e recuperação,
   preview do texto congelado, políticas, aceites, remoções, pausa/retomada,
   verificação e confirmação. Ainda não existe essa UI.
5. Fechar pacote editorial privado/restauração em nova cópia; depois mapa de
   impacto (histórico nativo aplicado/backfill/censo/fence/orquestração/UI),
   reconciliação/reuso e auditorias E1/E2/E3/E4. Não diminuir escopo original.
6. Principal a89fc38 já incorporada. Antes dos testes finais buscar/incorporar
   atualizações posteriores preservando todo trabalho (stash anterior
   0c4e9fc5c10b4ccebed463f59d984df2f7e1f160 não contém incrementos posteriores).
   Depois gates/fixes/review/docs/ADRs/AGENTS/entregas. Sem commit/push/deploy.

## Continuação — guia público e confirmação escritos; conferência da principal em 2026-11-02

Código acrescentado desde o checkpoint anterior (ainda sem aprovação final):

- literaryPublicationGuide.mjs: guia público independente, versões/CAS, evidência literal no texto congelado, relações, aparições e incertezas; verificação retomável e limpeza de projeções antigas.
- literaryPublicationConfirmation.mjs: confirmação atômica do cabeçalho, ponteiro público, status e recibo; replay histórico sem republicação. Reutiliza a prova nativa de privacidade em bookLorePublication.
- Registry planningApi, Rules, exclusão, índices e recuperação literária incluem guia/versões/provas/confirmação. progressRevision permite detectar avanço sem progresso.
- LiteraryPublicationPanel, LiteraryReaderGuideEditor e ReaderGuideFields, serviços e aba do livro: compilação, preview, remoções, guia, consentimento vinculado aos hashes, confirmação e recuperação por recibo.
- Leitor: readerGuide.ts, ReaderGuideCatalog, readerProgressStorage e integração em ReaderView/ReaderContent/tooltip. Limites por livro/edição/capítulo e retomada local. Revisar homônimos de entidades ainda ocultas: detecção atual considera os itens visíveis.
- As novas rotas de guia/confirmação e telas ainda precisam de cobertura de comportamento específica. Nenhuma conclusão das cinco etapas foi declarada.

Conferência solicitada antes dos testes: git fetch origin; origin/master e HEAD a89fc385701d07b62d45883270ffc963c53a5c92; master local a80dac5 já ancestral de HEAD. git merge --ff-only nas duas referências respondeu Already up to date. Sem conflito nem transporte adicional necessário. O checkout original possui mudanças de outra tarefa e deve continuar preservado.

Após essa conferência, foram instaladas dependências físicas com npm ci --prefer-offline e npm ci --prefix functions --prefer-offline. Iniciadas suítes completas de Functions, frontend sem cobertura, Rules no emulador demo, typecheck e validate. A execução desta rodada é expressamente solicitada pelo autor; não altera o restante do escopo pendente. Typecheck retornou 29 erros; validate já aprovou skills/arquitetura/docs/styleguide, mas há arquivos sem formatação. Resultados definitivos serão registrados no relatório desta rodada; não confundir execução com aprovação.

Permanecem: portabilidade editorial privada/restauração, mapa de impacto completo (backfill/censo/fence/orquestração/UI/histórico), reconciliação/reuso e auditorias E1–E4, cobertura faltante, correções dos gates, navegador/temas/320 px, revisão final, ADRs e registro de entrega efetivamente validada. Sem commit, push, merge de volta à principal ou deploy nesta rodada.

## Rodada solicitada após conferência da principal — correções e execução real

Consulte validacao-local-2026-11-02.md. Principal local e remota já incorporadas em a89fc38; sem conflito ou merge novo.
Primeira rodada: Functions 5090/36 falhas, frontend 5212/22 falhas. Após correções: seis suítes de carregamento 116/116, nove grupos backend afetados 89/89, contrato editorial 8/8, dez arquivos frontend afetados 126/126. Não apresentar isso como reexecução completa verde.
Typecheck passou; sintaxe 556 módulos passou; format:check completo passou. validate parou no lint e ainda não está verde.
Corrigidos: duplicações de variáveis; tipos/mocks/guardas; chaves React sources/milestone distintas no gate; captura de geração antes do await editorial com regressão; mock editorial isolado no chat; argumento opcional omitido quando indefinido; layout effect para identidade atual; dependências escalares estáveis do autocomplete; dependência user do callback de journal no EditorPage; mocks de lock; transporte setorial do teste HTTP; fixtures com IDs válidos/contratos fechados/projeções aninhadas/inequalities; paginação de todas as mensagens; stop obrigatório antes de editar e barreira permanente busy=editing; erro fechado not-found na revogação.
A execução inteira de Rules atingiu limite de 30min e foi interrompida pelo runner. A jornada HTTP corrigida passou 1/1; teste de atos já passou no shard 1 após usar batch vínculo+updatedAt e asserção de rollback.
Ativos em 18:37: lint session 64164 (log writer-literary-lint-fixed4.log); Rules shards 1/4 session26260, 2/4 session87667, 3/4 session11766, 4/4 session19662, logs writer-literary-rules-shardN.log. Todos em %TEMP%, cada shard com emulador/porta próprios. Aguardar resultados reais; não confundir logs esperados PERMISSION_DENIED com falha sem consultar resumos.
O emulator antigo 127.0.0.1:65220 encerrou: não usá-lo novamente. Teste atos separado após timeout retornou ECONNREFUSED; shard1 já exercitou corretamente.
Ainda sem cobertura/build/browser/validate aprovado, sem commit/push/mergeback/deploy. Escopo funcional original permanece pendente conforme README.

## Fechamento parcial de validação em 2026-11-02, 19h16

Build passou (tipos, bundle, smoke), sem deploy. Full frontend inicial 5212 testes/22 falhas; dez arquivos afetados reexecutados 126/126. Full Functions inicial 5090/36 falhas; seis suítes de carregamento 116/116 e nove grupos afetados 89/89 após correções. Não somar reexecuções como uma nova suíte completa.
Lint completo passou até a última partição, onde imports sem uso em testes foram removidos; raiz isolada agora passou, e a feature literária isolada passou com 4 warnings. validate-final anterior parou nesses imports; nova execução completa ainda deve ser iniciada. Build verde não equivale a validate aprovado.
Quatro shards Rules originais terminaram com falhas: shard1 160/4, shard2 132/1, shard4 148/4; consultar shard3 para seus números. Corrigidos testes para catálogo atômico, relógio de capítulo, prova de aceitação (messageInstance/generationAttempt/suggestionHash), protocolo cleanupVersion3 e limites de loop de limpeza ampliados para as novas coleções. Payload lore grande agora é testado como roundtrip nativo em partes, não como rejeição obsoleta de documento inline; 8/16 passou31 e 5/16 passou40. Alias @/shared/streams do bundle de teste bookLorePortable incluído explicitamente. Não reduzir limites de cobertura nem remover asserções de segurança.
Rules otimização real: validação de restoreOrigin removida de validAIPersona apenas porque criação proíbe origem, atualização exige a MESMA PRESENÇA e o MESMO CONTEÚDO, e personaRestoreAvailable valida origem+lote existentes. personaCatalogClockAdvanced lê next/previous uma vez. Aventura v2 8/8 e persona manual/v1 8/8 passaram, incluindo 16 traits, origem forjada/null e revogação. Ativação real retestou1/1 (log activation-rules-fixed). BackupRead9/9. Campos protegidos de livro agora comparados por bookServerState(data), lista dos MESMOS 13 campos/defaults anteriores; isso reduz expressões para 16 overrides+clock. Usa SOMENTE no allow update de BOOKS (rg bookServerState deve mostrar definição e 1 uso; inserção transitória redundante em aiPersonas removida). Rerun atual16/16 deve validar orçamento.
Ativos: Rules 1/16 fixed2 session53967,16/16 fixed2 session16145,11/16 session33036,15/16 session50937,3/16 session1221,10/16 session65691. Logs %TEMP% writer-literary-rules-Nof16-fixed[2].log. Root lint session64428 já terminou0. Não reutilizar portas antigas: cada runner encerra seu Java ao terminar. Shards max16: tentativas de index/149 foram recusadas sem iniciar.
Próximo: iniciar validate completo pós-imports; aguardar shards válidos, corrigir falhas reais sem relaxar contratos; atualizar relatório, revisar diffs e só declarar gates efetivamente passados. Todas as pendências funcionais originais das cinco etapas permanecem; guide/confirmation novos ainda precisam cobertura específica, portabilidade editorial e mapa/auditorias não terminados. Sem commit/push/mergeback/deploy.

## Checkpoint de validação em 2026-11-02, 19h52

A principal foi conferida antes dos testes e permanece incorporada em a89fc38. Não houve alteração nossa no checkout original, commit, push ou deploy.

`validate-final2.log` passou skills/arquitetura/docs/styleguide/formatação/lint completo, mas falhou no frontend: 5213 testes, 5210 pass/3 timeouts. Isolados os dois arquivos (bookCoverBackupRecords e bookLoreManualGate): 19/19 passaram. Cobertura global functions=83,46% (mínimo90), statements85,76/branches81,43/lines88,76. Lacuna principal components/services literary-production: 638 e141 funções não cobertas. Não reduzir limites nem excluir arquivos.

Rules: descartadas otimizações experimentais bookClockOnlyUpdate e validChapterContentMutation, pois não ajudavam. Mantidos bookServerState com mesmos13campos/defaults; validPersonaOverride lê value uma vez e dois campos obrigatórios+size2 excluem extras sem repetir typecheck de map (acesso de campo já exige map). validPersonaComplement exige os dois campos e tamanho2. Validação real scenes.rules inteira9/9 passou (focused-final.log). Preset/custom16 e negativas de tipos/ranges/extras continuam testados. RestoreOrigin mantém presença+conteúdo congelados e lotevalidado. Shards11/16=34/34 e10/16=34/34. Shard3/16=53/55, falhas workHistory: corrigidas batch título+rootclock e leitura nativa de contentStorage para texto900k; duas reexecuções2/2pass (history-focused-fixed.log). Shards1/16=48,5/16=40,8/16=31,15/16=37 já verdes. Não somar targeted comofull.

Novos testes: LiteraryReaderGuideEditor.test.tsx seis casos CAS/timeout/recovery/revisão/preservação/readonly/evidências independentes. readerGuide.test.tsx quatro casos parser/progresso/homônimos/links. ReaderView+ambos=29/29 (reader-guide-tests2.log); typecheck-final3 passou. ReaderContent passou a receber allLore (ReaderView fornece a edição inteira) para suprimir ligação ambígua com homônimo ainda oculto; nenhuma entrada futura é renderizada. Backend literaryPublication.test.mjs quatro testes novos: literal evidence/projeção sem privados/CAS/replay/consentimento/hash/publicação e replay após retirada. Suíte13/13 passou (publication-final-tests.log). Lint direcionado dos testes e leitor passou; lint backend+novo visual em andamento.

Ativos: test:setup session71836 (setup-final.log), já scripts116/116 e Functions em curso. Rules rodada integral final4shards: sessions58314/13273/22213/19268 (rules-final-shard1..4.log). Playwright legado leitor/publicação session73613 (reader-browser.log), porta42991,18casos nos3temas/320px. Aguardar término antes de usar mesma pasta de resultados para a jornada nova reader.guide.visual.ts (escrita, ainda não executada). Novo teste visual injeta edição pública fictícia por setFixturePublication, cobre limites, homônimo, fontes, retomada e novaedição; se falhar, investigar comportamento antes de alterar asserts. Os resultados são locais/fixtures, não deploy.

Próximo: terminar essas rodadas, executar visual novo, inspecionar capturas, atualizar relatório, repetir build após ReaderContent e staticchecks das adições. Cobertura precisa de expansão relevante; escopo funcional restante continua no README, não encerrar objetivo nem marcar etapas concluídas.

## Integração da principal local mais recente — reiniciar os gates

IMPORTANTE: a master local avançou para1d78ff7 (16commits à frente de origin/master a89fc38) durante as rodadas. Detectado por git branch, confirmado HEAD..master; interrompemos SOMENTE nossos processos de validação por árvore de processos identificada pelos logs. As rodadas setup-final, rules-final-shard1..4 e build-final sobre a89 NÃO têm resultado integral válido e foram encerradas. Não reportar esses testes como novos gates verdes.

Preservado TODO trabalho em stash477aa64f10463d1606f1bcb9ada6c64dfb79b9bb. Merge--ff-only master mudou HEADpara1d78ff7f9c58fafc3dc4920eef2408a4f244a390. Reaplicado stash mantendo-o intacto. Resolvidos12conflitos e removidos marcadores: docsai+architecture mantêm ambos; indexes JSON união de todos registros incluindo personaGenerations; rules mantêm catálogo+personaGenerations; generationApi mantém personas+todos serviçosliterários; rotas410; EditorPage mantém chapterLayout+propsautocomplete; RichEditor usa loreSummarydo layoutnovo juntoalert+contextoautocomplete, sembarra duplicada. Testes bookLoreCreation/Portable/RestoreLore/workHistory conservam as provas MAIS FORTES da master: adoçãonativa real deoutrohead, readerpreparado em partes, bodytextpaginado, codeSplittingfalse+alias@. Imports obsoletos dos nossos leitoresadmin removidos. Gitdiff--checkpass, semU. Maincheckoutlimpo,nenhumwrite/deploy/commit/pushnosso.

Incompatibilidade nova resolvida: primeiro aceite em functions/src/personaGeneration.mjs preparaPersonaCatalogWrite ANTES das escritas e commitnaMESMAtransação. Replayretornaantesdoclock. Teste novo personaGeneration confirma catalog4->5, depois replay sobrecatalog8 preservatudo/semcredito. Grupos domainCallable+personaGeneration+personaGenerationDomain+literaryPublication31/31pass (master-integrated-targeted.log), baseatual1d.

Browser SOBRE BASEANTERIOR concluiu: reader legado17/18 (Escapesépiamóvel), casoisolado1/1pass semmudançacódigo. Novoguia6/6pass nosseisprojetos3temas/desktop/móvel+320px, capturadark320inspecionada. Logsguide-browser ereader-browser. Repetirapósnovabase. Dois novosfrontarquivos+ReaderView29/29pass e backendpublication13/13tambémhistóricos; endpointstestados31/31járepetidosatual.

Relatóriovalidacao-localeREADMEatualizados para distinguirbases. Próximo iniciar validate e Functions e Rules SOBRE1d. Não restaurar antigasrodadas comoevidênciaatual; não perder stash, portabilidade/impacto/auditorias seguem pendentes, cobertura83,46históricaaindafaltaampliar. Objetivoativo.

## Rodadas efetivamente iniciadas sobre 1d78ff7

Não há conflitos pendentes. HEAD e master locais conferidos iguais após a reaplicação; original continua limpo. Stash477aa64f mantido. Nenhum novo commit/push/deploy.

- validate: session5974, log %TEMP%/writer-literary-master-validate.log; skills,arquitetura,docs,styleguide já passaram; format:check em execução.
- Infraestrutura+Functions completos: session84491, master-setup.log.
- Rules oficiais quatroshards: sessions75358/34193/28458/99086, logs master-rules-shard1..4.log.
- Frontend dirigido pós-conflitos: sessiondo último comando (master-frontend-targeted.log); todos os testes da feature literária + ReaderView/readerGuide + RichEditor/EditorPageAutocomplete/Chat + PersonaGenerationDialog.
- Direcionados backend31/31pass em master-integrated-targeted.log. Typing/build/browser ainda precisam repetição sobre1d; anteriores sãohistóricos.

A nova principal fica congelada em1d78ff7 nesta rodada. Se detectar outro avanço, não confundir o snapshot já testado com a branch móvel; conferir escopo antes de reiniciar novamente. Falha histórica de cobertura83,46% abaixo90permanece aberta até nova execução, semredução de thresholds. Relatório canônico atualizado. Continuar o objetivo completo, não marcá-lo concluído pelo transporte da base.

## Rodada encerrada sobre1d78ff7 — principal avançou novamente

PROGRESSO: criado plano-integral.md com texto integral recuperado da resposta originaldochat01a19d46-d63f-7273-954a-01274befea7c. É escopo aprovado, não prova de conclusão. README aponta para ele. Referência é literal e não reduz as57tarefas/subpassos ou critérios.

Testes novos, todos passados dirigidos: LiteraryPlanningPanel4 (serviços/journal reais,CAS,referência alterada só no draft,comparação/histórico,retrysemtexto); ContractInferencePanel4 (fontes explícitas,rechecagem,hipóteses como propostas,cancelamento de produtor mantido,recovery semgeração); LiteraryPublicationPanel6 (hashes/4consentimentos,dirtyguide,pending release/historical recovery,checkpointsemavanço,pagesmanifest/removal,prepareidempotente); LiteraryDraftGuard3 (Escape/descarte/pendingsave/beforeunload); literaryClientServerRoundtrip.test.mjs4 (clientesreais->createDomainHandler->serviçosnativos->studioDb,histórico,CAS,lostACKapóscommit,replayapóssucessora,sourcevssubject,recriação eoutraconta). Lint desses passou. Sobre1d o frontend dirigido anterior101/101 em16arquivos também passou.

Falha de mergecorrigida emtests/firestore/bookLoreCreation.rules.test.mjs: depois do adoptCreation deoutrohead, a revisão corretaé1 (não0 queficou da antiga expectativa). Captura afterNativeCreation e deepEqual integralapósSDKbatchnegado, preservandoprovade não-mutação. Reexecuçãofocused1/1pass, logmaster-lore-creation-fixed, session12119terminou0.

Falhadebrowserlegado real: Escape fechavaprimeirotooltip mas eventohover sintetizado pordispositivotouchabriaoutraocorrência(logtracever%TEMP%/writer-literary-master-reader-browser-initial). ReaderLoreTooltip.onMouseEnter agorasóabre se !(any-hover:none), mantendo onFocus/onClick. Teste novoReaderLoreTooltip.test.tsx evita mockrecursivo capturandomatchMedia.bind(window), restabelecefunçãoapóscaso. Dois novos +ReaderView+readerGuide25/25pass. Novejornadasmóveisrepetidas9/9. Fullbrowser corrigido24/24 nos6projetos3temas/320, logmaster-reader-browser-fixed. Reforçadajornada reader.guide.visual.tsparaabrir/rolarfatosem320,6/6pass emmaster-guide-narrow-browser. CapturasclaroDesktop/sépia320inspecionadas. Nenhum screenshotbaselinealterado. Lintfinal-increment-lint2 terminou0.

Rodadacompleta1d: npmtest:setup session84491terminou0: scripts116/116, Functions5224/5224,557módulossintaxe(logmaster-setup). Buildsession90803terminou0 tipos/bundle/smoke(logmaster-build), APÓScorreçãohover. Typecheck59538terminou0 antesdessasadições; build é a provamaisnova. Rules:1/4session75358terminou1 com152/151pass/1expectativaantiga(acimacorrigida1/1);2/4session34193log146/146;3/4session28458terminou0com143/143;4/4session99086terminou0com157/157. ArquivosnãoalteradosnoRuby sourceRulesdesdeiníciodessasrodadas; nãoapresentarquatrozeros, reportarresultadoe rerun dirigido.

Validate master-validate completou testes com5252/5243pass/9timeouts em6arquivos e cobertura functions86,19%(8815/10227),statements87,39/branches82,99/lines90,49. Minfunctions90preservado; global NÃOverde. Arquivosfailed: bookCoverBackupRecords,bookRestoreNativeRoundtrip,bookLoreDiscard,bookLoreManualGate,bookLoreVisibilitySelection,bookLoreVisibilitySelectionSession. Selector53caseisolado1/1pass129,62s, logvisibility-selection-diagnostic session39060terminou0. Outros precisam reexecução calma, nãoaumentarlimites. Global tevecorreçãoReaderTooltipduranteexecução, nãoprovasnapshotfinal. Scripts lint36partições0erros4warns preexistentes; novosarquivoslintisolados0erros, patchmétodocapturado corrigidosemignore.

IMPORTANTE: masterlocalagora317abc69cba7465cc41149eeb15c623c0cee130c, doiscommitsnovos(8e9efa6/317abc6) integramcriaçãodeprojetoseassistentecontextual,63arquivosmudaram(assistedBook/pageAssistant/newproject+routes+model). Principalnovamenteatualizardepoisdepreservartudonovamentestash. Osprocessosdo1djáterminaram(sessions5974validate1,12701guide6passverificarseprecisar;34193rules2conferirexit). Nãoencerrarnadaapenasporobservação. Semdependênciasnovasnarodada(package/locknãomudaramna1d),semcommit/push/deploynosso. Stash477aa64fantesdessaetapanãocontémnovostestes/hoverfix; criarnovobackupantesdemoverHEAD. Checkoutoriginalmasterlimpo,18commitsàfrentedoriginnaúltimaconferência.

Próximo: incorporar317comstashpróprio, preservarcontratoeditorialnaassistedBooke adaptarpageAssistantcriação nova ao métodonos seus pontos de entrada (compatibilidadeE1/E3); declararprovasporbase; fechartimeouts/cobertura; continuarpendênciasE2mapaglobal/E4modosereconciliação/E5impactoportabilidade. Não marcarconcluído: nenhumaetapaformalmentefechada.

## Checkpoint atual — principal incorporada e testes encerrados em b9fc03c

Este bloco substitui estados de processos em andamento descritos acima. Objetivo continua ativo; não marcar concluído.

- Worktree literário: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`, branch `codex/producao-literaria`, HEAD `b9fc03c57a34cec25a3ebec13974023ba5a17fb8`, igual à master local na conferência final. Main original permanece limpo. Sem commit/push/deploy nosso.
- Stash antes da incorporação de 317: `0470089f15786bb0b87881fdb5fd5304a3466644`, mantido. Quatro conflitos resolvidos: assistedBook, domainServices, domainCallable test e exports de ai-assistant. O commit b9 é apenas documental, incorporado depois por fast-forward sem conflitos.
- Compatibilidade concluída em código: NewProjectPage oferece EditorialProposalFields opcional somente para livros. assistedBook valida/persiste contrato e primeira revisão atomicamente; instruções project-interview/project-proposal limitam guia a livros. Testes cobrem manual, IA sem autoaprovação, replay e rejeição para aventura/campanha sem escritas.
- pageAssistant usa editorialStored + composeEditorialContract, com prova de nascimento nativo/revisão/hash antes/depois do provedor. Expõe fonte exata de escopo editorial-contract-only/wholeBook:false. Frontend mostra fonte readOnly fora das capacidades. Novo teste detectou bug de ref lida dentro de updater React; contextChanged agora é capturado antes, removendo respostas antigas ao trocar a prova. Testes cobrem mudança/recriação/remoção do guia e outra conta.
- Backend dirigido: 118/118 em dez arquivos, criação/assistente 49 são subconjunto. Frontend dirigido: 20/20. Sintaxe 560 módulos aprovada. Build terminal aprovado (session34805); syntax session53422 terminal zero. Logs 317-server-integration, creation-frontend-fixed, build, functions-check, increment-lint.
- Validate session89393 terminou saída1. Frontend **5279/5279 em409arquivos**, duração489,95s, **nenhum timeout**. Os seis arquivos antes afetados passaram. Coverage functions **86,02% (8889/10333)** ainda abaixo90; statements87,30/branches82,87/lines90,41 passam. Não reduzir thresholds. Skills/arch/docs/styleguide/format/lint38 passaram; lint0erros4avisos. `test:setup` não alcançado; não alegar nova aprovação global de Functions. Log317-validate, coverage/results.json.
- Chromium atual: criação manual com contrato6/6, três temas/desktop/móvel320, capturas claro desktop e sépia móvel inspecionadas. Leitor+guia24/24 (session22368 terminal0). Logs317-creation-browser e317-reader-browser. Sem baseline alterado.
- Rules/Functions completos anteriores são histórico1d; Functions5224, scripts116, Rules quatroshards151/152+146+143+157 e correçãofocused1/1. A nova principal só formatou dois arquivos de teste de Rules, sem alterar fonte firestore.rules; não repetir alegação de quatroshards verdes originais.
- README e relatório de validação atualizados com estado atual e distinção dos snapshots. Nenhuma das cinco etapas formalmente encerrada. Faltam E2 mapa/auditorias globais, E4 modos de colaboração e reconciliação/reuso, E5 backfill/censo/fence/UI do impacto e pacote privado editorial .writer/restauração. Cobertura precisa de testes comportamentais significativos; não mascarar lacunas nem declarar escopo parcial como final.

Próximo: continuar requisitos funcionais do plano integral e ampliar a cobertura correspondente. Não repetir a rodada completa sem nova mudança/risco que a justifique. Preservar trabalho no worktree e conferir principal antes de uma futura integração autorizada.

## Checkpoint posterior — mapa global implementado e verificado dirigidamente

Este bloco substitui a indicação anterior de que o mapa global ainda não existe. O objetivo integral continua ativo, 0/5 etapas encerradas; não marcar concluído.

- HEAD/branch seguem `b9fc03c57a34cec25a3ebec13974023ba5a17fb8` / `codex/producao-literaria`. Worktree literário próprio preservado; original E:/Mega/dev/writer limpo na última conferência. Sem novo commit/push/deploy. Nenhum agente delegado.
- Novo serviço `functions/src/literaryBookMap.mjs`, registrado no `planningApi` via domainServices/functionDomains. Ação `readLiteraryBookMapPage`; contador do contrato atualizado para **412**. Reutiliza `readLiteraryPlanSourceViews`, agora exportado de literaryPlanning.mjs. A API é somente leitura: estrutura e planos, sem manuscrito, geração, diário, recibo ou débito.
- Recursos paginados acts/chapters/events/plans; interface solicita25 itens estruturais/3planos, planos até140k conforme schema. Fence vincula UID/target, nascimento/versão nativos da raiz, universo e controlecronológico. Sem gravações/índices/Rules novos. Campos de plano e labels canônicos são retornados, junto das fontes conferidas pelo leitor nativo. A prova é conservadora de metadados, nunca autorização para AI/mutações/leitura integral.
- Novos model/bookMap.ts, services/literaryBookMapService.ts e components/LiteraryBookMapPanel.tsx. Mapas usam groupChapters/actName pela interface pública de books. Ordem de leitura preserva atos vazios e capítulos sem ato. Mostra planos de livro/série, tratamentos de ato e fichas relacionadas. Cronologia usa rank ativo e mantém momentos textuais não vinculados consultáveis. Trajetória usa somente assuntos explícitos de knowledgeState e permite ordem de leitura/eventos. Labels são canônicos; homônimos distinguem livro/universo/ID, aliases usam currentReference para normalizar identidade. IDs recriados não herdam vínculo antigo.
- LiteraryProductionPanel ganhou botão e área lazyvisited de mapa, preservando demais drafts. CSS mapContent aplica overflow-wrap. Cliente pausa após página pendente e automaticamente após32páginas por ciclo, mantendo cursor/fence; não limita tamanho do livro. Checkpoint apenas em memória; recarregar começa nova consulta. Duplicatas são checadas por Set e assuntos indexados uma vez por render. Conta/livro/desmontagem invalidam respostas antigas; erro de fontes remove mapa derivado.
- Testes backend **23/23**: nove mapa + nove planejamento + cinco domain. Log map-server-reviewed. Testes frontend **34/34** em quatroarquivos, log map-frontend-complete: mapa9 casos (inclui aliases, emptyacts,32pages,duplaordem), planning4, BookPage16 e roundtrip5 (contagem porarquivo conferir se necessário; total34 é a evidência). Roundtrip real cliente->domain handler->serviço->studioDb ganhou cenário de mapa, sem journal/crédito, stale/foreign SDKcodes.
- Browser final **6/6**, log map-browser-reviewed, session53423 terminou0. Três temas, desktop e320móvel, trêsvisões, combobox da ordem de trajetória, Enter, atualização, sem overflow. Capturas anteriores desktopclaro/móvelsépia inspecionadas. Fixtures novas literaryBookMapService/literaryProductionService e aliases em vite.visual.config.ts ficam fora do buildprod.
- Build final tipos/bundle/smoke aprovado (session91015 terminou0), map-build-reviewed. Lint de todos arquivos do incremento zeroerros/zeroavisos (31310 terminou0), map-lint-reviewed. Arquitetura/styleguide passaram. Sintaxe de561módulos aprovada em map-functions-check (session36656 terminou0). Último validate global/coverage5279/86,02% é **anterior ao mapa**, não prova atual; não repetir gate completo sem novo fechamento/risco justificado, não alterar thresholds.
- Documentação: novo docs/tasks/producao-literaria/02-mapa-global.md; README, relatório de validação, architecture e literary-production atualizados. Sem docs/entregas final porque gate global e critérios integrais continuam abertos.

Próximo incremento alinhado: auditorias globais e reconciliação de E2, reutilizando fontes e cobertura completa do manuscrito (o mapa não é essa auditoria). Depois modos de colaboração operacionais/reuso de E4 e conclusão do impacto/backfill/censo/fence/UI e portabilidade editorial .writer de E5. Não substituir restauração editável do processo por arquivo histórico apenas. Aumentar cobertura com testes de comportamentos reais ao implementar; nenhum limite foi reduzido.

## Checkpoint posterior — auditoria global da arquitetura

Objetivo ativo, 0/5 etapas formalmente encerradas. Principal original limpa em b9fc03c,
ancestral de HEAD da worktree codex/producao-literaria. Sem commit, push ou deploy.

- Novo contrato: `03-auditoria-global.md`. Auditoria opt-in de livro inteiro percorre
  contrato/planos/atos/capítulos/cenas/arcos/eventos/marcos/vínculos/controle. Segmenta e
  reconfere cada fonte antes de liberar síntese; não converte intenção em fato. Prévia e
  censo sem provedor, sem cota IA, sem claims de leitura do manuscrito ou corpos de lore.
- Novos módulos: literaryArchitectureSources e literaryIntegrationRequestRead.
  Integração/recheck/findings usam autorização compartilhada. Inventário privado
  literaryIntegrationArchitecture, bloqueado nas Rules e incluído na exclusão órfã.
  Sucessor preserva audit/escopo/cobertura. 414 ações no contrato por setor.
- Servidor dirigido 61/61; frontend/roundtrip18/18; Rules SDKdeny1/1 no emulador demo;
  sintaxe563módulos. Navegador inicial3/6 expôs sobreposição móvel: produção ganhou
  espaço final de rolagem e botão de fonte quebra texto. Repetição6/6 desktop/mobile320
  nos três temas, capturas inspecionadas. Build final aprovado (type/bundle/smoke), formatação global/skills/arquitetura/docs/styleguide
  aprovados; lint global38partições terminou0 com dois avisos em LiteraryFindingDecisionPanel
  (fast refresh/ref cleanup), zero erros. Todos os processos desta rodada estão encerrados. Logs prefixo
  writer-literary-architecture- em TEMP; build-final e lint. Último gate global5279/86,02%
  continua anterior ao mapa e auditoria; não é prova de snapshot atual nem gate verde.
- Teste roundtrip descobriu mock de transporte limitado ao planningApi: agora seleciona
  handler dos setores reais pelo contrato (advance pertence a generationApi).
- Pendências E2: alvos de reconciliação compostos/estruturais e marcos, alvos da síntese
  final e vínculos entre volumes. Depois E4 modos operacionais/contínuos/reuso e E5
  inventário/backfill/fence/UI de impacto e portabilidade editorial .writer editável.
  Não fechar etapas com testes dirigidos nem substituir restauração por arquivo histórico.

## Checkpoint posterior — reconciliação estrutural E2

Objetivo ativo, 0/5 etapas formalmente encerradas. Principal original limpa e HEAD da
worktree literária em b9fc03c na conferência atual. Sem commit/push/deploy. As anotações
anteriores sobre falta de alvos estruturais e alvos da síntese são substituídas por este bloco.

- Novo contrato `04-reconciliacao-estrutural.md`. `literaryArchitectureProtocol.mjs` define
  identidade composta canônica de família/arco/ID. FindingTarget kind architecture tem
  proofKind próprio: mesma origem nativa, hash semântico diferente e SourceLink exato de
  sucessora global done/verificada. Metadados de capítulo composto/cena/arco/evento/marco/
  vínculos/controle não herdam prova de prosa. Contrato/planos mantêm revisão canônica.
- `getLiteraryFindingContext` agora pagina 10 registros do inventário realmente lido,
  inclusive na síntese final. Não há ação/coleção/índice novo: 414 ações permanecem.
  UI carrega mais destinos sem perder justificativa/seleção, distingue arco nos marcos,
  mostra destino por extenso e filtra sucessoras pelo audit. Ref cleanup e fast refresh
  corrigidos sem ignore; rótulos compartilhados ficam em model/finding.ts.
- Impacto conhece kind architecture e scheme architecture-source; identidade/versão não
  viram prova de correção. Projeção liga ao capítulo/cena/ato/arco/evento/marco nativo por
  composição; links/controles mantêm contenção de livro enquanto E5 não fecha topologia.
- 114/114 backend (integração/findings + todos literaryImpact*.test.mjs), 26/26 frontend
  em cinco arquivos, 12/12 Chromium (auditoria+reconciliação, três temas, desktop/mobile320),
  build/type/smoke e lint dirigido sem erros/avisos. Roundtrip perde e recupera respostas
  da decisão e da confirmação sem repetir revisão/débito nem alterar a prosa.
  Logs prefixo writer-literary-reconciliation- no TEMP; consultar relatório de validação.
- Gate global5279/86,02% continua ANTERIOR a mapa/auditoria/reconciliação; não reapresentar
  como prova atual, não reduzir thresholds e não declarar validate verde. Sem entregas final.

Próximo: vínculos entre volumes com identidade de livro/unidade e revisão final dos critérios
E2. Depois modos de orientação/supervisão/contínuo delimitados em E4, incluindo paradas por
conflito/gate, e E5 inventário/backfill/fence/UI do impacto e portabilidade editorial .writer
como nova cópia privada editável. Não reduzir o objetivo às verificações dirigidas atuais.

## Checkpoint posterior — vínculos entre volumes E2

Objetivo ativo; nenhuma etapa formalmente encerrada. Worktree literária e principal local
continuam em b9fc03c na conferência; original limpo. Sem commit, push ou deploy.

- Novo `literaryVolumeProtocol.mjs`, puro: identidade canônica [livro,tipo,ID]. Referência
  volumeUnit é apenas source e seu scopeId coincide com o livro codificado. Mantém locais
  intactos; não amplia implicitamente ref.chapter.scopeId para outros livros. Livro e
  unidade de origem precisam ser próprios e ter o mesmo nascimento capturado.
- `listLiteraryVolumeBooks` e extensão de listLiteraryReferences (sourceBookId/unitKind)
  em planningApi: 415 ações. Fontes entre volumes usam leitores de corpo nativos em
  literaryAIContext; capítulo composto exige cenas. Scope/origem preservados em escrita,
  geração, SourceLinks e recheck. Findings não oferece fonte externa como correção local.
- Impacto mapeia volumeUnit para nó nativo do livro de origem, evitando um nó desconectado;
  o verificador permite somente prova reference nessa leitura externa, reautorizando a
  origem pelo leitor explícito. Sem alegar leitura de manuscrito com prova de metadata.
- UI Planejamento consulta volumes/unidades por páginas, mantém referências e campos e
  força papel source. Sessão é vinculada a autor/livro; resposta tardia da conta anterior
  é descartada. Rótulo de fonte sabidamente indisponível não cai no cache antigo.
- Bug encontrado pelo teste held-provider: captura final após revogação deixava pedido
  running. literaryAI agora retorna/persiste stale sem expor resultado; replay não gera
  outra vez. Não mudou créditos nem retenção de prompts.
- Evidência: 316/316 backend (todos literary* + domainCallable/SDK); 81/81 frontend em
  17 arquivos; 6/6 Chromium temas+desktop/mobile320, capturas inspecionadas. Build/type/
  smoke final aprovados, lint dirigido zero erros/avisos após retirar import não usado na
  fixture, sintaxe565 módulos. Logs prefixo writer-literary-volumes- no TEMP, detalhes no
  relatório de validação. Não atribuir a estes incrementos o validate antigo5279/86,02%.
- Contrato: 05-vinculos-entre-volumes.md; AGENTS, architecture, literary-production e README
  atualizados. Sem coleção/índice/Rule/dependência nova. Não emitir entrega final antes
  do gate global e de fechar os requisitos funcionais restantes.

Próximo funcional: modos orientação/supervisionado/contínuo delimitados de E4, com fases
operacionais, paradas por conflito/gate e retomada/reuso. Conservar auditoria final dos
critérios E2 antes do encerramento formal. E5 ainda exige inventário/backfill/fence/UI
integral de impacto e portabilidade editorial .writer em nova cópia privada editável.

## Checkpoint posterior — primeira versão contínua delimitada de E4

Objetivo integral ativo; cinco etapas ainda abertas. Principal original limpa em b9fc03c,
mesma base incorporada nesta worktree. Sem commit, push, merge de volta ou deploy.

- literaryDraftExecution.mjs é contrato puro de modo supervisionado/contínuo, com limites
  totais positivos de aplicações e créditos. Não representa todos os modos de E1/E4.
- DraftJobs mantém execution, controlRevision, paused, chargedCredits e executionStop.
  ContinuousFrame reutiliza acceptLiteraryDraftScene com operação determinística;
  autorização, fonte atual, orçamento, manuscrito, crédito e recibos são atômicos.
- setLiteraryDraftExecution (planningApi, 416 ações) usa CAS e recibo idempotente em
  literaryOperations. Replay consulta o estado atual sem reaplicar pausa antiga. Recibo
  inclui nascimento do livro; recuperação cliente é draftExecution, somente metadados.
- Pausa permite terminar geração já registrada, sem aplicação automática. Mudança de
  revisão durante o provedor invalida a autorização antiga. Saldo/conflito/texto existente
  param o fluxo; adotar texto existente continua explícito. Fim preserva primeira versão.
- LiteraryDraftPanel isola sessão por autor/livro/capítulo, conserva controle incerto e
  permite recuperá-lo após cancelamento. Respostas antigas não substituem estado atual.
  Limites podem ser ampliados explicitamente sem zerar os gastos anteriores.
- Evidência final: backend325, frontend85 em17 arquivos, navegador6 (temas/desktop/móvel),
  build/type/smoke, lint dirigido e sintaxe566 aprovados. Capturas inspecionadas. Logs e
  limites da validação no relatório. Sem nova aprovação global/Rules/infraestrutura.
- Contrato06, README, architecture, literary-production e regra curta de AGENTS atualizados.
  CLAUDE continua apontando AGENTS. Sem nova coleção, índice, Rule ou dependência.

Próximo: coordenação operacional de fases e orientação em E4, com contrato versionado
vinculado a E1; revisões estrutural/prosa, versão revisada, passagem entre capítulos/atos
com reconciliação e reuso. Conservar auditoria de aceite E2 e pendências de E5:
inventário/backfill/fence/UI de impacto e restauração .writer como nova cópia privada
editável. Gate global histórico5279/86,02% não certifica estes incrementos; não reduzir
thresholds nem emitir entrega final antes do fechamento funcional e da validação global.

## Checkpoint posterior — contrato operacional e orientação da escrita E1/E4

Turno com progresso funcional. Objetivo integral ativo, nenhuma etapa formalmente fechada.
Principal original limpa em b9fc03c na conferência; worktree literária permanece nessa
base com as alterações locais preservadas. Sem commit, push ou deploy.

- Novos literaryCollaborationProtocol.mjs/.d.mts (puros) e literaryCollaboration.mjs
  (leitor privado por projeção). Política opcional version1/mode guidance|supervised|
  continuous em EditorialContract; defaults supervisionado sem inferir o texto livre.
  Canonicalização omite campo ausente, preservando fingerprints/replays antigos.
- Draft.source lê policy/revisão, captura vínculo nos jobs novos e inclui no proof quando
  configurada; current/start/setExecution conferem compatibilidade. Contínuo exige modo
  continuous E1 e autorização delimitada por job. Guidance recusa registrar redação.
- Prose captura vínculo/revisão nos pedidos; fresh reconfere e views informam modo.
  Guidance permite análises/sugestões de texto existente, mas não draftScene/application.
  Aplicação confere policy em preflight e no commit final. Receipt replay anterior a
  mudança de modo retorna o recibo sem regravar/debitar. Escrita manual nativa permanece.
- ContractPanel salva/mostra modo no histórico/comparação e isola sessão por autor/livro.
  Production recebe só escolha persistida e passa a Preparation/Draft. Prose.sourceInfo
  traz modo atual e abre análise estrutural em orientação. Recuperação do mesmo início
  segue acessível mesmo se o modo mudou enquanto a resposta era incerta.
- ContractInference recusa policy no output do provedor. assistedBook.generatedProposal
  descarta policy de contrato gerado; escolha autoral explícita continua pelo contrato.
  Composição editorial inclui modo como dado, nunca concessão de ferramenta/débito.
- Evidência: 331 backend literário/roteamento, 37 criação assistida, 94 frontend/18 arquivos
  (inclui cinco testes de recoveryStorage já existentes), 12 Chromium temas/desktop/móvel,
  build/type/smoke, lint dirigido corrigido e sintaxe568 aprovados. Capturas inspecionadas.
  Teste de disputa reforçado para mudar modo APÓS commit real do histórico e ANTES da
  aplicação, sem depender da contagem fixa de transações. Logs no relatório da pasta.
- Docs07, README, architecture, literary-production e regra AGENTS atualizados; CLAUDE
  continua apontando AGENTS. Nenhuma coleção/Rule/índice/dependência/action nova:416 ações.

Próximo funcional E4: coordenar preparação/gate → primeira versão → revisão estrutural e
prosa → versão revisada, com aceites supervisionados e autorização contínua de fases,
condições de passagem entre capítulos/atos e reconciliação/reuso após alterações. Reusar
literaryPreparation, literaryDrafting, literaryReview (já percorre duas camadas) e
literaryMilestones: seus métodos existentes ainda são conduzidos por painéis separados.
Não apresentar o modo operacional deste incremento como coordenador já completo.
Conservar auditoria de E3 em todas as entradas/modo, aceites E1/E2 e o fechamento E5 de
impacto (inventário/backfill/fence/UI) e .writer editável como nova cópia privada.
Global validate histórico5279/86,02% não aprova este estado; thresholds preservados e sem
entrega final em docs/entregas antes de fechar os requisitos e obter o gate global.

## Checkpoint posterior — coordenador editorial privado de capítulo (E4)

Progresso funcional, objetivo integral ativo e 0/5 etapas formalmente encerradas.
Principal incorporada e original limpa em b9fc03c na conferência após os testes.

- literaryWorkflow e literaryWorkflowContracts compõem os escritores nativos de
  preparação, redação, revisão e marcos. Seis ações nos setores existentes; registro422.
  Coleção privada literaryWorkflowJobs, SDK bloqueado e limpeza pelo inventário de cenas.
- guidance, supervised e continuous respeitam E1 e decisões por fase. Limites agregados
  de passos, aplicações e créditos; nenhuma autorização automática por registrar o ciclo.
- Preflight expectedScopeToken fica congelado no start. Registro em duas transações,
  com confirmação do nascimento nativo e recuperação explícita confirmRegistration/cancel.
  expectedOriginToken acompanha todos os passos/controles. Ator e nascimentos de
  livro/capítulo/job impedem reaproveitar grants ou recibos após recriação.
- Marcador completo do filho e busyStep recuperam exatamente a operação anterior, sem
  consumir a próxima unidade manual ou de preservação. Pausa/cancelamento coordenam os
  filhos atomicamente. Mudança de contrato/modelo/origem interrompe, sem rearmar execução.
- Reconciliação de redação conserva despesas; revisão conserva primeira versão original.
  Mudança real de prosa exige revisão completa; alteração só de histórico reutiliza a
  revisão aceita e reconfere preservação, sem nova análise ou débito.
- Painel/serviço/journal metadata, checkpoints nativos fixados por ID e formulários
  preservados ao alternar detalhes. Cancelamento funciona com pausa pendente; respostas
  antigas não repintam o estado. Criação de novo ciclo é decisão separada.
- Testes finais dirigidos:375 backend,105 frontend/19arquivos,18 Chromium,32 Rules shard;
  build/tipos/smoke, lint e sintaxe570 aprovados. Capturas finais claro desktop e sépia
  móvel inspecionadas. Logs e limites da evidência no relatório de validação desta pasta.
- Docs08, README, architecture, literary-production e regra AGENTS atualizados.

Próximo requisito funcional: passagens entre capítulos e atos, com condições nativas,
integração e limites agregados. Depois concluir auditorias E1/E2/E3/E4 e E5 de impacto
(inventário/backfill/fence/UI) e .writer editável como nova cópia privada. Ciclo de um
capítulo não encerra E4. Gate global histórico86,02%<90 permanece não aprovado; não emitir
entrega final em docs/entregas antes do fechamento funcional e da validação global.
Sem commit, push, integração de volta à principal ou deploy.

Conferencia final do ciclo: check:architecture, check:docs, check:skills e
check:styleguide aprovados; formatacao do conjunto literario e git diff --check
aprovados. Nenhum arquivo executavel mudou na formatacao final. Manifests e locks
permanecem sem alteracoes; principal original limpa no mesmo b9fc03c.

## Checkpoint posterior — núcleo servidor de condições de passagem E4

Turno com progresso funcional; objetivo integral ativo, 0/5 etapas encerradas. Principal
original limpa e base b9fc03c conferidas novamente, sem manifests/locks alterados.

- Novos literaryWorkflowPassage.mjs, literaryReviewSource.mjs e
  literaryWorkflowOrigins.mjs. Leitor de revisão extraído sem mudar algoritmo, com
  reexport anterior preservado; contratos e runtime do ciclo usam o mesmo leitor.
- scope/start aceitam passage opcional: previousWorkflowId/actIntegrationId. Preflight
  e registro congelam a prova nativa; ausente/null preserva os fingerprints existentes.
- Predecessor exige ciclo original done do mesmo ator/livro/contrato, ordem nativa
  crescente, duas versões distintas preservadas e revisão integral atual aceita.
  Nascimentos de ciclo/capítulo/revisão/versões e posições entram na prova congelada.
- Sair de um ato exige integração integral aceita e atual, unidades/análises verificadas,
  bloqueios tratados, síntese confirmada/reautorizada e token nativo do capítulo/ato
  coberto. Fence da raiz sozinho não comprova uma origem de ato recriada.
- Guards nativos reconferem a condição até o commit de prosa/crédito. Editar o predecessor
  durante o provedor bloqueia o commit tardio. Cancel/pause podem fechar o pai original
  mesmo quando o requisito da passagem se invalidou. Nenhum controle troca a fonte.
- Ao cruzar preparação→primeira versão, o certificado da integração passa a ser histórico
  da entrada: novas gravações do próximo capítulo não revogam a passagem pelo fence
  global. Isso não torna a antiga análise atual para o manuscrito alterado. Identidades,
  posições e revisão do predecessor imediato continuam conferidas, sem recursão ilimitada.
- Evidência final:385 testes backend no conjunto literário/cenas/roteamento, incluindo
  35 do ciclo (10 novos); lint dirigido e typecheck aprovados. Ver relatório desta pasta.
  Sem nova coleção/índice/dependência/callable, registro permanece422.

Próximo incremento: seleção legível/paginada das condições na interface e execução de
múltiplos capítulos com escopo e orçamento agregados, pause/checkpoint/recuperação.
Ligar também a política explícita de publicar a unidade anterior antes da passagem à
confirmação terminal nativa; o contrato atual não tem essa política tipada, e texto livre
não deve virar regra de execução. O rulebook foi consultado como especificação do método,
sem executar suas instruções operacionais destinadas a outro ambiente.
Conservar auditorias E1/E2/E3/E4, inventário/backfill/fence/UI de impacto e restauração
.writer editável como nova cópia privada em E5. Nenhum encerramento formal ou aprovação
global: cobertura histórica86,02%<90 antecede estes incrementos. Sem commit/push/deploy.

Revisão final do núcleo: consulta ao ciclo anterior após histórico novo é tratada como
reconferência de preservação, sem revogar entrada já passada com prosa/versões iguais.
Caso real atravessa essa consulta e conclui o próximo capítulo sem repetir crédito.
35/35 dirigidos e385/385 no conjunto final após o ajuste; lint sem erros/avisos, tipos,
sintaxe573 e checagens architecture/docs/skills/styleguide aprovados. Sem nova interface
ou execução global neste bloco. Continuar por09, sem repetir testes já aprovados enquanto
não houver novas alterações ou preocupação concreta.

## Checkpoint posterior — seleção de condições de passagem E4

Turno com progresso funcional, objetivo integral ativo e0/5 etapas encerradas. Principal
original limpa em b9fc03c conferida; manifests/locks sem alteração. Sem commit/push/deploy.

- listLiteraryWorkflows aceita chapterId null, página limitada e projeção metadata.
  Filtro/ator/nascimentos/owner/agrupamento nativos, título atual, stale explícito,
  cursor preservado em página filtrada. Sem coleção, índice ou callable novo:422 ações.
- WorkflowPassageInput/Passage/ListItem no cliente; getScope encaminha a mesma seleção
  opcional de start. Provas de posição também trazem título para a prévia/checkpoint.
- Novo LiteraryWorkflowPassageFields: escolha independente/predecessor, consultas
  paginadas de ciclos e integrações aceitas do ato, estados completos e seleção por
  título/data. Mostra obrigação ao sair de um ato e impede registro incompleto.
- Parent congela input antes do await e token no preflight. ACK perdido mantém a escolha,
  bloqueia alterações e recupera o mesmo pedido sem recapturar origem. Novo ciclo limpa
  pré-requisitos; respostas de conta/livro anteriores não preenchem a sessão nova.
- Testes387 backend (37 ciclo),109frontend/19arquivos (12 painel); roundtrip real percorre
  dois capítulos e recupera ACKs após aplicação e registro de passagem sem duplicar gasto.
  12 Chromium (temas/desktop/móvel320) e6 complementares para captura da seleção;
  capturas desktop claro/móvel sépia inspecionadas. Build/tipos/smoke e lint aprovados.
  Logs detalhados no relatório; navegador usa fixtures, não produção.
- Docs10,09, README, architecture e literary-production atualizados para distinguir
  seleção disponível de execução coordenada ainda pendente.

Próximo funcional: coordenador de múltiplos capítulos com escopo explícito e orçamento
agregado, pause/checkpoint/recuperação, sem iniciar unidade além da seleção autorizada.
Ligar política tipada de publicação anterior obrigatória à confirmação terminal nativa;
E1 ainda não tem essa política. Conservar auditorias E1/E2/E3/E4, fechamento do inventário/
backfill/fence/UI de impacto e .writer editável como nova cópia privada em E5. Não usar
suítes dirigidas como aprovação do gate global histórico86,02%<90, que antecede os
incrementos. Nenhuma execução global de validate ou Rules neste bloco.

Conferencia final do incremento10: check:architecture, check:docs, check:skills e
check:styleguide aprovados; formatacao de todos os arquivos tocados e git diff --check
aprovados. Nenhum arquivo executavel mudou durante o fechamento da documentacao.

## Checkpoint em fechamento — núcleo nativo agregado e nova principal1bc6ba8

Turno com progresso. Novos literarySequence.mjs, literarySequenceContracts.mjs e
literaryExecutionContracts.mjs, com hook interno nos ciclos e ledger no commit de prosa.
Coleta/Rules incluem literarySequenceJobs; core ainda sem registro HTTP ou UI,422 ações.
Doc11 detalha implementado e próximo passo. Fixtures de ciclo foram compartilhadas em
functions/test/helpers/literaryWorkflowFixtures.mjs; os casos anteriores foram mantidos.

Durante a conferência, master avançou externamente de b9fc03c para
1bc6ba8b89eef425886fa50674b68977b6c24129. O trabalho foi preservado no stash
06deab0df63d5a4444df66fd4a79eaaa2defff67 (mantido; não dropado), principal incorporada por
fast-forward, stash aplicado e seis conflitos resolvidos. Mantidos onboarding/dock
persistente da principal, perfil opcional na criação e o guia editorial inspecionável,
com mensagens/ações limitadas à prova reautorizada. Conflitos resolvidos sem commit.
Checkout original tinha docs/deployment.md, docs/first-use.md e a entrega
2026-11-03-deploy-primeira-experiencia.md não commitados, preservados sem copiar para cá.

Pós-incorporação:451 backend dirigidos (inclui14 do núcleo,37 ciclos, cenas/roteamento,
assistente da página e criação assistida),191frontend/29arquivos,72 Chromium,41Rules
no shard9/16, build/tipos/smoke, lint e sintaxe576 aprovados, todos com exit0 confirmado. Evidência401backend/109frontend/32Rules e build antes
de1bc6ba8 é anterior à incorporação e não substitui a verificação desse novo estado.

Próximo funcional: driver serial de sequências por operação/recibo, registro público por
setor, recovery metadata e UI, sem rearmar filhos/parentes recriados nem ampliar modelo/
fases/orçamento. Ligar política tipada de publicação prévia; preservar todo o escopo de
E1/E2/E3/E4 e E5 impacto/restauração privada. Objetivo permanece ativo; gate global
não aprovado e sem integração de volta, commit literário, push ou deploy nosso.

Fechamento do incremento11 na base1bc6ba8:72 casos Chromium percorrem ciclo/passagens,
onboarding e nove jornadas de criação, nos três temas e desktop/móvel. Capturas novas
claro desktop e sépia móvel inspecionadas; a barra persistente da principal foi mantida.
O shard9/16 atual tem41 testes (o32/32 anterior pertencia à baseb9fc03c). Logs atuais
writer-literary-sequence-main-{server,client,build,browser,rules,lint,syntax}.log em TEMP.
Nenhum desses resultados é validate global; cobertura histórica não foi recalculada.
Reserva/stash06deab0 preservada, seis conflitos encerrados, manifests/locks sem alteração.
Original da principal continua com os mesmos três arquivos documentais próprios alterados.
ADR0274 e docs11 descrevem o hook/ledger e a fronteira ainda interna; nenhum endpoint
ou UI de sequência disponível. Continuar pelo driver serial e recovery metadata antes
de expor; controles/fechamento do core ainda precisam de recibos idempotentes por operação.

Conferencia estatica final na base1bc6ba8: architecture/docs/skills/styleguide
aprovados, formatacao dos arquivos tocados e git diff --check aprovados; nenhum
conflito pendente. Nenhum executavel mudou depois dos testes finais dirigidos.

## Checkpoint posterior — driver serial interno e outcomes de sequência E4

Turno com progresso funcional. Objetivo integral ativo,0/5 etapas encerradas, base1bc6ba8
preservada. Novo literarySequenceDriver.mjs compõe uma ação identificada por chamada;
sem inclusão em FunctionDomains/DomainServices, registro permanece422 ações.

- Antes de produzir, busyStep/recibo running em literaryOperations. Fases de leitura
  prepareWorkflow/inspectWorkflow podem ser refeitas até o congelamento; depois dele,
  replay usa o wire exato. IDs filhos incluem nascimento e passo original.
- Recuperação após registro/prosa/fechamento não consome cena ou capítulo seguintes.
  Fechamento e recibo completedUnit compartilham commit. Duplicatas com provedor pendente
  não duplicam aplicação; outcome confirma comando, não infere prosa aplicada.
- Controles recebem operationId no wrapper, com decisão/recibo atômicos. Pausa/cancel
  supersedem o passo, fecham filhos e não rearmam respostas antigas. O núcleo também
  limpa ticket ao pausar diretamente. Confirmar start conserva sua revisão original;
  cancelar registro inicial tem outcome superseded, não ativação confirmada.
- Driver propaga limites explicitamente ampliados pelo autor sem resetar consumo;
  espera decisão supervisionada e integração nativa na fronteira de ato. Não troca
  relatório dentro de operação. Não inicia unidade além da seleção.
- Hooks internos beforeActivate/beforeAdvance/beforeControl nos ciclos e prepareCommit
  no núcleo guardam o mesmo passo. Nenhum desses hooks entra em DTO HTTP.
- Fixtures de sequência compartilhadas em helpers/literarySequenceFixtures.mjs, casos
  nativos anteriores preservados.18 testes do driver aprovados; backend final469/469,
  frontend literário109/109. Logs writer-literary-sequence-driver-{final,server-final,
  client,lint-final,syntax}.log. Lint aprovado; sintaxe aprovada: 577 módulos (exit 0).

Próximo: cliente tipado, diário metadata e descoberta paginada, consulta/outcomes no
RecoveryPanel, UI de seleção/limites/consentimento, então registro literal por setor.
O driver ainda não está disponível via HTTP ou interface, não declarar execução de
sequência entregue no produto. Conservar política tipada de publicação prévia e todos
os aceites E1/E2/E3/E4 e E5 de impacto e restauração .writer como nova cópia privada.
Validacao global/cobertura pendentes; sem commit, push, integração de volta ou deploy.

### Validação posterior na base consolidada

`npm run validate` executado na base 1bc6ba8: 5.357 testes frontend/417 arquivos
aprovados, mas exit 1 por cobertura de funções 86,23% < 90%. Métrica frontend,
não Cloud Functions; não reduzir threshold. Os checks e lint integral passaram.
Build separado aprovado com typecheck/bundle/smoke. Setup/Functions executados
separadamente com exit 0: 116 testes de setup, 5.374 de Functions e sintaxe dos
577 módulos aprovados. Logs em
%TEMP% com prefixo writer-principal-integrada-. Principal preservada com seus três
arquivos próprios; nenhum conflito, commit, push ou deploy. Próximo trabalho funcional
continua sendo a ponte cliente/recuperação/UI do driver, sem encerrar E1–E5.

## Checkpoint 13 — cliente e recuperação de sequência

Classificação da rodada anterior: progresso verificável (integração da principal e
validação integral, com reprovação real de cobertura). Esta rodada acrescentou cliente,
diário metadata, consulta/retomada e descoberta nativa; objetivo ativo, sem encerramento.

- literarySequenceService define oito métodos destinados ao driver: scope/start/get/
  operation/list/advance/resumeOperation/control. Nenhum foi incluído em functionDomains,
  domainServices ou exports HTTP. O catálogo atual continua 422; a futura composição
  dos oito métodos deve chegar a 430 se não houver outra alteração de catálogo.
- Input e entrada metadata de recuperação são capturados antes de await. Diário versão
  1 anterior preservado; kind sequence exige method de start/advance/control e só guarda
  conta/livro/IDs/método/revisão/hash. Sem prosa, instrução, geração ou grant no storage.
- requestHash liga intenção cliente ao fingerprint/recibo dos três comandos e volta no
  outcome. Verificador exige esse hash, método, ID e revisão original; um ACK de outra
  intenção não retira dívida. Sem hash mantém replay nativo antigo, sem confirmar diário novo.
- Retomada aceita só IDs e usa request privado registrado, reautorizando origem/birth e
  validando busyStep/fingerprint. Não cria pedido ausente, não rearma superseded e não
  troca relatório de ato. Consulta não produz. Não existe reenvio automático ao abrir.
- LiteraryRecoveryPanel agora tem sessão por conta/livro, consulta específica e segundo
  botão de retomada explícita para running. Controle de sessão após query impede RPC
  posterior de sessão antiga. Sem inferir texto aplicado por confirmed.
- listLiterarySequences pagina metadata com cursor da página varrida, inclusive vazia
  após filtro; reautoriza bookBirth/ator e marca job recriado stale. Não lê instrução,
  geração ou corpo. A listagem não substitui a revalidação completa ao abrir o job.
- Provas: 76 testes nativos, 123 da feature (antes do último caso adicional), 10 clientes
  finais, seis Chromium (3 temas/desktop/320px), typecheck e lint dirigido aprovados.
  Totais não devem ser somados. Relatório e logs writer-literary-sequence-bridge-*.
  Browser encerrado pelo Playwright; sem servidor de prévia próprio persistido.

Próxima ação funcional: criar LiterarySequencePanel e aba em LiteraryProductionPanel,
com seleção nativa ordenada, consulta/paginação, prévia/consentimento de escopo, limites
agregados/modo/fases e passagem entre capítulos. Compor o checkpoint ativo com controles
manuais e manter avanço automático exclusivamente pelo driver pai; adaptar pin do
LiteraryWorkflowPanel sem permitir atalhos sobre filhos. Acrescentar descoberta/retomada
mesmo sem diário local (outro dispositivo), preservando a referência do pedido original.
Então registrar literalmente os oito métodos nos setores corretos, com gerador apenas
em advance/resumeOperation, testes reais de roteamento e UI. O serviço cliente ainda
não é utilizável contra Functions enquanto esse registro não existir.

Preservar também política tipada que exige publicação prévia quando o autor escolher,
aceites E1–E4, inventário/fence/UI de impacto e .writer como nova cópia privada em E5.
A cobertura global anterior foi 86,23% < 90%; não recalculada neste incremento, não reduzir
threshold e não declarar o gate aprovado. 0/5 etapas formalmente fechadas, sem commit,
push, integração de volta à principal ou deploy. Principal segue com três arquivos
próprios do autor; preservar. Worktree literária permanece na base 1bc6ba8.

Fechamento estático 13: arquitetura/docs/skills/styleguide/formato e git diff --check
aprovados, lint final aprovado. Registro puro confirmado 422 ações; nenhum novo setor
foi exposto. Todos os handles de testes foram conferidos terminais. A próxima rodada
deve avançar a UI de seleção/consentimento e o roteamento, evitando repetir validação
integral sem mudança funcional que a justifique.

## Checkpoint 14 — sequência utilizável na interface e setores

Rodada anterior classificada como progresso; esta rodada implementou UI e registro,
sem concluir objetivo ou pausar. Base literária e master continuam 1bc6ba8.

- LiterarySequencePanel compõe seleção paginada, reordenação/retirada, prévia nativa,
  consentimento, limites agregados, permissões de fases/passagem e avanço separado.
  Até 25 capítulos por execução, sem tamanho fixo para o livro. Modo salvo vem do
  servidor. Gerar/analisar não debita; aplicação plataforma custa 1 crédito.
- Loop cliente para em motivo/resultado pendente e usa nonce/revisão/origem por RPC.
  O wire de um passo incerto, inclusive relatório de ato, não é refeito. Pausa/cancel
  invalidam o loop local. Cancel consulta revisão fresca, preservando a origem observada.
- Nova aba em LiteraryProductionPanel, com dirty/pending no guard e montagem persistida
  ao trocar áreas. Ciclo gerenciado oculta registro/seleção de jobs, avanço e orçamento
  próprios; mantém decisões autorais/reconciliação e aceites explícitos das cenas.
- Native Draft/Review recebem frames coordenados. O teste supervisionado detectou UI
  antiga após proposta pronta: corrigido com adoção assíncrona cancelável, guard de
  modal/pedidos e contador accepted monotônico. Não desfaça essa proteção nem resete o
  painel inteiro por revisão, para não perder confirmação/recibo em andamento.
- recoverLiterarySequenceStep suporta outro dispositivo: consulta outcome autorizado,
  registra somente metadata/hash nativos e retoma o mesmo ticket. Confere conta/livro/
  sequência local e sessão após await; sem hash válido não inventa correlação ou wire.
- functionDomains/domainServices registram seis ações em planningApi e advance/resume
  em generationApi. Catálogo 430, 16 setores, nenhuma Function individual nova. Hooks
  do núcleo, completeLiterarySequenceChapter e fábricas continuam inalcançáveis.
- Rules ganharam deny explícito de literarySequenceJobs; já havia bloqueio implícito
  e inventário em sceneJobs. Shard 9/16 com dez arquivos passou 41 testes. Não declarar
  suíte completa de Rules. Nenhuma nova coleção/índice/dependência.
- Provas finais: 85 nativos+roteamento/SDK, 139 frontend em21 arquivos, 12 Chromium
  (sequência/recuperação em3 temas e320px; sequência6 reconferidos após quebra do botão),
  41 Rules, lint final. UI real+handlers+serviços nativos testaram contínuo (2 capítulos,
  3 aplicações/créditos) e supervisionado (1 capítulo,2 aplicações/créditos), sem dívida.
  Percursos longos com timeout local20s, não limite produtivo; todas as asserções mantidas.
  Build/types/smoke final aprovado (exit 0, build-verified.log).

Próximo incremento funcional: **política tipada de publicação anterior**, em contrato
versionado E1, contexto/entrevista aplicáveis e consumo nativo nas passagens E4. Não
inferir autorização de texto livre. Quando escolhida, exigir publicação nativa confirmada
da unidade/versão anterior antes de registrar/entrar na próxima; registrar parada clara
e permitir recuperar/cancelar sem publicar silenciosamente. Preservar integração de ato
como condição própria. Depois auditar os aceites integrais E1–E4 e completar E5:
inventário/backfill/fence/UI de impacto e .writer restaurado como nova cópia privada,
sem grants operacionais. Plano integral continua autoridade, 0/5 etapas formalmente fechadas.

Não reexecutar validate global a cada incremento sem justificativa; última medição
86,23% <90% antes de13/14, ainda não aprovada. Não alterar thresholds nem declarar
publicação em produção. Sem commit/push/merge de volta/deploy. Checkout principal recebeu
mais alterações não commitadas do operador durante esta rodada, inclusive vitest.config,
AssistantDock, workspace e testes; preservar todas e conferir estado/HEAD novamente antes
da integração. Não copiar esses arquivos automaticamente para esta worktree.

Fechamento terminal 14: 139/139 frontend, 85/85 backend dirigido e 41/41 Rules shard9/16;
12/12 Chromium na rodada conjunta, sequência6/6 reconferida e imagem móvel inspecionada.
Lint e build/typecheck/smoke atuais aprovados; arquitetura/docs/skills/styleguide/formato
aprovados, sem conflitos ou mudança de dependências. Todos os processos de testes
conhecidos chegaram a terminal. Não há preview próprio mantido. Principal e worktree
HEAD reconferidos em1bc6ba8, com alterações paralelas do operador preservadas na principal.
Não encerrar o objetivo; próxima ação funcional continua a política tipada E1/E4 acima.

## Integração solicitada antes dos testes finais — 2026-11-03

Master avançou durante os testes para 296261c2ba5a27286a2824bafb15b3f484ac8538.
Worktree literária recebeu fast-forward e reaplicação do stash de segurança
97c2c620713386ff671c73d166ad8da124a3d95e, sem conflitos; 268 arquivos novos
reconferidos por hash, todos idênticos. Não remover esse stash nem os anteriores.
Não modificar o checkout principal, que segue sob trabalho paralelo do operador.

A rodada anterior de validate terminou em sete timeouts/4 arquivos e cobertura de
funções frontend 86,32% <90%, em 1bc6ba8. Setup116/Functions5382/sintaxe577,
Chromium literário60 e build passaram nessa base anterior. Rules completa foi
interrompida para trocar a base, sem resultado final. Não transportar esses números
como aprovação da base nova. Detalhes no registro de validação local.

Nova execução exclusiva de npm run validate em andamento na base296261c, log
%TEMP%/writer-literary-master-296261c-validate.log. Nenhum código funcional novo foi
feito nesta rodada. Após terminar, conferir falhas/cobertura, regressões afetadas,
build e UI; registrar resultados atuais e reconferir a principal. Não encerrar o
objetivo integral nem declarar as cinco etapas concluídas. A próxima unidade
funcional continua a política tipada de publicação e os aceites E1/E4, seguidos de E5.

### Segunda incorporação — base final e86a547

A principal avançou novamente, agora com ajustes visuais. HEAD literário recebeu
fast-forward para e86a547f9d30d615aafcf77ec163cdbe24be8f2b e reaplicação do stash
cba1ae4afb260eaa678ba912d4b50c729dd756bc, sem conflitos. Preservar esse stash e
97c2c620713386ff671c73d166ad8da124a3d95e e todos os anteriores. ReaderView CSS
foi combinada preservando os dois lados; conferir o diff, que contém só o guia local.

296261c terminou com frontend5396/5396 em420 arquivos e cobertura de funções86,32%
<90%. Os sete timeouts antigos desapareceram. Scripts116, regressãoFunctions17,
sintaxe577, build, Chromium60 e Rules41/shard9 aprovados, todos terminais. FullFunctions
5382 era da primeira base1bc6ba8; não declarar como suíte completa atual. Lint pegou
import duplicado pela reaplicação em adventureRestoreCallable; corrigido removendo
só a redundância, arquivo idêntico à principal e ESLint/node --check aprovados.

Em e86a547, lint/formato dos arquivos alterados e arquitetura/docs/styleguide passaram.
Frontend completo exclusivo em execução: session41352, log
%TEMP%/writer-literary-master-e86a547-coverage.log. Não executar outra suíte pesada
em paralelo até terminar. Depois reconferir build e UI literária, seleção do editor e
leitor afetados. Registrar a medição nova, terminar todos os handles e atualizar este
checkpoint. Fontes de Functions/Rules/scripts idênticas entre296261c e e86a547.
Nenhum incremento funcional novo, sem push/deploy/commit literário. Objetivo integral
continua ativo, 0/5 etapas fechadas; política tipada de publicação/E1/E4 e E5 pendentes.

### Último checkpoint — f1bbfed incorporado, verificações finais em execução

Suíte completa e86a547 terminou:5397/5397 testes,420 arquivos,1080,67s, sem falhas.
Cobertura funções frontend86,32% <90%; exit1 por esse gate. Demais métricas87,52/83/90,65.
Build e86 passou. Browser dessa base foi interrompido ao entrarem dois novos commits.

Base atualf1bbfed170901f5333320331f2ddc3cbfbb06567, fast-forward com stash
7619b4b5f0ab9ed9268ac4784039179a56dc93ce reaplicado, sem conflitos. Preservar todos
os stashes (inclusivecba1ae4afb260eaa678ba912d4b50c729dd756bc e97c2c620...). Alterações
novas: duas CSS, helpers/specs visuais/docs, um timeout de20→60s de criação de lore.
Produção.ts/.tsx, Functions, scripts e Rules idênticos entree86a547 e f1bbfed (git diff
--exit-code conferido). Não iniciar outra suíte completa sem mudança que a justifique;
medição globale86 deve continuar qualificada com sua base, não inventar uma medição nova.

Ativos (conferir até terminal antes de encerrar): build58116; testes afetados3719
(Vitest criação de lore + ChapterChatPanel + GhostSuggestion); Chromium70062
(literários9 specs,reader.publication,editor-adjustments,editor-workspace:243).
Logs%TEMP%/writer-literary-master-f1bbfed-{build,affected,browser}.log. Sem outro
runner próprio ativo conhecido. Browser anterior42501 foi encerrado pela árvore CLI
identificada antes de trocar arquivos; não contar parciais como rodada concluída.

Atualizar documentação com resultados finais, formato/docs/diff, terminar handles e
preservar alterações do checkout principal (docs/deployment,first-use e entrega própria).
Sem commit literário/push/deploy. Continuar objetivo integral após esta rodada, não marcar
complete:0/5 etapas formais, política tipada de publicação/E1/E4 e E5 ainda pendentes.

## Fechamento terminal — integração/testes em f1bbfed

Solicitação de incorporar a principal atendida: HEAD literário e master em
f1bbfed170901f5333320331f2ddc3cbfbb06567. Todos os stashes preservados. Checkout
principal continua com docs/deployment.md, docs/first-use.md e entrega própria do
operador; não alterar/copiar esses arquivos. Nenhum commit literário, push ou deploy.

Medição completa mais recente: e86a547 com alterações literárias locais,5397/5397
em420 arquivos,1080,67s; cobertura funções86,32% <90%, exit1. Código de produção
instrumentado não mudou de e86a547 a f1bbfed: CSS, helpers/specs, documentação e um
prazo de teste.mjs foram os deltas. Não anunciar medição global nova em f1bbfed.
Build f1bbfed e60/60 testes afetados passaram; scripts116, regressãoFunctions17 e
sintaxe577 e Rules41/shard9 pertencem à base296261c, com fontes idênticas em f1bbfed.
FullFunctions5382 era de1bc6ba8 e não foi repetido integralmente depois.

Browser ampliado108/114: seis falhas do mesmo envio de seleção, por alias ausente de
literaryWritingService na prévia. Corrigidos só vite.visual.config, nova fixture
literaryWritingService e asserção de escopo em editor-adjustments.visual. A fixture
retorna null apenas para capítulo próprio sem contrato/planos e recusa configuração;
não concede contexto nativo nem autoriza Firebase real. Não remover esse bloqueio.
Reconfirmação42/42 (2,4min) nos seis projetos, incluindo as seis falhas; typecheck final
e lint/formato dos três arquivos passaram. Não somar108+42 como suíte única verde.
Browser45989/typecheck15635 e todos os handles anteriores estão terminais; sem runner
próprio ativo conhecido. Logs%TEMP%/writer-literary-master-f1bbfed-{build,affected,
browser,browser-context-fix,typecheck-final}.log. Relatório legível no índice da tarefa:
validacao-pos-integracao-principal-2026-11-03.md.

Esta rodada foi integração/validação, não um incremento funcional novo. Objetivo
integral ativo,0/5 etapas fechadas. Retomar política tipada de publicação prévia em
E1/E4, aceites integrais E1–E4 e fechamento E5 (impacto e .writer como cópia privada),
conforme plano-integral.md. O gate global90% permanece pendente; não reduzir limiar,
marcar objetivo completo ou declarar produção aprovada por testes dirigidos.

### Atualização final de CSS — cc92d1b

A conferência final encontrou novo commit de camada do divisor. HEAD recebeu
fast-forward limpo para cc92d1b5cb695e9745a37578a7f3f9e52ed61cb6: só três caminhos
previamente limpos (CSS ResizableEditorWorkspace, styleguide, entrega da principal).
Nenhum arquivo literário foi guardado/removido nesse FF disjunto. Conferência do stash
7619b4b5f0ab9ed9268ac4784039179a56dc93ce:268 arquivos existentes presentes; só README,
continuação e validação cronológica mudaram intencionalmente; nenhum código perdido.

42/42 da correção de fixture e typecheck15635 terminaram exit0. Código instrumentado
continua igual ao de e86a547; não repetir cobertura completa por mudança só de camada.
Ativos agora somente build82642 e browser26862 (editor-workspace:4,:44,:386 nos seis
projetos,18 casos esperados). Logs%TEMP%/writer-literary-master-cc92d1b-{build,resize}.log.
Encerrar esses handles, atualizar relatório legível para a base cc92d1b e confirmar
docs/formato/diff. Sem outro runner ativo conhecido. Portas anteriores4299,4301,63245
conferidas fechadas antes desse último browser. O relatório ainda precisa refletir
essa incorporação; não finalizar com f1bbfed como HEAD atual.

## Checkpoint terminal atual — cc92d1b

Base incorporada cc92d1b5cb695e9745a37578a7f3f9e52ed61cb6. Build82642 e browser26862
terminaram exit0:18/18 cenários de divisor/workspace nos seis projetos,1,3min.
Sem runner próprio ativo conhecido; port4303 foi o preview desta última execução.
Não repetir testes sem mudança/falha nova que justifique. Todos os stashes mantidos,
nenhum arquivo do operador alterado no checkout principal, nenhum commit literário,
push, integração de volta ou deploy.

Resumo de evidências e limites no relatório legível ligado pelo README da tarefa.
Última suíte completa:e86a547,5397/5397 em420 arquivos; funções frontend86,32% <90%.
Depois disso só houve CSS/helpers/testes/fixture visual/docs, sem mudança de produção
instrumentada. Rerun42/42 resolveu os seis cenários da fixture;18/18 conferiram o último
CSS de divisor. Não somar os totais nem declarar114/114 numa única rodada. FullRules
não foi concluída: somente41/shard9. FullFunctions5382 é histórico de1bc6ba8; as17
regressões e sintaxe577 são as provas posteriores da fonte nativa inalterada.

A solicitação de sincronizar e testar foi tratada como progresso do objetivo integral,
que permanece ativo. Nenhum incremento funcional novo nesta rodada;0/5 etapas formais.
Próxima unidade funcional continua política tipada de publicação prévia/E1/E4, aceites
integrais E1–E4 e fechamento E5 conforme plano-integral.md. Cobertura90% segue pendente.

## Rodada fixada em 16d8af5 — cobertura final em execução

A principal ainda avançou para16d8af59f1e2739f1cf9a5b9e399212ea65438cd, correção
TSX de foco de NarrativeOperationDialog e teste reforçado. Três caminhos conferidos
limpos e fast-forward sem tocar nos arquivos literários. Esta rodada foi fixada nesse
commit para não trocar de código enquanto testa; descrever sempre o SHA testado.

Testes da feature narrativa:81/81 em5 arquivos,17,03s, exit0 (session87026 terminal).
Lint dos dois arquivos alterados e build/typecheck/bundle/smoke16d passaram, exit0
(session13250 terminal). Antes disso: resize18/18 e buildcc92 passaram; fixture42/42
passou; todos esses handles estão terminais. Fontes de Functions/scripts/Rules continuam
inalteradas desde296261c. Agora existe mudança TSX após a medição globale86; não tratar
a medição antiga como a de16d.

Para concluir a validação completa no SHA fixado, npm run test:coverage está ativo
exclusivamente:session86819, log%TEMP%/writer-literary-master-16d8af5-coverage.log.
Não iniciar outra suíte pesada. Esperar até terminal, registrar totais/cobertura reais,
atualizar o relatório legível (ainda apontacc92 como topo) e conferir docs/formato/diff.
Não reiniciar testes já encerrados sem mudança/falha. Não perseguir indefinidamente
novos commits durante a rodada fixada; identificar exatamente a base incorporada/testada.

Continuam preservados todos os stashes, os268 arquivos conferidos (três documentos
alterados intencionalmente), as alterações próprias do operador no checkout principal.
Portas anteriores de prévia/emulador foram conferidas fechadas. Sem commit literário,
push/deploy. Objetivo integral ativo,0/5 etapas formais; próxima unidade funcional
continua política tipada de publicação/E1/E4 e fechamento E5, sem reduzir escopo.

## Checkpoint terminal final desta rodada — 16d8af5

A solicitação de incorporar a principal antes dos testes foi atendida até o commit
fixado16d8af59f1e2739f1cf9a5b9e399212ea65438cd. Preservados arquivos locais, todos os
stashes e o checkout próprio do operador. Não declarar ref mutável posterior como
parte da rodada sem outra conferência; usar exatamente o SHA testado.

Cobertura86819 terminou exit1 somente pelo gate:5397/5397 testes,420 arquivos,
871,49s; statements87,52%,branches83,01%,funções frontend86,32% (9318/10794),linhas90,65%.
Medição final no log%TEMP%/writer-literary-master-16d8af5-coverage.log. Não reduzir90%.
Feature narrativa87026:81/81 em5 arquivos; build/lint13250 aprovados. Todos terminais,
sem outros runners próprios ativos. Relatório legível e README da tarefa atualizados.

Provas adicionais permanecem qualificadas: fixture visual corrigida com42/42 após
rodada108/114; divisor18/18; testes afetados60; scripts116; regressãoFunctions17 e
sintaxe577; Rules41 no shard9/16. FullFunctions5382 é histórico de1bc6ba8, fullRules
foi interrompida antes de trocar base e não aprovada. Não somar ou fortalecer essas
checagens. Novo alias de escrita somente na prévia visual: capítulo próprio sem
contrato/planos retorna null; contextos configurados são recusados pela fixture e
Firebase real segue bloqueado. O teste confere a consulta de IDs/modo antes da geração.

Sem commit literário, push, integração de volta ou deploy. Esta rodada é progresso,
objetivo integral ativo e0/5 etapas formalmente concluídas. Próximo trabalho funcional:
política tipada de publicação prévia em E1/E4 com prova nativa da unidade, aceites
integrais E1–E4 e fechamento E5 (impacto e .writer como nova cópia privada) conforme
plano-integral.md. Depois completar o gate de cobertura e validação integral. Não
encerrar objetivo ou reduzir escopo porque a integração/testes dessa rodada terminou.

## Incremento 15 — unidade de publicação e verificação dirigida

Implementado o campo opcional publicationPolicy v1/unit chapter|act|book: contrato,
criação, guia, histórico/comparação, painel e conferência servidor start/confirm.
IA não escolhe política. Save/create ativam hasLiteraryPublications atomicamente;
remover escolha preserva a barreira. No-op repara marcador sem nova revisão. Replay
histórico continua sem republicar. Sem contrato lido, UI bloqueia apenas nova preparação.

67/67 servidor, 14/14 interface; três opções exact incompatíveis em testes foram
corrigidas e os dois arquivos afetados reconferidos com 6/6. Typecheck e lint dirigido
aprovados; Prettier aplicado somente no incremento. Todos os processos terminais.
Não houve nova cobertura/build/browser/Rules/fullFunctions. A medição global anterior
não representa os arquivos de produção agora modificados. Ver 15-unidade-de-publicacao.md.

Próximo trabalho funcional permanece a prova nativa da publicação predecessora e
admissão na passagem, auditorias finais E1–E4 e fechamento E5. Não expor toggle de
publicação anterior antes de implementá-lo. 0/5 etapas formalmente fechadas, objetivo
integral ativo; sem commit/push/merge de volta/deploy. Principal e branch literária
conferidas em16d8af5 antes dos testes; alterações próprias no checkout E preservadas.

## Incremento 16 em andamento — prova nativa de edição para passagem

Criado literaryPublicationPassage.mjs e integrado ao campo opcional passage.publicationId
em literaryWorkflowPassage.mjs e tipo cliente. Confere job/confirmacao/header, hash real
da projeção, token/identidade atuais do capítulo e nascimentos. Na entrada, confere
ponteiro atual e origens de lore/universo/privacidade/cenas; depois de passageEntered
continua conferindo fontes locais, sem exigir a disponibilidade pública global que
as próprias escritas seguintes podem modificar. Não aceita entered do cliente.

Cinco casos escritos no teste de publicação (alteração itera duas origens; recriação
com bytes idênticos fixa os nascimentos do item de manifesto e da projeção pública). Não foram
executados testes, typecheck, lint, build, navegador, formato ou outros gates neste turno.
Arquivos ainda precisam de formatação no fechamento. Nenhuma nova coleção/callable.
Não há seletor UI nem política obrigatória habilitada. Próximo: inventário paginado que
prove predecessora imediata/primeira unidade e ato integral, vincular ao ingresso e à
política explícita, depois UI/recuperação. Não confundir a prova de um capítulo com
ato inteiro, nem passagem opcional selecionada com regra obrigatória antissalto.

0/5 etapas formalmente fechadas. Goal ativo, sem commit/push/merge/deploy. A rodada
anterior foi progresso; não há blocker externo nem processo de testes ativo a aguardar.

## Incremento 17 — inspeção de predecessora implementada, gates adiados

Anterior classificado como progresso (prova nativa de edição). Novo módulo
literaryPassageInspection.mjs: start/get/advance/cancel, leitura interna de certificado,
censo e reconferência completos em páginas25, hashes/contas/CAS/token de encarnação,
predecessora máxima na ordem canônica, previousActTail e firstInAct. Sem array de todo
livro nem limite total. Get projeta stale mas fornece token para cancelar; cancel não
exige fence antigo; CAS antigo não avança duas vezes. ACK inicial sem birth inventado:
cliente usa get do mesmo ID para obter a origem confirmada.

Coleção literaryPassageInspections adicionada a sceneJobs, Rules deny SDK, wildcard
index exemption e testes de exclusão/Rules. Composta por Object.assign na factory
literaryWorkflow; quatro ações em planningApi, total434 nos mesmos16 setores. Teste
registry atualizado; sem nova Function/dependência. Cliente tipado público com IDs
explícitos e sem retry automático. Sem listagem/UI/journal durável ainda.

passage.inspectionId opcional confere ready/origem/alvo e exige previous.id do inventário
igual ao capítulo do ciclo selecionado. Prova vinculada no ciclo. Após passageEntered
libera own-prose do alvo mas exige posição/identidade/actbirth e tokens anteriores.
Nove casos do serviço e dois com workflow escritos, não executados. Novo campo não
obriga a inspeção para todos os ciclos: não declarar política antissalto obrigatória.

Próximo: compor admissão de primeira unidade independente de previousWorkflowId,
prova integral de ato e configuração obrigatória tipada, UI/recuperação. Atenção: a
prova publicationId do incremento16 cobre um capítulo, não o ato inteiro. Não ativar
requirePreviousPublication antes de ter prova/admissão completas. Continuam E1–E4
aceites e E5 impacto/portabilidade .writer como nova cópia privada. Goal ativo0/5.
Nenhum teste, lint, tipo, formato, build, navegador ou outro gate executado neste turno;
novos arquivos precisam de formatação no fechamento. Sem processo live a aguardar.
Sem commit/push/merge/deploy; trabalho no mesmo checkout isolado16d8af5.

## Incremento 18 — admissão obrigatória no núcleo; UI/sequência pendentes

Anterior foi progresso17. Novo literaryWorkflowAdmission.mjs e política pura opcional
requirePreviousPublication boolean (chapter/act; booktrue recusado). Scope/start aceitam
admissionInspectionId separado para primeira unidade. Admission no scopeToken/proof,
confirmação de registro e workflowIdentity; admissionEntered na transição preparation→
firstVersion. FirstUnit exige censo sem predecessor; posterior exige passage imediata;
continuedAct exige prior.admissionEntered/policyrevision/actbirth; fronteira exige prova
publication do escopo integral. Drafting avulso recusa nova primeira versão com política
ativa sem binding interno de workflow. Legado sem flag preserva normalização anterior.

Inspeção recebe publicationId fixado no start/replay. Fase publication percorre o livro
em páginas5, confere capítulos selecionados (act inteiro ou previouschapter), hash/conta
do censo contra inventário e uma única identidade de edição. Certificado ready inclui
hash/conta, scope, edition e anchor. Reader reautoriza anchor; apósentrada ignora somente
pointer/globalavailability, preservando origens e versão anterior. Estado não retémtodos
corpos/provas, sem limite total de livro. Cliente tipos atualizados para fase/certificado.

Descoberto na leitura: confirmação pública avança updatedAt e staleia fence conservador
da integração. PublicationPassage agora guarda job.integration; WorkflowPassage aceita
ponte só se inspection.publication.scope é ato anterior inteiro e anchor.integration
igual à integração nativa atual (readLiteraryPublicationIntegration). Continua cobertura,
relatório e autorização de síntese. Não trocar por book.status/recibo histórico.

Testes escritos: política1, publicação2, workflow5 (omissão, primeira, avulso, continuedAct,
percurso completo com publicação/ponte). Nenhum teste ou validação executado neste turno.
Arquivoslongos precisam de Prettier nofechamento. Sem processo live esperando.

Próximo: UI/seleção/recuperação da inspeção e política (ainda sem controlebool visível),
preservar flag ao trocarunidade/histórico, driverSequence receber inspectionId porunidade
e parada de publicação distinta (hoje workflow-passage mapeia actIntegration). Não confundir
núcleo com fluxo completo. Validar casos rejeitados/ponte e2E somente nofechamento.
Continuam aceites E1–E4, E5impacto/.writer nova cópia privada e gatecobertura90%. Goalativo
0/5; sem commit, mergeback, push, deploy. Mesma worktreeisolada base16d8af5.

## Incremento 19 — interface ligada, recuperação nativa ainda precisa ser fechada

Anterior foi progresso18. Novo LiteraryWorkflowAdmissionFields.tsx consulta edições,
reserva ID local, start/get/página manual/usarreadyapósconsulta/cancel/clearapóscancel.
Sem RPC no mount. Novo literaryPassageInspectionStorage.ts: formato fechado6campos
(version, actor/book/chapter/inspection/publication IDs), chave por UID/livro/capítulo,
Web Locks curtos/CAS integral; sem prosa, chave, cursor, aprovação. Pointer persistido
não é dirty sozinho; chosen e busy são comunicados ao host. Erro preserva intenção.

Parent Production→Preparation→Workflow passa editorialState. Novo registro bloqueado
se nullourequiredsemadmissionSelection. Select manda admissionInspectionId e injeta
inspectionId em passage. Mantida chamada de scope com3args no legado para preservar
spies existentes. PassageFields recebe targetActId da inspeção e não chama scopegated
semadmissão ao consultar ciclos. Checkpoint mostra job.admission/admissionEntered.
Novos tipos WorkflowAdmission. sync/novo ciclo limpam escolha emRAM, preservammetadata.

EditorialPublicationPolicyFields tem dropdownrequirePreviousPublication parachapter/act;
preserva boolean ao trocar entreeles; bookremoveflag comexplicação. Histórico/remote
comparison mostramflag. Servidorreaderinspection aceita canceledcomcompletedAt só
quandoenteredprivadodociclo, preservandocertificado jáconsumido; novasentradas recusadas.

Testes escritos: storage4, AdmissionFields4, proposta1, host1, servidor1. NÃO executados:
testes/tipos/lint/formato/build/navegador/cobertura. Arquivos precisam Prettier nofechamento.

PRIORIDADE PRÓXIMO TURNO: startinspection não congela aindaexpectedScopeToken nativo
antes da reserva local; retryantigo pode iniciar no livrorecriado se IDsiguais e record
nãoexistir. Acrescentar getLiteraryPassageInspectionScope no mesmo planningApi (total435),
retornarhash actor/bookbirth/chapteridentity. UIobtém read-onlyantesreserve, persiste token
metadata, start/replay confere/amarra. Existingtestssem token podemlegados mas novoUIsempre
manda; ideal contrato exigir para novosstarts sem enfraquecer recuperaçõesexistentes.
Também cancel-before-start incerto sem nativeorigin: fecharID por tombstone permanente
com identidade/hashdaintenção, sem usar not-found para apagarjournal ou reenviar. UIhoje
sócanceldepoisdegetexistente. Não considerarrecuperaçãofechada antesdesses2pontos.

Depois driverSequence receberinspectionId porunidade+parada publication própria, UI.
Continua0/5formalmente, E1–E4aceites/E5impacto/.writer+gateglobal. Goalativo. Semprocesso
live paraesperar, semcommit/push/merge/deploy. Worktreeisoladabase16d8af5preservada.

## Incremento 20 — start congelado e cancelamento incerto compostos em código

Anterior19 foi progresso. getLiteraryPassageInspectionScope novo no factoryworkflow e
planningApi (435ações/16setores). Hash actor/target/bookbirth/chapteridentity; consulta
metadata sem writes/corpo. START AGORA EXIGE expectedScopeToken, sem fallbacklegado.
Fingerprint fixa chapter/publication/scope. Create compara origem nativa na tx;
replaycompara fingerprint e nascimento do livro. Recriações não herdam o pedido.

cancelLiteraryPassageInspection tem segundo formato: mesmaintenção start completa,
sem CASnative. Absent cria marker canceled permanente v2/count0/sem completedAt nem
certificado, semlerchapter. Existing exige mesmaintenção+actor/bookbirth e fecha;
replaycanceled semnovowrite. NativeCASlegado preservado. Summary inclui expectedScopeToken;
marker publicationMode null refletido no tipo cliente. Start ACK ainda não inventabirth.

Storage v2persiste IDs+expectedScopeToken+cancelRequestedfalse. Readerpreserva v1e2 e
camposfechados; v1nãoinventa origematual pararetry. markPassageInspectionCancellation faz
CASnormalizado(mesmosIDs/token) sobWebLock e gravatrue monotônico ANTESdeHTTP. Release
comcópia pré-cancel recusado. UIoculta retry/advance/use comcancelRequestedtrue, mesmo
apósreload. Cancellegacy resolveIDexistente sem gerar tokennovo.

UI consulta scopeantesreserve; sendStart usaexatowirepersistido. Cancelindependente do
start usaepochparaignorar ACK/erro/query/advancevelhos; apósgetcanceled confirmado reseta
busy/working semesperarstartinflight. Oldrun finally não destrava uma execução nova.
Parentlocked excluiinspectionpending para permitircancel; formLocked/registro continuam
bloqueados pela inspeção. Querycompara chapter/id/scope/publication do original.

Backendtestes existentes atualizados comscopeobrigatório; quatrocasos novos livro/chapter
recriado,semhash,cancelantesstart e capítulo removido/intentdivergente. Fronttestes mocks
scope/cancelStart/mark; lateACK, legacy e reloadcancel adicionados. Storage testa cancel
monotônico e recusa clearcomestadoantigo. NENHUM teste/tipo/lint/formato/build/browser/
cobertura executado neste turno; somente edição/leitura. Preparar Prettier nofechamento.
Semprocesso live aaguardar, semcommit/mergeback/push/deploy.

Próximo: driver e UI de sequências receberinspection/admission porunidade, parada própria
publication (atualworkflow-passage viraactIntegration), firstunit/actcontinuation com
seleção explícita, retomadas metadata. Fechar concorrência crosswindow/cancel e estado
após exclusão do livro (metadata IDonly não pode serapagada por simples not-found).
Global E1–E4aceites/E5impacto/.writer novacópiaprivada/cobertura90 continuam. Antesde
executartestesfinais, conferir/incorporarmainnovamenteconformesolicitação; última base
provada16d8af5. Objetivointegral ativo0/5 formalmente.

## Retomada após cota e incrementos 21–22

A gravação pendente do documento 21 foi aprovada nesta rodada: o bloqueio de cota não
se repetiu. Não marcar o objetivo blocked por esse episódio. Documento 21 existe e
README agora o indexa. Antes disso, a auditoria em leitura confirmou lacunas: lore sem
contexto editorial; inventário de impacto sem workflow/sequence/inspection e sem UI;
BOOK_PACKAGE_SECTIONS só structure/resources/personas/universe/history/draft/cover,
sem processo editorial completo. Objetivo continua integral, sem redução de escopo.

21 em código (turno anterior, sem testes): driver aceita admissionInspectionId e
previousWorkflowId externo no index0. Index>0 conserva completed canônico. Novos IDs
participam do fingerprint/request/frozenaction e do closed-shape/retomada do original.
Stop publication distinto via workflow-publication; source/wire recebem inspeção.
UI recebe editorialState, seleção atada a index/origin/revision; primeiro lote posterior
pode escolher ciclo externo/integração. Filhos registrados limpam escolha em RAM;
próximo índice não herda prova. Quatro testes driver e um host escritos, não executados.

22: novo loreAnalysisEditorialContext.mjs autoriza book/chapter e compõe guia com
composeEditorialContract. Proof metadata tem nascimentos, revisão, hash, clock; DTO
expõe escopo contract-only/wholeBookfalse e instrução exata. getLoreAnalysisEditorialContext
em loreApi, total 436 ações/16 setores. Sem nova Function/dependência. LoreAnalysisContext
inclui prova na revisão quando guia/clock/cenas existem, preservando hash legado vazio.
Native cenas: inclui sceneRevision + assembly/structure revisions na prova, mesmo com
cache legado igual. Não afirmar que a consulta de guia leu prosa; texto é input explícito.

LoreAnalysisService verifica token antes de criar ticket; BYOK com guia não admite
registro sem prova prévia. Ticket persiste apenas editorialProof/token, nunca instrução.
Provider recebe DTO transitório. Ready/replay/apply legado, reserva preparada e source
opening conferem guia atual; recibo aplicado preserva replay histórico sem reescrita.
Nova instrução pura loreAnalysisInstruction.mjs compartilhada em index e BYOK: guia/lore
não são evidência; crença/fala/hipótese não equivalem a fato. Ainda falta classificação
ESTRUTURADA e tratamento de proveniência/aceite desses estados, não declarar E3 fechado.

Cliente LoreAnalysisRequest tem editorialContextToken; modelo exporta DTO. Dialog busca
fonte antes de gerar nos dois provedores, manda token e mostra composição exata em
<details> com pre-wrap/altura limitada. BYOK função aceita quinto parâmetro opcional com
DTO e usa mesma instrução; registro não recebe chave. Modelos/raciocínio existentes
mantidos. Outra implementação de base comum (persona/planos) exige auditoria por entrada.

Testes preparados22: quatro no loreAnalysis existente, quatro com studioDb para
identidade/retirada/autorização/clock de cenas, um BYOK e um diálogo. Todos não executados.
Nenhum teste/tipo/lint/formato/build/browser/cobertura nesta rodada. Arquivos precisam
Prettier/revisão/gates no fechamento. Não reusar os resultados do incremento15 como
prova destes arquivos. Sem processo live, commit, mergeback, push ou deploy.

Próximo: fechar a distinção estruturada das afirmações de lore, revisar matriz E1–E4,
implementar E5 impacto (inventário completo, verificação/backfill/fence/UI) e portabilidade
editorial .writer como nova cópia privada sem autorizações/execuções. Antes de testes
finais, conferir/incorporar principal conforme pedido do autor e congelar snapshot.
Última base provada16d8af5; cobertura conhecida de funções86,32% anterior aos incrementos
recentes, limiar90 não deve ser reduzido. Objetivo ativo, 0/5 formalmente encerradas.

## Incremento 23 — afirmações classificadas, revisão explícita

Anterior22 foi progresso. Novo loreClaimProtocol.mjs/.d.mts puro, usado nos validadores
servidor/BYOK. Claims opcional {version:1,items}, 1–16: field summary/details, text
literal do campo, kind observed/interpretation/proposal, evidence literal contínua e
rationale. Interpretação/proposta exigem rationale. Schema fechado, duplicatas, texto
solto e evidência ausente recusados. resolveLoreEvidence compartilhado mantém validação
anterior de whitespace. Legado sem claims preserva formato, não inventa fato observado.

DetectedLoreEntity exporta tipo opcional. Instrução comum pede classificação por
afirmação, nunca verdade única da entidade. UI mostra tipos/campos/evidências/rationale;
todas as sugestões começam desmarcadas, mudar destino desmarca e edição autoral marca
que a classificação é da sugestão original. Aplicação envia apenas loreChangeFields,
não claims ou permissões. Resultado privado contém metadata, sujeito à expiração do
ticket antigo; NÃO chamar isso de arquivo histórico permanente. E5 precisa auditar
retenção/proveniência/backup; ambiguidades na consolidação por nome também permanecem.

Testes preparados: protocolo4, parser1, diálogo2; antigos helpers representam seleção
explícita e re-seleção após destino. Nenhum teste/tipo/lint/formato/build/browser/
cobertura executado. Uma âncora de edição falhou antes de gravar diálogo; fonte lida
e mudança reaplicada, sem alteração parcial nessa tentativa. Novos arquivos precisam
Prettier/revisão no fechamento. Sem processo live esperando.

Próximo: matriz de aceites E1–E4 e E5 completo. Falta impacto em workflow/sequence/
inspection/publication, backfill/fence/verificação/UI; pacote .writer só tem seções
structure/resources/personas/universe/history/draft/cover, sem processo editorial.
Restaurar nova cópia privada com IDs remapeados e nenhuma execução/grant reativado.
Conferir/incorporar principal antes dos testes finais e congelar snapshot; última base
identificada16d8af5. Cobertura antiga86,32% não prova código atual; mínimo90 preservado.
0/5 formalmente encerradas; objetivo ativo, sem commit/mergeback/push/deploy.

## Rodada de validação solicitada após conferir a principal — 2026-11-03

A instrução mais recente autorizou executar os testes após incorporar a principal.
Fetch de origin/master e merge --ff-only master confirmaram Already up to date em
16d8af59f1e2739f1cf9a5b9e399212ea65438cd. Portanto a antiga proibição de rodar testes
durante os incrementos não impede esta rodada explicitamente solicitada.

Resultados em validacao-principal-2026-11-03-rodada-final.md. Frontend completo:
5422/5422 em 423 arquivos, cobertura functions86,24 abaixo90; sem validate verde.
Functions5431/5436, cinco falhas em helpers corrigidas: gateRevision agora usa retorno
servidor em no-op e inspeções distintas por capítulo. Reconferência73/73. Scripts116,
sintaxe585 módulos, build/smoke, E2E7, visual150, reconferência UI50 aprovados.
Lint encontrou resets em efeitos: AdmissionFields tem host keyed actor/book/chapter/
contractRevision, inicialização local lazy; Sequence usa reset durante render guardado
pela mudança de escopo. Tipos/formato/diffcheck e todos grupos lint reconferidos.
Mock visual loreAnalysisService agora exporta contexto editorial com compositor comum.

Regras completas em execução, session30033, log .firebase/local-validation/
literary-final-rules.log. NÃO declarar Rules verdes sem aguardar encerramento.
Demais comandos terminaram. Nenhum commit/mergeback/push/deploy. Objetivo0/5 aberto;
impacto completo/portabilidade editorial/aceites/cobertura90 permanecem. Incremento24
não foi implementado nesta rodada: a solicitação recente foi integração e testes.

### Encerramento da rodada de validação

Regras session30033 terminou exit1 pelo limite nativo de30min. Não está rodando,
não há Rules completas verdes. Três famílias literárias dirigidas (architecture,
impact, workflow) em outro emulador oficial/hashconferido passaram6/6; não substituem
suítecompleta. Todosconsumidoresdohelpercorrigido reconferidos91/91 emquatroarquivos
(workflow,sequenceDriver,sequence,domainCallableSdk), ampliando os73 anteriores.
Resultadofrontend5422/5422/423arquivos comfunctions86,24<90 permanecefalha realdo gate.
UI50/50, scripts116, syntax585, E2E7, visual150, build/smoke e checksdescritosno relatório.
Conferência final fetch manteve HEAD/master/origin em16d8af5. CheckoutE intacto comos
mesmos3documentosnão commitados. Nenhumcommit/mergeback/push/deploy. Portas58594/4177
sem listener e nenhumworkerFirestoredesta worktree na conferência final.
NÃO háprocessosdetestependente,não aguardarhandlesantigos. Próximo continua oobjetivo
integral (impacto/portabilidade/aceites/cobertura90), semdeclarar0/5 encerrado.

## Incremento 24 — impacto dos processos em implementação

Turno anterior foi progresso (principal conferida, correções e evidências de testes).
Não aguardar nenhum handle antigo. Novo incremento não executou testes/validações.

Novos literaryImpactProcessInventory.mjs e ProcessVerification.mjs; registry integra
13 coleções existentes, novas kinds workflow/sequence/inspection/publicationPart e
schemes artifact-origin/integration-chapter/publication-integration. RecordVerification
aceita source próprio nativo e IDs compostos coleção/ID para partes homônimas. Não há
nova coleção/ação/dependência nem escritor. Livro/autor/birth original conferidos;
workflowBirth/sequence.birth não nulos conferidos contra registro nativo.

Captura de nascimento devolve identity true mas version null/status unverified, nunca
manuscriptRead. Chapter metadata compara identity/token; integração aceita compara
snapshot exato sem inferir identidade quando mudou. Projeções excluem prosa/prompts/
credenciais/grants. Sequência nativa25 pode gerar até128 arestas (sem cortar aos64);
append do motor continua32 e a orquestração deve paginar a gravação do registro.

Dez testes escritos em literaryImpactProcessInventory.test.mjs, não executados.
Fontes precisam Prettier/tipos/lint/tests no fechamento. Revisão por leitura somente.
Documentação24 e README/guia atualizados. Última validação5422/423files e86,24functions
é ANTERIOR a este novo código. Não anunciar validate verde, Rules completas verdes
ou objetivo completo.0/5 formalmente fechadas. Semcommit/mergeback/push/deploy.

Próximo: fechar verificador metadata de unidades publicadas e origem de currentWorkflow
sem adotar recriação; índice de dependências literais do guia com produtor, cleanup,
Rules e backfill autorizados. Depois orquestração pública/inventário/fence/cobertura/UI
com pendências justificadas; pacote .writer editorial nova cópia privada sem grants/
execuções; auditoria E1–E4 e cobertura90 preservada. Conferir main antes do gatefinal.

## Incremento 25 — origem das unidades e do ciclo atual

Anterior24 foi progresso: inventário/máscaras/adaptadores/verificadores e dez testes
escritos. Novo25 extrai readLiteraryIntegrationUnitMetadata de literaryIntegrationSources
com fórmulas idênticas de chapter/scene. readLiteraryIntegrationMarkup usa o helper e
recusa token alterado antes de abrir corpo; abertura real continua pelos leitores
anteriores. O impacto tem scheme integration-unit com locator/identity/unit token/
chapterToken congelados no registro original. Verifica ownership/parent/archive e
mudança/recriação sem abrir prosa ou afirmar byteIntegrityChecked.

Novo literaryImpactSequenceMembership.mjs lê metadata do ciclo+recibo original
literaryOperations/{currentWorkflowId}. Exige parentbirth/bookbirth, índice/capítulo,
reverse binding sequence.id/birth/index, workflowBirth nativo e receiptmethod/id/uid/
bookbirth/workflowBirth/fingerprint. originToken inclui nascimento do recibo. O scheme
sequence-workflow captura identidade histórica sem versão textual. Recibo superseded
preserva vínculo histórico sem grant; registro incompleto/divergente fica pendente.
Não adiciona writers/campos/coleções/actions. O inventário inclui index/identity/unit.token.

Sete testes adicionais no mesmo literaryImpactProcessInventory.test.mjs (17 preparados
somando24). Nenhum teste/tipo/lint/formato/build/browser/validate/cobertura executado.
Revisão por leitura de fórmulas/masks/binding somente. Arquivos precisam formatação e
gates no fechamento; integração/publicação existentes precisam reconferência pela
extração do helper. Resultados5422/86,24% e Rules timeout são ANTERIORES a24/25, não
prova deste snapshot. Semprocessoslive, commit/mergeback/push/deploy.0/5formalmente.

Próximo: índice nativo das dependências literais/relations do guia junto à versão,
cleanup/Rules/inventário e backfill autorizado dos antigos; depois orquestração pública
com scan/verificação/cobertura/fence completo e UI de impacto/pendências justificadas.
Portabilidadeeditorial.writer nova cópia privada sem grants/execuções e auditoria E1–E4
seguem requeridos. Não reduzir cobertura90 nem usar meta-read como leitura de texto.

## Incremento 26 — índice do guia e backfill interno

Anterior25 foi progresso. Novo26 extrai normalizador em literaryReaderGuideProtocol.mjs
com reexport legado. Novo literaryPublicationGuideDependencies.mjs constrói índice sem
texto, autoriza fonte, reconfere origem e faz backfill explícito. SaveGuide cria índice
literaryPublicationGuideDependencies/{digest job/id/revision} e versão/header/receipt/
clock na mesma transação. Novo header dependencyIndexHash. EnumcleanupPublication,
sceneJobs flat phases, Rulesdeny e wildcardindexexemption incluem nova coleção.

Prova co-created exige indexborn==sourceVersionborn, sourcechanged==sourceborn,
indexchanged==indexborn e hashmarker. Backfill legado lê versão canônica inteira após
preflight exato, registra origem anterior/sourceToken, cria índice e atualiza somente
marcador do header + clock atomicamente; indexborn==sourcechanged e sourceborn fixado.
Replay original aceita index.sourceToken após atualizar metadata; não regrava. Source
ou indexrecriado/alterado invalida. Missingindexcommarker nunca é recriado porbackfill.
A igualdade nativa de timestamps precisa ser confirmada nos testes SDK escritos.

Novo literaryImpactGuideDependencies.mjs projeta índices/guia/versões/provas e confere
associação por IDs. Kind readerGuide tem tuple [edition,id], componentes nativos até1500
sem cortar ID composto; scheme guide-dependency possui origin nativo do índice mas
identityMatches/versionMatches da fonte citada null. Sem prosa/credenciais/grants.
ProcessInventory registry agora inclui índice + headers; guide records admitem128links
(57chapter+12target+metadata), graph.appendcontinua32. Não expor mapacomo completo.

Doze novos backendcases(11arquivo novo+1produtor),3SDKcases novo arquivo Rulesnative;
Rulesloop e scenescleanupseed incluemcoleção. Corrigida expectativa not-found do24,
que já era o contratoWorkProject. Nenhumteste/tipo/lint/formato/build/browser/validate/
coberturaexecutado. Fontes requeremformatação/gates; métricasantigasnão cobrem24–26.
DuasâncorasdetesteRulesnãoexistiam; as etapas anteriores foram gravadas, depois arquivo
lido e âncorareal aplicada. Não repetir os scriptsinteiros. Semprocessoslive/commit/
mergeback/push/deploy. ADR0275 e doc26 escritos; objetivo0/5formalmenteencerrado.

Próximo: orquestração pública por setor do mapa. Preparação de índice só por autorização
explícita; concluirbackfill ANTES decongelarfence, porque altera dependencyRevision.
Censo completo/páginasdearestas32/verificaçãometadata/scan reconferido/propagação/queries/
resoluçõescomevidência/UI. Deixar lacunas/opacos como nãoverificados. Semrawlinks ou
sourceTokensclientecomo grant. Depois portabilidadeeditorial.writer novacópiaprivada,
auditoriaE1–E4, cobertura90egatesfinais. Mainúltimaconferida16d8af5, preservarcheckoutE.

## Incremento27 — controlador de impacto no servidor

Anterior26foiprogresso. Novo literaryImpactScope.mjs fixa livros/universos/sourceNodes
nativos+registryToken. Orçamento512inventários/16seeds e maxbooksderivadonãotruncaescopo;
seleçõesmaiores exigemgrupos explícitos, não limite desérie/livro. Novo literaryImpact.mjs
API:getScope/start/get/list/advance/cancel/getOperation/readPage/resolve pelo planningApi.
DOMAIN_SERVICESfactory adicionado,9routes,445actions/16setores (testecontagem atualizado).
Novas Controls/Checks/Decisions/DecisionVersions em Rules,indexjobId e SceneJobs cleanup.

Start:expectedBookToken/scopeToken/requestHash,ctrl+receiptco-criados,ativação peloDOB
conjunto/nativecontrolbirth. Marca hasLiteraryResources ANTESdefreeze. Fenceinclui agora
book.updateTime; graph.initialize sógrava flagseausente. Freeze nãoadotagrafoexistente;
graph-born==control.updateTime no commit decriação, pinDOBantesdeavançar/stale. Contexto
novo com graforecriado nãoherdaorigem. get/páginas têm ponteiro nativo; getpermiteorigin
opcionalpara descoberta, páginasobrigatório. outcomes têmbookToken/reqHash originais.

Preparaçãoíndicesguia somenteintent.prepareIndicestrue:scanversionID/pinprivado+token em
um passo; backfillnapróximaRPC. TerminaANTESdefreezeFonteFence (backfillmudaclock).
Collect/confirm/traverse/final:um registro porpágina,umaarestaverificada porpasso;
projeçãohash+recordToken+factshash conferidosemtodas3passagens. Append/check/control/
recibo atomicosemadvance;nonce/reqHash/rev/originpreservareplaysemconsumirpróximo.
ResolvecapturaCheckobservationToken nativo,exigerationale/evidence+CAS,versionahumano e
receiptsemprosa/debito/publicationgrant. Ownnotesconsultáveissemreautorizar fontes.

Coberturaparciais:graphseal/finish allowIncompleteinterno permiteunavailable/unsupported
sósem missing/pending. Sentinelunindexed-origin-coverage porlivro SEMPREunsupported1 até
auditoria legada real:control encerra partial, nunca complete. NãoatestarhistóricoCompleto.
Catálogonativoinconsistente continuaerrobloqueante defreeze, nãocriafencefalso. Relações
foraScopecontamsuportependente, nãoleemcorpoexterno. sourceIdentityUnknown separado.
Arcs/timelineEventsagoracontém-se embook pormetadata (registry/structural/ownrecordkind).

Cancel:startwire originalincluitarget+bookToken,ouoriginobservado;fencenegativoantesACK
nãoativaapósstarttardio. Fecha semlerotherbooks revogados;grafo sómarcacanceledseDOB e
fencecorrespondem. Metaíndicescanônicosjápreparadospermanecem. BookDOB/controlDOBestritos.
Cliente/UI/journal ainda NÃO existem. Não anunciarfullflowouetapaconcluída.

Testespreparados:15controller+1Graphpartial+1DomainSDK=17backend;3RulesSDKnovas. Rulesloop
4coleções e scenescleanupseed. studioDb({sharedBirth:true})opt-in timestamps co-commit;
defaultanteriorpreservado. NecessárioconfirmarigualdadeSDKno fechamento. Nãoexecutado
nenhumteste/tipo/lint/formato/build/browser/validate/cobertura. Arquivosnovosprecisam
Prettier/revisão/gates. Métricasantigas5422/86,24eRules30min não validam24–27.
UmaâncoraJSONfaltava:anterioresforamgravados,remainingindices/testloopaplicadosdepois.
Semprocessoslive, commit/mergeback/push/deploy.0/5formalmente. Mainúltima16d8af5.

Próximo: cliente tipado, journalmetadata/CAS/WebLocks curto, startuncerto/cancelnegativo,
UIbackendmapapaging+revisãocomprovas,preferênciademetadadosentrecontas/páginas semprodução
na abertura. DepoisAUDITORIALEGADA removeSentinel sócomprova real índicescompletos e
fence;compatívelcatálogohistórico semadotarnascimentoatual. Portabilidadeeditorial.writer
nova cópiaprivada semgrants/execuções e auditoriaE1–E4seguemobrigatórios. Finalincorpora
mainantesvalidar,cobertura90preservada,Rules completasfaltam(green parcialnãoé global).

## Incremento 28 — interface e recuperação do impacto

Anterior27 foi progresso. Criados model/impact.ts, literaryImpactService.ts,
literaryImpactStorage.ts, hooks/useLiteraryImpact.ts, LiteraryImpactPanel.tsx e
LiteraryImpactScopeFields.tsx. ProductionPanel nova aba impact separada de map,
visited/workguards e export público. Fonte book/contract/plan/refs narrativas/lore,
seletores por nomes/paginação; índices só consentimento explícito+preflight+Dialog.

Abrir apenasreadlocal. Consultar original/get/list/page não produz. Avançar1 ou lote
explícitoaté20, pausaentrepassos; semautoloopaoabrir. Pageschecks/visits/nodes/decisions.
ResoluçãorawdraftRAMpreservadoatéfechamentoconfirmado,8evidênciasseparadas,nenhum
textoemjournal. CancelavisaquesedescartadraftnãoACK;notasjáservidorpermanecem.

Journaldedicado writer:literary-impact:<actor>:<book> v1 schemafechado,limite900kchars,
WebLocks curtos/CASdeep integral+sessionId+revision. startwireoriginal incluinodessem
rótulos; advancewirecompleto metadata; resolvewire somenteIDs/tokens/hash/revisions,
semstatus/rationale/evidence. startpending mantémtextoRAMinexistente. Reloadresolution
nãoreconstróiresend. pending.closeRequested e cancelRequested monotônicos;cancelwire
exatogravadopréRPC,consultunknownnãoreenvia/nãolimpa. ACKguard nativobook/control+fresh
get e sessão dentrodolock. CASnãoapagasessãodiferente. release sóclosed semdívida ou
cancelproof;notfoundnãopurge. NenhumlockHTTP. Callbackalive/epochdeativarespostaantiga.

BackendnovoliteraryImpactLabels.mjsmetadatawhitelist(semnomeshistóricos/cache);scope
maximumBooksPerRun,summary.sources;pagecurrentlabels+decisionCAS. Nova décima ação
cancelLiteraryImpactOperation registrada (446actions/16setores). Fence usa mesmoIDdo
advance/resolve original,uid/bookDOB/controlDOB/method/hash e fingerprintnullcanceled;
lateproducer devolvecanceledmarkersemwrite. Doneoriginal retornaoldreceipt. Corrigida
checagemmethod no replay cancelMap parafenceoperationnãopassarporcancelMap. labels
apenasRAM,nãogravadasemgráfico/journal;ownnotespagenãohidrataderivadosrevogados.

Preparados27frontend(10storage9hook4service4UI),5backendadicionais+1SDKrace.
Fixturevisualservice+vite.visualalias+literary-impact.visual.ts(teclado/temas/320px).
Testeantigodenodesaceitanomeatual e continuaproibindoPRIVATEBODY. AlteradodecisãoUI
preservamúltiplasevidênciassemjoin/truncation. AçõeslongascomsequenceActionwrap.
Nenhumteste/tipo/lint/formatter/build/browser/diffcheck/coverage/validateexecutado.
FontesdensasaindaprecisamPrettier/gates. Docs28/ADR0276/README/architecture/literarydoc.
Semprocessoslive/commit/mergeback/push/deploy. Goalativo0/5. Mainlocalconferida16d8af5.

Próximo: revisãofonte/restantesdo28+auditorialegadarealpararemoverSentinelsócomprova.
.portabilidadeeditorial.writer aindaINEXISTENTE; restaurarnewprivatecopysemgrants,
execuçõesoucredenciais. AuditoriaE1–E4,finalfetch/mergeprincipalantesdoschecks,90%
functioncoverageeRulescompletasobrigatórios. Métricasantigas5422/86,24nãovalidam24–28.

## Incremento 29 — censo real das origens nativas

Turno28 foi progresso. Novo29 cria literaryImpactCatalog.mjs e
literaryImpactNativeAudit.mjs. Integra auditoria ao antigo inventário virtual
unindexed-origin-coverage, substituindo unsupported=1 incondicional por lacunas reais.
RegistryToken agora versão2 inclui spec deep-frozen; jobs antigos ficam currentfalse,
sem migração, e conservam consulta de notas/reconciliação/cancelamento. Nenhuma rota
nova:446ações/16setores mantidas.

Onze segmentos: catálogo; contexts; contextBodies; conversations; turns; turnBodies;
turnQuestions; operations; legacyConversations; legacyMessages; legacyReceipts.
Cada chamada só1querydoclimit1, headers/projeçõesfechadassemprosa. Grupos localizam
filhos sem pais; bounds **name** > db.doc(users/UID) e <db.doc(users/UID+NUL), ordem
por segmentos conforme fonte SDK e docs oficiais. Cursorsection+afterPath privadovalida
UID/grupo. Campo JS contém escape \u0000, não byte NUL no arquivo. Necessário provarno
SDK/emulador; só double não autoriza release. Censo não materializa pais, não lê body/
question/frozen/instructions/modelresponses/keys. BookDOB entraitemtoken; parents/index
birth/update+metadatatokens compõemhash. Metadataoutroscopesexplícitos ignored, origem
sem escoporecuperável gera gapUIDprivado sem presumir consumo no livro.

Nativecontexts cruza indexID/token/sourceToken/closureHash/resource; turn cruza parent/
conversationToken/attempt/source/closure; sidecars sóheaders deidentidade; legacy cruza
indexcompanheiro e receiptmarker, nativeapps cruzamreceipt/index. Verificação integral
continua leitorcanônico. Lacunas geram capture:null, relação subject, fatosunindexed,
identity/versionunknown, todos read/editorial/byteIntegrityfalse. Checks/hash/append/
cursor/receipt no mesmo commit. Receiptsfracosnãocriamgrants históricos. Nota autoral
não fecha cobertura. sourceAvailabilityparentmissingfalse explicacausa privadametadata.

Collect/confirm/final repetemauditoria+hashdosregistros eproofs; mudanças viramstale.
nativeAuditCursor resetadoentrepasses/inventários. Catalog ausente+editorChatsnonempty
éobservaçãountracked/unsupportedreal; nunca inicializacatálogo nem altera contrato
estritocore. Catalogmalformadoexistingcontinuaerro. Fence chamaobservadorimpact-specific.
Instânciaswritersantigos semclocks precisamdrainantesrollout; untrackednãotermina done.

StudioDb ganhou collectionGroup e cursores DocumentRef; comparator de **name** por
segmentos/UTF8, groupflag preservado nos builders, filtros de camposaindaexcluemmissing
emrange. Limite1/reads-before-writes mantidos. Fixturecontroller default agoraSEMEIA
mensagemlegada órfãreal semíndice; opçãolegacyGapfalse para testarbookgap-free. Livro
semgap podedoneapenasregistered-dependencies, semantic/history/publicationfalse ainda.
UIcorrigida: resultado completoregistrado distinto dehistórico, causas de gap legíveis,
origemIAgenérica e notas não fecham lacunas. TesteUI28 frase ajustada.

Preparados22novos:15nativeAuditunit+3controller+3SDK+1UI. SDK testa UIDvizinho author0,
2orphansmesmaColeção(paginação), bodies/questionssemturneclockausentesemreparo. Índices
nomeonly; nenhuma nova coleção/Rule/Function. Nenhumteste/typecheck/lint/formatter/
build/browser/coverage/diffcheck/validateexecutado. Docs29/ADR0277/architecture/publicdoc/
README. Semprocessoslive/commit/mergeback/push/deploy.0/5formalmente. Mainúltima16d8af5.

Próximo: revisar lacunas residuais do censo, depois portabilidade editorial.writer
AINDAINEXISTENTE(contrato/decisões/planejamento/evidências/relatórios/checkpoints com
relações/versões;restaurarnewprivatecopyremapeada semautorizações/execuções antigas).
Exige descobrir os protocolos atuais de backup/restore por MCPgraph primeiro; regras
origem/hash/índice/receipt/cleanup/history/personas de AGENTS continuamobrigatórias.
AuditoriaE1–E4+aceitesE5 seguemabertas. Sófechamento:fetch/incorporarprincipaldinovoe
executargates completos,coberturafunções90eRulescompletas;histórico5422/86,24nãovalida24–29.

## Incremento 30 — núcleo da portabilidade editorial (ainda desligado)

Anterior29 foi progresso. Novo30 NÃO muda formato ativo nem stream/restore/APIs/Rules.
Cria bookEditorialProtocol.mjs+.d.mts e bookEditorialRemap.mjs+.d.mts. Extrai literals
EDITORIAL_FIELDS/STATUSES/CATEGORIES/MAXBYTES para literaryEditorialFields(.mjs/.d.mts)
e LITERARY_PLAN_SCHEMA/REFERENCE_KINDS para literaryPlanFields(.mjs/.d.mts), reexports
nos módulos nativos mantidos. Mesmos normalizadores/valores/ordem/limites; sem Buffer
ou I/O no protocolo portátil. Nenhuma dependência nova.

DTOs8famílias:contract/plan/document/decision/evidence/report/checkpoint/prose. Docs roles
architecture/series/preparation/progress/readerGuide/publicationManifest. Datasnullable
preservadas, semLFnormalização/trim, BOM/CRLF/Unicode literais.8MiBporitem(sem limite de
projeto); prosa/históricograndescontinuamstreamsrawexistentes. Closedrawschemasrejeitam
accessors/prototypes/unknownkeys, camposoperacionais/APIkey/jobToken/receipt/sourceToken.
Geraçãoopcional snapshot:'historical',providerplatform/byok,model:string,reasoningstring
ounull(legadonãopreenchido);nãoseleciona capacidadeativa.nãodumpJSONdejobemtítulo/texto.

Referênciafechada kind/id/parentId/scope{kind,id}/revision/contentHash/state/purpose.
Kindsbook/act/chapter/scene/arc/arcMilestone/event/lore/historyVersion/persona/image/artifact.
Scopeuniverse sólore,librarysópersona/image; parent sóarcMilestone;bookid==scopeid;
artifactid64hashscopebook. state recorded/unavailable **nãoauth**. purpose source/subject/
nullpreservado eplanrejeitatargetduplicadoindep.versão/purpose. contentHash sódigestreal
conteúdo, nunca copiarum token nativo porserhex. Linksreferences/supersedes/supports/
reviews/derives/corrects/contains/publishes.Ctrlpresencecaptured/absent-in-legacy+counts
lógicos;hostaindatemqueprovarcontagens/graph/tipos/ciclosframing. Extratorreferences(raw,
bookId) dá refs válidas e EIDsclauses preenchidospelohostbookscope; não temI/O. Evidence
start/endnull→offsetUnitnot-recorded,senãoUTF16;semclaimdeprova debyte/leitura.

Remapperinputhost fechado4keys sourceBookId/bookId/hashBytes/mapResource(síncronopuro).
IDartefato/decision/finding/link porhashdomainwriter-restored-editorial-v1+novobookID.
Resourcecallbackusa createBookRestoreRemapper.identity(inclmilestoneparent), hashpure
portdo host. Original != cópia, destinosIDsalteradosobrigatórios; artefatohash64novo.
ContractdecisionIDs/cadeiasestáveisentreversões, findingIDscomparentartifactscope,
reportEIDsremapeiammesmoevidence. Externosouunavailable sem callback/livefetch; locais
faltantes mantêm descriptoroldscope/unavailable. Saídarestoration fixahistoricaltrue,
executiondisabled/publicationprivate/reviewrequired. CheckpointcontrolsDisabledtrue,
contadoresobservados(ordemcanônica),phase sóhistórica,sem budgets/autorizations/nonce/
opID/pendingRPC. Preferênciascontractcontinuousnãoégrantnemretomaexecução.

34testesPREPARADOS(nãorodados):20schema+14remap, usandoprojetornativoreal para IDs.
Paridade nativefields/all8plankinds,utf8bytes/BOM/CRLF/literals,chaincycles,proibidos,
typedabsence,scope/purpose, oldmodelhistoricalnullableReasoning,copyIDs/evidências,
externalsnãoadotados,phase running suspensa,claimscompletosreviewrequired. CaseUTF8
oversize~8MiBbufferfuturoteste,nãorodou. No checks/type/lint/prettier/build/browser/
coverage/validate/diffcheck. Fontesnovasdensasaindaprecisamformat/gates. Docs30+ADR0278
+README/architecture/publicdoc. Semcommit/mergeback/push/deploy.0/5formalmente.

Descobertapara31:readBookBackupSource tokenatual hashroot/controlnativeidentity; não
observa todososcheckpointwriters. LiterarySequenceDriver.finish/literaryWorkflow.finish
atualizam jobs/receipts sem tocarroot. Capturaeditorial precisa clock/fence próprio,
coordenadocadawriter,ourevisãoequivalentecomprovada; nãoassumirrootenough. SDKinstalado
@google-cloud/firestore/types/firestore.d.ts:542–550 oferece readOnly/readTime mas comenta
limite60SEGUNDOS; transaction.js:532–536 passa readTime direto para RPC sem iniciarTX.
Nãobasearcópialonga nessaopção sem verificarcontratopúblicoerealSDK. Não foiimplementado
snapshotclock nemreadTime. Opçãocoordenadaclock requiereadapter/writers/Rules/cleanup
antesproducers, e não deve invalidar o próprio mapa de impacto ao gravar notas/checks.

Próximofundamental:captura/fence/I/O porfamília comreautorização fontes derivadas, schema
v2doPACOTE(eightsections; editorialschema1 distinto) compatívelcomarchivev1 sete/legacy
JSONv1–6; semanticmachine+índicefechado/ponteiros+restoreproof nativos; inventáriocleanup
antesrecursos eprep+reconciliação+atomicactivation+UIrevisãovisível. Não guardarmeroarquivo
inerte como substituto:contrato/fichasrestauradosdevemserutilizáveisapósaceite/reconciliação.
Relatórios/checkpointsprivadoshistóricosnãodevemseradotadospelosgatesativos. Materiaiscom
fontesrevogadasnãoexportamcachederivado;appliedownprosepreserva protocolos existentes.
Rootausente atéativação, dataseIDs/provasnãofabricados,semexecs/créditos/grantsantigos.

MCPgraphprojectE-Mega-dev-writerpósbuscaachou basebook-portability(arquivosnoCcoincidem
combaseexcetoflagliteraryrootrestore). Fonteprimária readBookPackageStep em
bookBackupPackage.mjs:175+ fazheader/counts/order estritosv1; createBookContentState /
checkpoint embookContentMachine.mjs temschema1+tags7 e16kcheckpoint; sharedsemantic
usadofrontend e bookRestoreValidationStep; não criarvalidadoresv2divergentes. Ver
bookRestoreRemap/Artifacts/AuditInventory/ActivationEffects eAGENTSADRs44–95antesprep.

Goalinteiroativo. PortabilidadefuncionalaindaNÃOexiste. Depois31+restanteportabilidade,
auditoriaE1–E5e finalfetch/incorporarprincipalsemperderdirtychanges anteschecks.90%
functioncoverage+Rulesintegrais aindaobrigatórios. Antigas5422/86,24nãovalidam24–30.

## Incremento 31 — framing/semântica editorial, produtores/restauração fechados

Ver 31-leitura-e-semantica-do-pacote-editorial.md e ADR 0279. BOOK_PACKAGE_VERSION
continua 1 e sete seções. Reader aceita versões explícitas 1/2; v2 exige oito seções,
contagens e controle editorial terminal. Parser/checkpoint/footer/selo/EOF seguem
versão real. bookBackupSchema normaliza 3 novos kinds. bookEditorialContent acoplado
à bookContentMachine só acrescenta estado/totals/warnings em v2; forma v1 preservada.
Índice metadata sem prosa; refs até64 por unidade, hash/ID originais, tipos/revisão,
links e substituições com cadeia incremental constante (sem visited ilimitado).
Descriptors usam posição: supersedes primeiro e EIDs depois, report refs antes EIDs;
mesmo ID em papéis diferentes não dispensa tipo. Continuação normaliza DTO antes hash.
Externos não fetch; unavailable explícito; versões nativas/hash não comparados avisam.

prepareBookValidationStep/completeBookValidation recebem loaded.job.source no writer
real e finalReport do ContentRead; versão/format devem igualar manifesto. Upload
contracts continuam archive1; falsificar descriptor1 com bytes2 válidos rejeita. UI
inspectBookRestoreFile rejeita2 anteshash/confirmação e não relabela como1. Structure
available e ActivationReview available recusam archive2 explicitamente; remover gates
só com captura/inventário/cleanup/prep/ativação completos. Não habilitado produtor.

25casosPREPARADOS não executados: bookBackupEditorialPackage8,bookEditorialContent15,
bookRestoreValidation1,inspectBookRestoreFile1. Fixture source terceiroarg versão
padrão1; package.test unsupported2 virou3 (2 suportado no leitor). Casos framing,
controle/dedup/tipos/ciclos/70cadeia/100refs/hashbound, frontend/serverparserparity,
nativefalsev1+bytes2 reject+cleanup,UIindexdispose. Semchecks/type/lint/format/build/
browser/validate/diffcheck. Semcommit/mergeback/push/deploy. 0/5 formalmente.

Próximo: captura/fence por família e todos source writers, reautorizar derivados,
cleanup antesprep +materialização útilcontrato/planos+históricoprivado+ativaçãoatômica.
Não produzir v2 nem liberar upload/UI antes disso. Fullplan E1–E5 e finalfetch/
incorporação principal antes checks. Cobertura90 e Rulesintegrais continuam pendentes.

## Incremento 32 — fence explícito somente dos cabeçalhos de workflow

Nova literaryBackupFence: touchLiteraryBackupWorkflow(tx,c) escreve schema1/writeId
randomUUID em books/id/literaryBackupControls/current. readLiteraryBackupWorkflowFence
reautoriza workProject, lê root+clock e confere bookBackupIdentity/digest actor/book.
Ausência explícita; clock malformado rejeita. Resultado coverage workflow-headers-only,
sem claim global. Nenhum consumidor/produtor habilitado. Módulo server-only.

literaryWorkflow: helper updateJob na própria família envolve 11 tx.update exatos
ref(c,id) e touch; criação job também touch. Todos antes/depois dos writes originais,
sem novos reads ou alteração do root. Finish superseded-only muda recibo, não header,
portanto fora da cobertura header. Cancel que altera irmãos termina updateJob também.
Rules server-only nova coleção; sceneJobs flat inventory inclui literaryBackupControls.
Sem alteração de index/boot/db global. Ainda faltam sequence/driver e todos outros
writers/corpos exportados. Clock parcial NÃO pode liberar captura de v2.

12 casos novos PREPARADOS: literaryBackupFence8, literaryWorkflow+3,
firestore/literaryWorkflow.rules+1. scenes.test limpeza existente ampliada com clock
órfão. Sem execução/checks/format/type/lint/build/browser/coverage/validate/diffcheck.
Docs32+ADR0280+architecture+publicdoc+README.0/5formalmente,semcommit/mergeback/push/deploy.

Revisão automática REJEITOU proposta anterior de Proxy global getFirestore+clock em
qualquer tx. Nenhuma alteração dessa proposta ocorreu (processo não iniciado). Não
repetir/contornar: usar integração explícita restrita por família. Alternativa atual
aprovada/executada. Primeiro script da alternativa criou só módulo e parou em assertion
count esperado12/real11 antes write Workflow; segundo completou11 updates+create e
Rules/cleanup. Nenhum estado parcial restante conhecido nessa sequência.

Próximo: coordenar sequence/driver explicitamente, demais fontes por família,
captura reautorizada e restore utilizável+cleanup+ativação. Não testes agora; antesfinal
fetch/incorporar principal preservando dirtyworktree. Goal inteiro ativo.

## Incremento 33 — escritores explícitos de 11 famílias + limpeza tardia

Branch/HEAD lidos no início: codex/producao-literaria,16d8af59f1e2739f1cf9a5b9e399212ea65438cd.
Sem fetch/testes. Antes rodada final buscar/incorporar principal novamente.

literaryBackupFence nomes atuais touchLiteraryBackupWrite/readLiteraryBackupFence;
imports Workflow e teste antigos realinhados (não há aliases antigos). Novo helper
writeLiteraryBackupProcess(tx,c,family,method,reference,...args) verifica ownfamily,
methodcreate/set/update,reference.path pai exato quatrosegmentos/idnãoempty, bookscope.
Encaminha argumentos/retorno nativos e depois touchmesmoTX; semdbadapter/proxy/boot.
Famílias11: workflow=WorkflowJobs,sequence=SequenceJobs,draft=DraftJobs,review=ReviewJobs,
milestone=Milestones,integration=IntegrationJobs,publication=Publications,
prose=ProseRequests,impact=ImpactJobs,impactControl=ImpactControls,generation=Generations.
Prefixliterarynosnomes. Token digest observação version2+families+actor/book/rootidentity/
clockidentity;retorno schema1,coverageprocess-headers-partial,families. Nada vai arquivo.

Chamadas explícitas adicionais: Sequence6,Driver2,Drafting18,Review14,Milestones13,
Integration26,Publication5,Prose10,Guide1,Confirmation1,AI6,ImpactGraph8,ImpactControl3
mais cancel direto graph1. Workflow11updates+create anteriores usam touch renomeado.
persistLiteraryPublicationStep(tx,c,target,previous,next) passa pelo helper;12callers
Publication+5Guide agora fornecemc. Stringsprocuradas e chamadaslidas manualmente.
Corpos/unidadesgeralmenteescritoscomheader; NÃO declarar todoscobertos: marco reserva
unit/sourceToken/contentHash semheader num passo. Campooperacionalnãoexportável;projetor
futuro deve excluir/reconferir nativeproof e auditar restantedasfontes.
Findings/progress/preparation/planning/contract têm rootdep/semantico em transações
existentes; rootidentity jáentraobserver, mas auditarde fato antescaptura.

sceneJobs finish lê bookTextBodies e literaryBackupControls em Promise.all comlimit1.
Seclockremanesce,phase literaryProduction e repete TODASfamiliasliterárias, não sóclock.
PermitefecharcancelImpact root(closing=true) durante deleting semórfãos depoisscan.
Finalrootdelete continua txcomrootread+tombstone/receipt. Clockúltimacoleçãoliterária.
Teste novo injeta lateImpactControl+clocknafasefinish; laço500 sócasonew (não rodado).

27novos casosPREPARADOS:14writer (11family+3guard/forward/fail),8services nativos
(5cancelterminalreplay +sequence register/link +driverstepreplay +publicationcancel),
4SDKnovo tests/firestore/literaryBackupFence.rules.test.mjs (demo localhostonlynative
Firestoreconstructor viafunctions createRequire; commitbirth/rootidentity,concurrent,
stalepreconditionrollback,abort/revoke),1scene cleanupfinal. Os8anterioresmarkerteste
nomes/coverageajustados. Nenhum teste/check/formatter/type/lint/build/browser/validate/
coverage/diffcheck rodado. Docs33+ADR0281+architecture/publicdoc/README.0/5formalmente.
Sem commit/mergeback/push/deploy. Goal inteiro ativo.

Próximo prioritário: captura/projeção fechada e reautorizada porfamília (contract/plan
primeiros), auditando corpos/jobs não cobertos. Streams7atuais mantêmprovas; podeobservar
editorial ao fim comrootoriginalestável e tokenclockprivado start→pages→recheck antes
selo; não precisa mudar tokenv1dosstreamsnem serializarprovasnativas noarquivo. Essaé
opção de desenho,nãoimplementação. Encaminhar RPCs por setor existente, registrosfechados,
IDs/hash/partes/indexes, clientpressure/tempsuccessprotocol. Produtor e restorev2ainda
FECHADOS. Depoiscleanup+materializaçãoútil+ativação+UIreview e auditoriaE1–E5+finalgates.

## Incremento 34 — projeção e captura INTERNA de contratos/planos

Worktree/branch/HEAD reconferidos: C:/Users/gaabr/.codex/worktrees/producao-literaria/writer,
codex/producao-literaria,16d8af59f1e2739f1cf9a5b9e399212ea65438cd. Nenhumfetch/check.

bookEditorialProtocol artifact admite lineage opcional {id64,rolecurrent/version}
sócontract/plan revisão>=1. DTOSchema1não publicado; produtor continua1sete seções.
Remap artifact deriva lineage por namespace próprio estável entre versões/novo por
bookdestino. Semanticmetadataindex unique editorial-lineage-version(kind,lineage,rev),
-head(kind,lineage); umcurrentcontractglobal, plan.kind imutável entre versões,
roweditorial-lineage rejeita historicalrev>headrev. Semlineagecontinua histórico,
não inferirheadpor título/maxrevna futura materialização.
Reference.scope.id null permitido SÓ universe/lore/stateunavailable, tiposd.mtsatualizados.
Remapperjádeixaexternos/unavailablesemcallback, preservanull. Nenhumaorigemfabricada.

DESCUBERTA nativa: literaryPlan permitealiases scopeIdnull vs explicitbook/world; há
combinações válidas source+subject. Retirada a restrição portátil extra de30 que proibia
qualquer alvo duplicado; references() ainda rejeita exatamenteigual. Projeçãodedup só
JSONdescriptorexatamenteigualapósnormalizaralias; preservapurpose/rev/estados distintos.
Testeantigo schemaalvo-conflitante reescrito para paridadenativa. Restauraçãonativafutura
precisarevisão/reconciliação, não reenviarefs múltiplas ao writer legadosemaceite.

NovobookEditorialProjection serversemI/O: projectBookEditorialContract/Plan,
projectBookEditorialPlanReference. whitelistliteralfields/decisions/policies; unknown
provenance, nullablemissingdates, UUID/keys/snapshots extrasignoradossem dumpJSONjob.
Lineagehash domainwriter-editorial-lineage-v1 +bookid/bookDOB/kind/nativeID;artifacthash
domainwriter-editorial-artifact-v1 +lineage/revision. Head/versionmesmarev mesmosIDs,
role difere; currentalias dedupservidor. Ref.sourceTokenNUNCAcontentHash(null). Volume
refcodec actualidbookscope; local/global originalscopeouausênciaglobalnullunavailable.

NovobookEditorialCapture createService interno NÃO registrado: getBookEditorialCaptureSource,
listBookEditorialCaptureRecords,readBookEditorialCaptureRecord,
verifyBookEditorialCaptureRecord,verifyBookEditorialCaptureSource. Coveragecontract-plan-
records-only. Famílias4 contract-current(singletonliteraryProduction/current),contract-
version(literaryContractVersions),plan-current(literaryPlans),plan-version(literaryPlanVersions).
Source root existingbookBackupSource +readLiteraryBackupFence(partial); ambosnativechecks
emtodoTX. Listsmetadata .select() /singletonreadWorkMetadata[] limit<=50+1 order__name__,
base64urlclosedcursor UID/book/family/tokens/id canonico. Nativeitemtoken inclui snapshot
create/update eactor/root/processtokens. Tokensnãosãograntnemarquivo.

readpartreprojectsavedbody emcadaTX (plan<=140kNative/DTO8MiB) ownbookauthfresh. Checa
nativeversiondocID canonical(contractrevstring;plan digest{id,revision}),headrevision/
plan.kind/payloadwhitelistcanonical; headimmutableigual retorna current-alias sembytes,
stateartifactparahead/oldversão. Source refs<=12 vi createLiteraryReferenceReader(false)
somenteoriginsmetadata, sourceToken/rev(ignoredrevforsubject) compara; descriptor unavailable
seorigem/revisãonãoconfere. Pins aggregateidentity/version native noDTO privateprojectionToken.
SerializeJSONUTF8semnormalizar, SHAfull/part,64KiBbase64 +byteLength/chunkCount. index>0exige
projectionTokenoriginal; index0opcionalpara recheck. Verifyrecord retornaapenasmetadata,
verifySourceconfereambostokens. Nenhumcorpo/sessão/chave/jobpersistido.
Ownsavedplantexto preservacomrefsrevogadas comonativegetPlan jáfaz; não autorizaexportar
rawAIcache de origemrevogada. GetAIresult/evidence/report futuros reautorizam a origem.

31novos casosPREPARADOS não executados: protocol3/remap2/semantic3/projection7/capture13/
SDK3. Existente1protocolredefinidoparidadealiases. Newfiles functions/test/bookEditorialProjection,
bookEditorialCapture; SDK tests/firestore/bookEditorialCapture.rules (demo localhost,
FirestoreviacreateRequire functions): actualmetadata/aliases+nameordering+globalrevocation
entrepartes; unittambémempty/nonwrite/currenthistorical/hashUnicodeparts/source/account/
itemmutation/clock/fork/nativevalidaliases/finalverify. Nenhumchecks/type/lint/formatter/
build/browser/coverage/validate/diffcheck. Docs34/ADR0282/architecture/publicdoc/README.
Semcommit/mergeback/push/deploy,0/5formalmente. Goalinteiroativo.

Próximo: completarprojetores/leitores para preparo/arquitetura/series (alémdosplans),
notas/decisõespróprias, propostas,evidências/relatórios e checkpoints comreautorização.
Auditarwritersforaheaderclock(root jácobrecontratos/plansnotes/prep; unit-onlynative
reservation deMilestones excluiroperacionais/reconferirproofs). Integrar RPCporregistro
setorexistente eclientstreambackpressure+census/rechecksantesfooter/selo/tempfilecommit.
Depoisinventáriorestore/cleanup, nativecurrentcontract/planúteis +arquivo privadohistórico,
ativaçãoatômica/UIreview. AindaNÃOliberarprodutor/archive2 nemupload/UIrestoregates.
Antesfinaltests buscar/incorporarprincipalnovamente;90%functions/Rulesintegrais/auditoriaE1–E5.

## Incremento 35 — notas próprias + preparação histórica metadata-first

Branch/HEAD reconferidos codex/producao-literaria/16d8af59f1e2739f1cf9a5b9e399212ea65438cd.
Nenhumfetch/test/check. Cworktreeautoritativa, originalEintacta. Goalinteiroativo.

Proto: lineage agora documenttambém(rev>=1); semantic index document-role imutávelpor
lineage, alémhead/rev únicos. Documento preparation opcional SÓroleprep: chapter,
historicalAcceptance/historicalReady bool,notes,14criteria{id,result,rationale,evidenceIds}
limitesnativos3EIDs,opcionaisnotApplicable,readycoerente/acceptanceimplicaready. Extractor
refs inclui chapter+EIDs; semanticdescriptors expectedEIDs evidence indep.doc.references.
Remap prep.chapter/evidenceIds; archivalartifactref unavailable agora DERIVAID/scopeowncopy
anteschecagem unavailable, mantémstate e nãocallmapResource. Nativechapterunavailable
continuaoriginscope/nãolookup comoantes. Não é grantnem materialização.

bookEditorialProjection envelope usa novobookEditorialRecordIdentity compartilhado
(kindcontract/plan/document,logicalID,rev); projectBookEditorialProgressNote fazdocumento
roleprogress,sectionsEtapa/Bloqueio/Próximopasso literal,sourceassoc+resource refs. Logical
noteidnamespace hashprogress-nativeNoteID, stablelineage/recordrevision; createdmissingnull.
Notes only2ownfields,max12blockers600/next4000,countflagscoerentes,unknownprovenance.
Nativeorigin/sourceToken nunca viram DTO/contentHash, sóinputs privadosdomain-separated.
bookEditorialProgressIdentity exportpara futuro. literaryProgress export interno
readLiteraryProgressArtifactMetadata (=readArtifact),metadataonlycallerreauthorizesbook.

Capturedefsagora8:adicionadosprogress-current/version epreparation-current/version.
coverage saved-editorial-records-only. Notes IDnative=digest(domainliterary-progress-note-v1,
nativeOrigin),versiondocdigest{idnote,revision}; header/versionpayload próprio completo
normalizadoalias compara privatefields+notes canonical. Sourceassocmetadata exactorigin+
sourceToken: contract/planning atuaisresolvemartefato canônicode34. Outrosestágios/mudados/
retirados têmhashdescriptorindisponívelnamespacepróprio,tokensnão exportados/nãorebaseia.
Chapter/act resource metadataonly availability/snapshotidentitypins,ownbookresourcevalid;
fonteausentenãodescartanotas. Resolverfamíliasnovasquandocaptured/frozenproofforcompatible.

NovobookEditorialPreparationCapture readmodule protegido. Baseprojection entraantesde
get(rowfullbody). readWorkMetadata mask schema/chapter/rev/date/manifest/stateToken/
gateDigest/ready/acceptance. Checa IDdoc/headnativeheader; normalizeManifest+stateToken
antesbody; authorizeLiteraryWritingManifest before ANYgateget. Revoked/notfound→parent
unavailable/source-revoked;schemaunknown→unsupported-legacy-schema, semgatebodyfetch.
Valid grants→getbody selectedhead eifalias alsoimmutablebody aftersamegrant; nativeidentity
matches,matches normalizeGate/gateDigest/ready/acceptance;aliasliteralbodyforkfail. Preserva
rawgate literals (normalizer sóvalidarproof, não substituitexto). Bodycriteria/EIDpercriterion
id+index; parentdomainpreparationdoclogicalchapter+bookDOB/rev,childdomainevidence+parent/id/
index. historicalbools ONLYnoactiveprops. Childquotesclassificationunclassified,offsetnot-
recorded,childdatesnull (dataindependentenãoregistrada);parentdateoriginal. SourcesdocumentId
plan/contract→canonicalartifactid+nativeversionorcurrentmetadataexist; refsdocumentId from
manifest.refs useoriginkind:id:purposeorvolumehash exactcodec+pins/currentVersionstate;
unknown/unrecorded source getsunavailablelogicalpointer,no sourcebodyfetch. Everypart/grant
freshTX,originalprojectionTokenrequiredafterfirst,finalrechecksrejectwithdrawal.

Prep outputtransport BUNDLE {schemaVersion1,artifacts:[parent,...children]} <=43/1MiB,
64KiBtransferpart. NÃOrecordkindnovo no.writer; futureclientunpacknormalizecadaartifact.
BaseMetadata .payload editorial-bundle/editorial-artifact +recordCount. Currentalias no
bytesduplicateinclchildren;unavailablegroup sóparent, nãoleakcriteriacount/notes/quotes.
Allreaderoperationsinternas,nãoFunctions/registry/Rules/storage/session/jobsnovos.

23novoscasosPREPARADOSnenhumrodado: annotationsCapture14(nativefixtureworkflows+local
getwatchreadonlyprovesmetadata-beforegatebody),schema2,remap2,semantic2,SDK3 appended
bookEditorialCapture.rules.test. SDKsetupactualScenes+Planning+Preparationservices,
positivebundle+alias,revokedgetmaskwatch(no productionadapter), ownnotesorphan. Existente
schema lineage titleatualizado. Nenhumchecks/type/lint/formatter/build/browser/coverage/
validate/diffcheck. Docs35+ADR0283+architecture/publicdoc/README.0/5formalmente.
Semcommit/mergeback/push/deploy. Nenhumprocessohandleaberto.

Próximo: decisões próprias de Findings/Impact (rationale semorigemrevogada x cache de
achadosprivados), propostas/report/evidence deProse/Review/Integration/Geração comnative
metadata-firstreauth,readerGuide/publication echeckpointshistóricossemcapabilities. Resolver
notasàsnovasfamíliasquandoexataproof. Architecture/series jáplanscapturados, outrosdocs
precisamcaptura. Depois RPCsetorregistrado+clientstreambackpressure/census/rechecksantes
footer/selo/tempfilecommit; restoreinventory/cleanup/materialização útilcontratos/plans+
arquivohistóricoprivado,atomicactivation,UIreview,auditoriaE1–E5 e finalfetchprincipalantes
checks90%/Rulesintegrais. Produtoreupload/UIrestore2continuamFECHADOS.

## Incremento 36 — captura interna de decisões próprias

Branch/HEAD reconferidos codex/producao-literaria/16d8af59f1e2739f1cf9a5b9e399212ea65438cd.
Semfetch/checks. Cworktreeautoritatativa. Goalinteiroativo,0/5formalmente.

Proto decision.status inclui investigating/planned/retained/deferred/correctionConfirmed,
semmaplossy. Optional references +annotation fechado{familyfinding/impact,action nullable,
state,targetType nullable,correction?{note nullable,confirmedAtnullable}}. Action/state
findingcoerentes; impactreviewed/dismissed exigeEIDs. NoeffectiveRetention/confirmationCurrent/
sourceFence/etc. Lineagepermitetambémdecisionrevpositive,semanticfamilyimmutável;refextractor
prefixacontextreferencesantes supersedes/EIDs,typedoffsetscorrigidos. Remap refs+EIDs+
lineage mantémannotationsown/private/executiondisabled. Schema/d.mtsatualizados.

NovobookEditorialDecisionCapture.read helper: masks sóownfindingfields (schema/id/rev/dates,
sourcejob/request/index/fingerprint;action/state/rationale;target;baselineidentity/version/
contentHash/revision/proofKind SEMlabel;correctionnote/date/versionId,targetRev/hash/versionToken/
proofKind SEMsuccessor/sourceFence). Impact:UIDmetadataantesownfieldsuid/job/check/controlBirth/
observation/proofHash/rev/date/status/rationale/evidence(note). NenhumResult/Check/Witness/
Controlbodyread. Kind/sourceoldrelation logicalhashnamespaceoriginalproofs +stateunavailable,
sem relabelhash/grant. Rationale texto próprioindependentefonte; impactnotes classinterpretation,
quote'', offsetsnotrecorded, datesnulas, max8children+parent<=9/1MiB,64KiBparts. Finding
owncorrectionnote/datepreserva/null ifabsent; empty projected mapcorrection={} unrecorded,
necessáriofakegetAllfieldsnulos mascorretotambémmetadatarealmissing.

Targets: contract/plan compareFindingEditorialIdentity(metaDOB)+rev→canonicalartifactID from34.
Outros native ReferenceReader(false) identity/versionmatch→logicalref available ouunavailable
semrebase. Architecture codec preservetipo/id/pai,metadata proofnãoequivalente→unavailable.
Historypointermetadata(id,target/resource,notdeleting,realhashsamecorrection)→historyVersion
ref,semrawbodyStorage. CRITICALnativeproofKindreference.contentHash == versionToken:
NUNCAcopiado. sótext/editorial reais;architecture(hash deprojeção)fica null semclaim.

Descoberta: sceneLink/narrativeLink/narrativeControl índices existentesnãotinhamrefkind,
NÃOperdertipo/id numhashopaco. Acrescentados ao DTO exclusivamentebookscope/unavailable,
parentnull. Remapearlyunavailable mantémoldprovenancee nunca chamaIdentityNative. Semântica
skipunavailableantesnativeKinds lookup, estadosrecordednewtypesrejeitados. Explicitreconcile,
nenhum novo writer/mapper/exportaclairdeíndice. arcMilestonecontinuaparexplícito.

BaseCapturedefs4novos finding-current/version eimpact-current/version somam12famílias.
Branchdecision/preparation entraANTESgetgenéricobody. Nativeidfindingdigest(job/request/index),
versiondigest{id,revision};impactdigest{jobId,checkId},versiondigest{jobId,checkId,revision}.
Comparecurrent/versionOWNmaskpayload:aliasseigual;forkfail;logicalnamespacefamily+nativeID
bookDOB+rev;linedstatesoldversionscopiadosnão effectivegate. Impactlists .select(uid),filtra
UIDsobmetadatamasavançaCURSORpeloúltimoSCANNEDmesmopáginavazia. Read UIDbeforeanyrationale;
versionown+headforeign lêhead UIDONLY,nãoalias/adotaheadforeign,nãodescartaoldownversion.
Pointers/pins rechecks before transfer metadataOnly;coveragesaved-editorial-records-only.
Nenhumaação/callable/Function/Storage/session nova. Produtorestore2continuamFECHADOS.

22novoscasosPREPARADOS: decisionCapture13(newfile canonicalnativefixturemasks/aliases/proof
kinds/correction/history/globalmissing/structural/UID/filter/foreignhead/recheck/fork);
protocol3,semantic2,remap2,SDK2 appendsbookEditorialCapture.rules (actualSDKmaskedown
finding+nativeuidempty-pageadvance/interpretations,adminseednativeformat);nãoexecutados.
ExistentesfixtureschapterlegacywordCount explicitado. Nenhumteste/type/lint/formatter/
build/browser/coverage/validate/diffcheck. Docs36+ADR0284+architecture/publicdoc/README.
Semcommit/mergeback/push/deploy. Nenhumprocessohandleaberto.

Próximo: Prose/Review/Integration/Generation reports+proposals/evidence metadata-firstnative
reauth antesbody; nativeplans/contract/prep/ownnotes/decisionsjácapturam, sourceprivatejobs
não. ReaderGuide/publicationmanifest e checkpointshistóricossemjobdump/grants. Resolver
vínculosownnotes/decisions àsnovasfontes sócomprovaoriginalcompatível. Depois APIsetorregistro+
clientstreambackpressure/census/finalproofs/footer/seal/tempfilecommit; restoreinventory,
cleanup, materialização útilcontratos/plans+histórico privado,atomicactivation/UIreview,
auditoriaE1–E5+finalfetchprincipalegates90%/Rulesintegrais. Nãoencerrarobjetivoantesdisso.

## Reconferência solicitada sobre a principal b666233

A pedido do usuário, antes de prosseguir com os testes, foi feito fetch, guardado
o estado local com untracked em stash e incorporado master por fast-forward para
b66623310d487a6052148629d80125a0673e3e0f. Stash reaplicado sem conflito e preservado.
O checkout E original permanece separado, inclusive alterações concorrentes não
commitadas. Origin/master continua 16d8af5. Nenhum commit/push/deploy/mergeback.

Resultados, correções, reconferências e limitações ficam em
[validacao-principal-b666233.md](validacao-principal-b666233.md). Backend completo
5652/5665; depois correções, 49/49 captura e 95/95 impacto/workflow/exclusão.
Frontend completo 5448/5451, três timeouts; reconferência sem alterar limites 6/6.
Cobertura de funções 85,41% < 90%, threshold preservado. Sem validate verde.
Build/smoke/tipos, sintaxe606, scripts116, E2E7, visual afetado75, impacto visual3,
componentes/hooks14 e SDK dirigido12 aprovados. Lint conferido por grupos com
rechecks dos arquivos corrigidos, dois avisos sobre contador epoch em cleanup.
Regras completas: Incompletas: timeout nativo de 30 minutos, exit 1, sem resumo integral.

Nenhuma nova família de captura de Prose/Review/Integration/Generation foi
implementada nesta rodada de validação. O escopo integral continua ativo, 0/5
formalmente encerradas e produtor/restauração editorial v2 fechados. Ao retomar,
use esta worktree C como autoritativa e preserve os resultados dirigidos separados
das suítes completas; não transforme correções com recheck em uma suíte ampla verde.

## Incremento 37 — captura de propostas e análises de texto

Implementados localmente bookEditorialProseCapture e família prose no capturador
interno (13 famílias). literaryProse exporta port interno dos headerFields e
mesma authorize, sem nova callable. Captura valida metadata/manifesto antes do
cache, preserva instrução própria, checkpoint histórico, segmento original,
proposta, relatório, título histórico e evidências. Revogação de cena/capítulo,
persona, manifesto ou cena anterior oculta derivados sem ler corpo. Running,
canceled, stale/revoked só conteúdo próprio+checkpoint+placeholders; error sem
resultado conserva segmento autorizado e indisponibilidade explícita. Fontes
alteradas não se rebaseiam. Rechecks por parte/final usam grant e projeção frescos.

DTO puro Reading opcional em report/prose saved-copy: bounds/core/UTF16, segmento/
quantidade, sourceCharacters, completeScene e previousSceneIncluded; sem tokens.
Relatório desse tipo só declara unit/excerpt e 1/segmentCount, nunca capítulo/livro.
Cópia exige extensão exata plain. IDs incluem bookBirth/requestBirth/papel, refs
explícitas checkpoint→input/report/source/proposal e report→input/source/proposal.
Citações rechecadas no snapshot, classification unclassified; plan/contract IDs
canônicos, referências nativas/volumes tipadas; desconhecidas unavailable. Modelo/
raciocínio frozen histórico público, sem keys/controles/quotas/débitos/grants.
Bundle interno até45/2MiB, partes64KiB; produtor futuro deve desmembrar, não criar
recordType novo. Fonte/global frozen inteira não é copiada indiscriminadamente.

Preparados25Node+2SDK, não executados. Nenhum teste/type/lint/formatter/build/browser/
coverage/validate/diffcheck neste incremento; revisão manual apenas. Docs37/ADR0285,
architecture/publicdoc/README atualizados. A validação anterior de b666233 NÃO prova
estas alterações novas. Não houve commit, mergeback, push ou deploy nesta rodada.
Goal integral ativo, 0/5 formalmente encerradas, produtor/restore editorialv2 fechados.

Próximo: capturas nativas literaryAI/Review/Integration (metadata-first/grants antes
de caches), ReaderGuide/publicationManifest, vínculos com fontes históricas,
composição/stream/census/finalproofs/footer/seal/tempfile e restauração útil com
inventário/cleanup/ativação privada/UIreview. Depois auditoria E1–E5, atualizar a
principal novamente antes dos gates integrais, resolver coverage90% e Rules completas.

Revisão37: evidência.context opcional fechado {format:plain,documentId,offsetBase}
explicita que offsets são do texto fornecido à IA, não HTML nativo/JSON do DTO.
Manuscript usa coverage.start como base; outros documentos zero. Sem novos refs
ou grants nesse contexto, remap conserva metadata. Comparação de metadata é
canônica; assunto usa prova nativa por identidade e revisão explícita quando há.

Revisão37: cancelLiteraryProse cria stub antes do primeiro envio, sem modo/cena/
instrução. Captura só checkpoint text-assistance/canceled, currentUnit null,
refs vazias e controles desabilitados; não fabrica conteúdo nem abre corpo.
Pedido inacessível também emite placeholder explícito de source-copy.
Casos preparados agora25Node+2SDK (27), todos ainda sem execução.

Checkpoint37 distingue entrada/segmento como source e proposta/relatório como
subject; assim os dois artefatos prose continuam distinguíveis quando unavailable,
sem precisar serializar controles ou inventar corpo.

## Incremento 38 — captura de gerações editoriais

HEAD reconferido b66623310d487a6052148629d80125a0673e3e0f na worktree C autoritativa.
Implementado bookEditorialGenerationCapture e família generation (14 famílias).
Native literaryAI.view compartilha readLiteraryAICaptureContext: mesmo resultado
para registros nativos válidos, currentproof obrigatório para liberar resultado.
Capture lê schema/operationId/state/createdAt/request próprio/snapshot.proofToken/
dependencies metadata, NÃO snapshot.documents/labels/result antes do gate. Gate
pode ler fontes atuais já autorizadas para comparar prova; não cache antigo.

Preserva owninstruction/config pública frozen/inputplan e checkpoint planning,
resultado separado. Propose gera plan proposal; audit não duplica ficha; contract
copia fields/decisions proposal|gap, nunca políticas operacionais. Revision null,
sem lineage em todos esses rascunhos/propostas: FUTUROmaterializador não pode adotar
por kind. Apenas famílias current já adotadas podem originar recursos ativos.
Running/error/stale/canceled nunca abrem cache. Stub cancel-before-start requestnull
vira checkpoint planning/canceled sem conteúdo inventado. Schema/prova ausentes
=>unsupported placeholder, owninput sobrevive. Não há alterações de quota/créditos/
manuscrito/estado. IDs usam book/request birth e papel, sem operationId no arquivo.

Procedência resolve referência nullable pelo índice metadata v1, sem labels/bodies.
Quando current usa prova recém-conferida; quando stale usa dependências originais.
Global implícito sem índice legado fica universe null/unavailable, não mundo atual.
Plan/contract refs canônicos usam originBirth da prova, nunca reetiquetam sob raiz
recriada. Aliases idênticos consolidados, papéis/revisões preservados. Input próprios
sobrevivem fontes revogadas. Nenhum metadata receipt vira grant.

Body só done+proof atual; confere identidade/request/proof/coverage e draftJSON
canônico antes de copiar resultado. Citações checadas no snapshot autorizado,
contract proíbe draft como evidência. Sem offsets nativos: null/not-recorded,
context{plain,documentId,offsetBase:null}; DTO permite base null somente com offsets
null. Report scope selected-sources, contagem nativa inclui contrato/rascunho e
não significa manuscrito integral. Modelo/raciocínio efetivos públicos frozen;
nunca keys/budgets/CAS/tokens/recibos/fingerprint. Bundle até45/2MiB, partes64KiB,
checkpoint referencia inputs source e saídas subject. Produtor futuro desmembra.

Preparados25Node+3SDK (28), nenhum executado. Nenhum teste/type/lint/formatter/build/
browser/coverage/validate/diffcheck. Revisão manual apenas. Docs38+ADR0286+arquitetura/
publicdoc/README atualizados. Resultados anteriores de b666233 não validam37/38.
Sem commit/mergeback/push/deploy; objetivo inteiro ativo, 0/5 formalmente encerradas.

Próximo: readers nativos de literaryReview e Integration/RequestRead (gates próprios),
ReaderGuide/publicationManifest, vínculos para novas fontes, host produtor/stream/
census/provas finais/footer/seal/tempfile; restauração útil de contratos/plans e
histórico privado com inventários/cleanup/ativação atômica/UI review. AuditoriaE1–E5
mais sync/fetch principal antes dos testes integrais, coverage90% e Rules completas
continuam obrigatórios antes de concluir objetivo.

## Incremento 39 — captura dos ciclos de revisão

HEAD b666233 na worktree C autoritativa. Implementados review-job/unit/analysis
(17 famílias), inspeção nativa read-only e testemunhos privados de nascimento
para novos registros. Nenhum backfill para legado; missing requestBirth não
consulta pedido atual. Público listAnalyses conserva DTO anterior. Identidade
Prose extraída sem mudar digest. Agregado só com fonte atual; relatório histórico
Prose continua passando pelo seu gate independente. Nenhuma citação duplicada.

Bundle revisão até3/1MiB, partes64KiB. chapter-scenes admite prefixo incompleto;
analyses é contador técnico. Checkpoints privados/desabilitados. Cancel stub sem
conteúdo inventado. Preparados14Node+2SDK=16, todos sem execução. Revisão manual;
nenhum teste/type/lint/formatter/build/browser/coverage/validate/diffcheck. Docs39,
ADR0287, arquitetura, publicdoc e índice atualizados. Rodada anterior não valida
37–39. Sem commit/mergeback/push/deploy, objetivo ativo e 0/5 formalmente encerradas.

Próximo: Integration/RequestRead, ReaderGuide/publicationManifest e checkpoints
históricos restantes de redação/marcos/workflows/sequências/impacto; vínculos das
novas fontes; host produtor/stream/census/provas finais/footer/selo/tempfile;
restauração útil de contratos/plans/histórico privado com inventários/cleanup/
ativação atômica/UI review; auditoria E1–E5. Sync/fetch da principal antes dos
testes integrais, coverage90% e Rules completas permanecem obrigatórios.

## Incremento 40 — captura da integração

Implementados bookEditorialIntegrationCapture e integration-job/request (19 famílias).
Native current compartilha inspectLiteraryIntegrationSource sem alterar o resultado
para registros válidos; captura é read-only. Primeiro job atual, depois gate nativo
do pedido, só então Results. Síntese arquitetural exige job done. Own note/config/
aceite histórico sobrevivem fonte indisponível; cancel-before-start só checkpoint.

Novos headers guardam captureBinding privado com jobBirth e reportSources births
antes das escritas. Resultados públicos não expõem binding. Pai recriado bloqueia
resultado; dependência recriada conserva ID original unavailable. Legado não recebe
birth observado como original; suas referências ficam desconhecidas/unavailable,
sem atribuir geração do pai atual. Gate nativo continua obrigatório para conteúdo.

DTO reportSources opcional por finding/observation é distinto de evidenceIds.
bookEditorialArtifactReferences/Content/Remap preservam e exigem alvo report.
Escopos nativos unit-segment/chapter-boundary/architecture-segment/evidence-synthesis
adicionados. Contexto evidence admite canonical-json além de plain. Citações/offsets
vêm do produtor nativo; não indexOf novo nem cópia do manuscrito. Limites técnicos
são whitelist sem sourceToken. Snapshot público effective do job original conferido,
seleção automática explícita. Bundle até242/2MiB, partes64KiB; host futuro desmembra.

Preparados23Node+3SDK=26, nenhum executado. Revisão manual apenas; nenhum teste/
type/lint/formatter/build/browser/coverage/validate/diffcheck. Docs40+ADR0288+
arquitetura+publicdoc+índice atualizados. Rodada b666233 não valida37–40. Sem commit/
mergeback/push/deploy, objetivo ativo e0/5 formalmente encerradas. Nenhum processo
iniciado neste incremento.

Próximo: ReaderGuide/publicationManifest e checkpoints históricos restantes de
redação/marcos/workflows/sequências/impacto; associações das novas fontes; host
produtor/stream/census/provas finais/footer/selo/tempfile; restauração útil de
contratos/plans/histórico privado com inventários/cleanup/ativação atômica/UI review;
auditoria E1–E5. Sync/fetch principal antes dos testes integrais, coverage90% e Rules
completas continuam obrigatórios.

## Incremento 41 — guias e manifestos históricos

Implementado bookEditorialPublicationCapture: publication-job/chapter/removal e
reader-guide-current/version, total24famílias internas. Origem/UID/bookToken e pai
antes de corpo do guia; não current mutável. Mesma permissão histórica nativa:
texto/citações próprios sobrevivem deriva do manuscrito, sem afirmar validade
atual. Identidade do capítulo preparada é comparada à nativa atual quando possível;
recriado/ausente fica unavailable. Rootrecriado fecha corpo. Hash/schema/IDs fechados.

Document.readerGuide estruturado preserva revelação, certeza, fatos, relações,
aparições e IDs das citações. editionKey só guia/manifesto. Chaves lógicas agrupam
conteúdo, não grants/encarnação/permissão. Relações targetKey remapeiam de modo
consistente. Content exige evidence por vínculo, chave única por linhagem/edição,
conserva roles e avisa alvo histórico ausente; alvos conhecidos de outra edição
são recusados. Índice guarda sómetadata. Remap troca editionKey/guidekeys/evidências/
capítulos disponíveis e mantém histórico privado. Fact autoral não muda evidência
unclassified; sem offsets nativos permanece null/not-recorded.

Current/version mesmaIDarchivística por key/revision; alias sómetadata igual à
cabeça, que entra em pin. Tombstone entrynull revisionada preserva versões. Job
checkpoint desabilitado + manifesto comdeclarações históricas; publicationAuthorized
não reativa consentimento. Capítulos/removals são registros individuais sembody/
ponteiros públicos. Cancel inicial sócheckpoint. Bundle até57/1MiB, parts64KiB;
host futuro precisa desmembrar e consolidar aliases.

Preparados23Node+3SDK=26, nenhum executado. Revisão manual apenas, nenhum teste/
type/lint/formatter/build/browser/coverage/validate/diffcheck. Docs41+ADR0289+
arquitetura+publicdoc+índice atualizados. Rodada b666233 não valida37–41. Sem commit/
mergeback/push/deploy; objetivo ativo,0/5 formalmente encerradas. Nenhum processo
iniciado no incremento.

Próximo: checkpoints históricos restantes de redação/marcos/workflows/sequências/
impacto; associações das novas fontes; hostprodutor/stream/census/provas finais/
footer/selo/tempfile; restauração útil de contratos/plans/histórico privado com
inventários/cleanup/ativação atômica/UI review; auditoria E1–E5. Sync/fetch principal
antes dos testes integrais, coverage90% e Rules completas continuam obrigatórios.

Revisão manual41: previousEditionKey preserva a ligação lógica do manifesto e
das retiradas com a edição anterior, sem copiar revisionId público. Só o papel
publicationManifest admite esse campo; remap usa o mesmo namespace de editionKey.
Essa procedência não reativa a edição anterior nem confere autorização. O caso
de retirada preparado confere igualdade das chaves entre documento e manifesto.
Sem execução de checks ou casos adicionais.

## Incremento 42 — checkpoints de redação e preservação

Implementado bookEditorialCheckpointCapture, draft-job/unit e milestone-job/unit
(total28famílias). Metadata apenas, exceto gate nativo Prose que pode reautorizar
fontes atuais. Nunca abre cache Prose ou workVersionBodies. Instrução/configuração/
limites históricos separados; snapshot effective público sem chaves. Checkpoints
privados/desabilitados, nextActionnull. Processo preservation; verifiedUnits e
adoptedUnits novos contadores. Créditos ausentes não recebem fallback inventado.

NativeDraft job.chapterBirth, unidades jobBirth/resourceBirth na enumeração; request
birth ao awaitingAcceptance com ID/capítulo/cena/modo/estado/revisão/coverage/generation
comparados à resposta. Adoção fixa historybirth após conferir target/resource/hash.
NativeMilestone fixa chapterBirth no start e job/historybirth na confirmação da
unidade, mesma transação. Todos os reads antes dos writes. Campos captureBinding
privados; views públicos continuam whitelist. Nenhuma coleção/crédito adicional.

Captureunit compara parentbirth e schema1. Prose ponteiro é canonicalID da proposta;
birth conferido sópor schemaVersion antes do grantheader; done/applied +auth nativo.
Histórico metadata confere birth/id/target/resource/deleting/contentHash real, sem
body. Recriações mesmoID/hash e legado sembinding ficamunavailable. Job capítulo
nativo original ou cena pertencente confirmados quandoháproof. Não backfill, resume,
apply ou cleanup na captura. Schemanãoconhecido job =>checkpointunavailable.
Bundles até2/1MiB, partes64KiB; host futuro desmembra.

Preparados16Node+2SDK=18, nenhum executado. Helper prepareLiteraryCheckpointFixture
em functions/test/helpers usa serviços reais e não executa casos no import. Casos
cobrem geração/aceite, adoção semdébito, preservação, vínculos, recreações eprivacidade.
Revisão manual apenas; nenhum teste/type/lint/formatter/build/browser/coverage/
validate/diffcheck. Docs42+ADR0290+arquitetura+publicdoc+índice atualizados. Resultados
b666233 não validam37–42. Semcommit/mergeback/push/deploy; objetivo ativo,0/5 formalmente
encerradas. Nenhum processo iniciado.

Próximo: checkpoints de workflows/sequências/impacto e associações restantes;
hostprodutor/stream/census/provas finais/footer/selo/tempfile; restauração útil de
contratos/plans/histórico privado com inventários/cleanup/ativação atômica/UI review;
auditoria E1–E5. Sync/fetch principal antes dos testes integrais, coverage90% e Rules
completas continuam obrigatórios. Objetivo integral preservado.

## Incremento 43 — workflows e sequências

Implementado bookEditorialOrchestrationCapture, workflow-job/sequence-job:30famílias.
Primeiro identityFields schema/job/ator/bookBirth/reg/selfbirth; sódepois instrução,
limites, fases e configuração. Regactive exige selfbirth original. Mesma separação
para associações. Não controllers/drivers, corpos derivados ou labels emcache.

Checkpoint desabilitado + documento privado: owninstruction, colaboração/modelo/
raciocínio solicitados, effective público, limites/fases históricos emtexto. Não
DTO ativo de grant. Workflowsteps e contagens anteriores identificadas como anteriores;
sequência preserva ordem até25 capítulos porbatch, index/completed coerentes e
ledger agregado aplicações/créditos/passos. Recursos capítulobirth/pertencimento/
scenes conferidos, fonte ausente não apaga conteúdo próprio autorizado.

Workflow.sequence binding congela parentbirth; completions seq guardam birth do
workflow. Capture confere ator/livro, capítulo/index e ligação recíproca atual ou
concluída; IDs canônicos iguais entre famílias. Recriado conserva pointeroriginal
unavailable. draft/review/marcos deworkflow ecurrentWorkflowId não guardam por si
childbirth: descritores opacos unavailable, não adoptarheadobservada. Compor somente
associações comprovadas nohostfuturo, sem inventar identidade legada.

Bundles até2/1MiB, parts64KiB. Preparados14Node+2SDK=16, nenhum executado. SDK usa
prepareLiteraryCheckpointFixture nativo e gerador workflow que falha seacionado.
Revisão manual apenas; nenhum teste/type/lint/formatter/build/browser/coverage/
validate/diffcheck. Docs43+ADR0291+arquitetura+publicdoc+índice atualizados. Rodada
b666233 não valida37–43. Semcommit/mergeback/push/deploy, objetivoativo0/5 formalmente
encerradas; nenhum processo iniciado.

Próximo: controles/checkpoints deimpacto e associações suficientes; hostprodutor/
stream/census/provas finais/footer/selo/tempfile; restauração útil de contratos/
plans/histórico privado cominventários/cleanup/ativação atômica/UI review; auditoria
E1–E5. Sync/fetch principal antes dos testes integrais, coverage90% e Rules completas
continuam obrigatórios. Objetivo integral mantido.

## Incremento 44 — controle e topologia de impacto

Implementado bookEditorialImpactCapture comimpact-control/graph/node/link/visit/
witness/check:37famílias. Decisões impact-current/version não duplicadas. Novo
literaryImpactRead.inspectLiteraryImpactCurrent é gate equivalente ao nativo atual:
registry/scope/fence/graphUID/birth e fallback legado exato. Controlador compartilha
helpersemwrites; captura não usa graph.load/advance mutável nemprepara índices.

UID/bookBorn/controlBorn/version antes de intent/census. Derivados exigem gate
current+GraphUID/schema/Born antes de node/link/visit/facts. Controle próprio/censo
permanece histórico sefontesnãoatuais, semclaim de validaderesultado. Nãolabels/
corpos/IA. Cap verificaçãotécnica report registered-dependencies, findings/evidence
vazios, facts whitelist primitivos ouexplicitação de metadata complexa nãoportátil.
Decisões próprias emfamílias antigas. Descriptor externo apenasproveniência
unavailable; tipos sem equivalente viram opaco unavailable.

Topologia como documentos: node tipo/âmbito +descriptor; link relação/from/to;
visit efeito/profundidade/source/node; witness source/fromvisit/link/tovisit, mesma
origem conferida contra sourceKey. IDs família/nativeKey sobcontrol+graphbirth
originais; ponteirocontrol independentegraphbirth. Destinosmetadata conferidos
(presença/chave) eausentes nãoinventados. Chave lógica SHA do vínculo correlaciona
checks/links, não conteúdo ou grant. CIDs nãoexpõemcapturetokens. Graphcheckpoint
visitas +doccontagens, controlcheckpoint +docpedido/censo. Metadata proofs/cursors/
UID/births/registrofences não serializados. Bundles até2/1MiB,parts64KiB.

Preparados12Node+2SDK=14, nenhumexecutado. Helper nativo congela mapa; Node pode
percorreraté done/partial, SDK2passos para identidade/gates. Revisão manualapenas;
nenhum teste/type/lint/formatter/build/browser/coverage/validate/diffcheck. Docs44+
ADR0292+arquitetura+publicdoc+índice atualizados. Rodada b666233 não valida37–44.
Semcommit/mergeback/push/deploy, objetivoativo0/5 formalmenteencerradas; nenhum
processo iniciado.

Próximo: hostprodutor comcatálogo/census/desmembramento/aliases/referências/stream/
pressãodeconsumo/provas finais/footer/selo/tempfile. Fechar lacunas de clock/origem
antesdehabilitar. Restauração útil contratos/plans/histórico privado cominventários/
cleanup/ativação atômica/UIreview; auditoriaE1–E5. Sync/fetch principal antes dos testes
integrais, coverage90% e Rules completas obrigatórios. Objetivo inteiro mantido.

## Incremento 45 — produtor e confirmação semântica do arquivo

Estado atual: catálogo puro de 37 famílias, sete ações em bookPortabilityApi,
cliente pelo transporte setorial existente; list.lastId permite páginas vazias
filtradas por UID, inspect devolve metadata da projeção limitada. Produtor
bookEditorialBackupRecords desmembra bundles, pula aliases sem bytes, emite links
explícitos por bookEditorialArtifactReferences, verifica partes/SHA/DTO e faz
censo completo por digest por família, inclusive vazias. Host reconfere antes de
footer/selo. Fence v3 editorial-saved-records-v1 é contrato compilado, não prova de
rollout; writer da reserva de milestone e recheck de integração tocam o marcador.

Novo neste turno: bookBackupStage cifra bytes v2 em OPFS próprio (UUID, chave
AES-GCM não persistida, IV por parte, AAD operação/posição/tamanho). Buffer64KiB,
chamada de I/O até1MiB, append congelado antes de await, estados impedem finish/
cleanup durante escrita. Só lê selado, autentica partes e rejeita bytes/corpos após
sessão/dispose. Cleanup próprio sem grant/chave remota, retirada falha repetível.
Não adota órfãos. Descarte simultâneo compartilha promise; nenhum Set de catálogo
ou arquivo inteiro em RAM.

saveBookBackup v2 espelha frames antes do destino, espera stream completo, executa
inspectBookBackupContent com índice cifrado existente, confere livro/versão/tamanho/
selo, confirma cleanup próprio e só então sink.close. Falhas abortam destino e
agregam cleanup incerto. streamBookBackup copia o port editorial antes de await do
seletor. Padrão/UI v1 preservados, restorev2 continua recusado nos dois lados.

Preparados8testes do estágio+6do host=14novos, sem execução. Testes negativos
exigem envelope válido/prova nativa antes de rejeição semântica. Fixture OPFS
reutilizável com crypto real; testes v2 existentes agora usam validador real.
Revisão manual apenas: nenhum teste/type/lint/formatter/build/browser/coverage/
validate/diffcheck neste turno. A rodada anterior pós-b666233 registrou frontend
5465/5465, mas functions85,81%<90%; backend5817/5823 com6corrigidos/reconferidos,
Rulesfulltimeout30min, 275editoriais,24produtor/host,27SDKcapture+4SDKfence nas
reconferências. Esses resultados NÃO validam o novo estágio/host.

Docs45+ADR0293+arquitetura+publicdoc+índice atualizados. Sem commit/mergeback/push/
deploy; objetivo integral ativo,0/5 formalmente encerradas; nenhum servidor ou
runner iniciado neste turno. Próximo: restauração útil contrato/plans+histórico privado, inventários/
cleanup antes dos recursos, raiz ausente até ativação atômica e revisão de vínculos
sem oldtokens ou grants inventados. Depois auditoriaE1–E5, sync principal e gates
integrais coverage90%/Rules. Não fechar a meta apenas pelo produtor interno.

## Incremento 46 — inventário v15 e projeção editorial

Implementados bookRestoreEditorialInventory (endereços/ausência) e
bookRestoreEditorialCleanup separados para evitar ciclo novo com Artifacts.
V15: editorial-record -> books/id/literaryArchive/CID; editorial-body ->
literaryArchiveBodies/CID; editorial-part -> literaryArchiveParts/CID:15digits,
index<128; editorial-control -> job/preparedEditorial/current. IDs hex64. Nenhum
produtor novo cria esses recursos no fluxo público ainda.

prepareBookRestoreArtifacts reconhece15; upgrade14 exige p13 phaseactivation-ready,
auditdone, statecontent-verified e namespaces/journals editoriais vazios. Toda escrita
de tipoeditorial exige statecontent-verified, antes de bytes/journal. Recibos do
futuro advanceBookRestoreEditorial são reconhecidos como origem nativa no v15,
sem registrar callable agora. Cancel preserva revogação persona primeiro; no v15
segue editorial e depois cover-storage. Limpeza lê journals, autentica target/
receiptbirth usando metadata, remove partes até50/unidade. Antes de headers exige
literaryArchiveParts física vazia (foreign/orphan bloqueia). Remove records/body/
control sódepois; unidade vazia certifica namespaces/journals e avança. Contador
created monotônico/cleaned += unidades, sem zerar. Generic artifacts recusa
editoriais; final emptiness inclui namespaces. Cleaners body/resource/validation/
integrity aceitam15. jobShape aceita15 com p13, mas activated ainda exige14.

bookRestoreRemap.mapJSON aceita artifact/link/control editoriais, confere frame.id/
DTO.id e part0. Usa createBookEditorialRemapper puro com hashBytes de domínio+
jobToken no HOST e native.identity para refs. O puro permanece exato4args e recusa
jobToken extra; não relaxar teste existente. Nenhum token serializado. IDs nativos
antigos intactos. readMappedItem repassa restoration disabled/private/reviewrequired/
historical, mantendo verify(tx). Fontes externas/unavailable não adotadas. Context
Evidence.documentId é rótulo histórico, não ponteiro para remapear como CID.

Preparados12Node inventário+8Node projeção+2SDK=22, nenhum executado. SDK é prova
dos helpers/birth/Rules/rollback/recriação, NÃO jornada upload/restore2. Fixtures
simulam loaded confiável; não alegar autorização ponta a ponta. Corrigidos por
leitura os fields do plano (schema completo), lineage apenas{id,role} e state antes
vs depois de instalar. Revisão manual apenas; nenhum teste/syntax/type/lint/
formatter/build/browser/coverage/validate/diffcheck. Incrementos45–46 não validados.
Docs46+ADR0294+architecture+publicdoc+índice atualizados. Sem commit/mergeback/push/
deploy/servidores/runners. Objetivo integral ativo,0/5 formalmente encerradas.

Próximo obrigatório: materializador de corpo/partes/certificado pelo leitor nativo
com verify(tx) antes da escrita; contrato/plans editáveis com pendências explícitas
sem inventar grants antes da rootbirth; ativação/revisão atômicas; leitura privada,
recaptura do arquivo restaurado no backup subsequente (catálogo/censo/fence) e
inventário de exclusão de livro ANTES de habilitar recursos em livros ativos.
Não substituir a restauração útil por preservação histórica isolada. Limite ainda
não resolvido: DTO original perto de8MiB pode crescer ao remapear IDs; o remapeador
atual aplica8MiB e partes v15<128. Resolver sem truncar antes de admitir2. Pode ser
necessário definir armazenamento por campos/referências ou um protocolo de limites
coerente; não declarar sucesso só porque casos pequenos passaram. start/source2,
Structure2 e Activation15 ainda recusam. Depois auditoriaE1–E5 e gates completos,
com fetch/incorporação principal ANTES, coverage90% e Rules obrigatórios.

## Rodada solicitada após consolidação da principal — 2026-11-04

O pedido atual autorizou conferir/incorporar a principal antes dos testes finais.
Fetch: HEAD/master b666233 iguais; origin/master 16d8af5 ancestral, sem novos commits.
Checkout E preservado. Após correções mínimas, frontend completo 5480/5480,
Functions completas 5843/5843, scripts 116/116, Chromium 7/7, build/TypeScript/smoke,
sintaxe 620 módulos, lint zero erros/dois avisos e formato aprovados. Segundo validate
reprovou apenas o gate alcançado de functions85,85%<90%; Rulesfull timeout30min,
sem aprovação integral. A cadeia validate não alcançou setup/build; suas aprovações
são separadas. Métodos editoriais internos retirados da lista pública; nenhuma
habilitação de restore/editorial público. Nenhum commit/mergeback/push/deploy.
Ver [relatório final desta rodada](validacao-final-2026-11-04.md) para detalhes e limites.
As cinco etapas continuam abertas; não confundir testes aprovados com escopo integral concluído.

## Incremento 47 — cópia nativa do histórico editorial

Turno anterior classificado como progresso: conferiu principal, corrigiu falhas e
produziu evidência completa de frontend/backend; functions85,85%<90% e Rulesfull
timeout30min permanecem gates reprovado/incompleto. Nenhum processo ficou vivo.
Neste incremento não repetir esses resultados como prova do código novo.

bookRestoreEditorial/BodyContracts fazem reserva antes de partes64KiB, SHA original,
confirmação de nascimento da parte anterior, seal separado, registro e ACK de seu
nascimento na unidade seguinte; controle/journal/job/recibo/contador atômicos.
Getter só metadata, controle privado com SHAstate. Materialized ainda NÃO inclui
censo físico final/estados editáveis/ativação. Raw original evita expansão do corpo,
mas recaptura repetida exige projetar vínculos/proveniência fora dele.

Inspeção encontrou pointer.valueHash inexistente nos itens nativos: leitor agora
obtém hash de artifact/link no índice certificado e resumo pelos totais. FonteToken
fixa hash/ponteiro/índice/validação/birth; verify(tx) precede writes. readMappedDraft
desconta cauda editorial certificada antes do rascunho; personas não usa EOF-2.

Correção da ordem46: persona-library -> cover-storage -> editorial -> resource-
children. Preserva mustFence do job, fecha capa antes de qualquer limpeza editorial.
Helpers e SDK expectations seguem a ordem; v1–v14 intactos. Não relaxar jobShape.
Admissão interna editorialPreparationfalse por padrão; não é input. Existing2
retoma/cancela sem flag; novos2 recusados antes de create. Métodos internos fora da
lista pública; activation15 segue recusada e UI/padrão continuamv1.

Fixture real nova prepara v2 por upload/integridade/validação e todos os escritores
até auditoria da base14, sem semear grants. São15casos novos preparados, nenhum
executado, inclusive8MiB/128partes, literalwire vs hashsemântico,últimoframe>64KiB,
replay,rollback,recriação de3alvos,consumo proof cancelado,cleanup real e draftpersona.
Double nativeUpdates não substitui SDK/emulador. Nenhum teste/syntax/type/lint/
formatter/build/browser/coverage/validate/diffcheck neste incremento.

Docs47+ADR0295+arquitetura+publicdoc+índice atualizados. Sem commit/mergeback/push/
deploy/servidor/runner. Objetivo integral ativo,0/5 encerradas. Próximo: contrato/
plans editáveis com revisão e identidades nativas; censo/certificados; revisão e
ativação atômicas; leitura histórica, recaptura e exclusão ANTES de admitir livros
ativos. Depois auditoriaE1–E5 e novo gate integral, conferindo principal antes,
sem reduzir coverage90%/limite Rules. Não fechar objetivo pelo materializador.

## Incremento 48 — correntes editoriais para edição

Turno47 foi progresso por mudança de código/fixture/documentação. Nenhum runner
estava vivo. Nesta continuação foram preparados contrato/planos nativos antes de
ativação, sem reduzir escopo às cópias históricas. Sem testes/checks neste turno.

Novos bookRestoreEditorialHeadContracts(project+schema), bookRestoreEditorialHeads
(serviço interno) e bookRestoreEditorialRead(authcomum). V15 interno adiciona5kinds
contract,current / contract-version,1 / plan,restorehash / plan-version,hash /
review,contract|restorehash. Namespaces vazios antes de iniciar. Cleanup retira
partes antes dos outros tipos e final confere coleções novas. Receiptwhitelist
aceita advanceBookRestoreEditorialHeads, mas BOOK_RESTORE_METHODS/globalactions
não o expõem. Factorycompõeinternamente, admissão v2 continuafalsepadrão e15nãoativa.

Bodycontrol aceita heads opcional somente em materialized; schemafechado comcursor,
created=3*(contracts+plans), contratos<=1,prova e último trio corrente/versão/revisão.
Ledger adiciona created sem reiniciar raw. Getter só metadata. Serviço scanaté16,
no máximo1candidato/step; lê original sópara contract/plan, confere source+archive,
verify(tx)anteswrites; trio/control/job/receipt comuns, ACK de nascimento/hash no
stepseguinte. prepared não é censo físico/certificado de ativação.

Projeção: só included+lineagecurrent. Versões/indisponíveis/semlineage ficamarchive.
Contrato preservaIDs locais/grafo de decisões para evitar expansão180KiB; política
explícita vira guidance, ausência permaneceausência, valor histórico emreview.
Planoidrestorehash porjob/lineage, statusproposal, refs[] e pendingReferences
portáteis remapeadas semtokens emreview. Nativeupdated/created usa timestamp real
do preparo; sourcedates/revision emmetadata histórica. Sem jobs/consentimentos
executáveis copiados. Sourcejárecusa2currentcontracts poríndice; defesalocal extra.

Preparados16casoshead(projeção+nativo)+1endereçosNode+1SDK=18dedicados. Contrato
callable exclui métodonovo. Boundary180KiB sempolicy, replay,rollback,recriação
3trios, preservaçãoarchive,ambiguidade fonte,foreignhead, cancelamento cobertos
por código de testes, NÃO execução. SDK testa helpers/Rules/birth/cleanup, NÃO
jornada2ativada. Nenhum syntax/type/lint/formatter/build/browser/coverage/validate/
diffcheck. Rodada5480/5843 anterior não valida47–48.

Docs48+ADR0296+architecture/publicdoc/índice. Sem commit/mergeback/push/deploy/
servidor/runner. Objetivo integralativo,0/5encerradas. Próximo: censo físico com
novos tipos/certificados, revisão e ativação atômicas com flags/clocks literários;
UI de fontes pendentes e leitor de histórico; recaptura diferenciando novo current
do current histórico e inventário de exclusão ANTES de ativar livros reais.
Depois auditarE1–E5 e gatesintegrais, syncprincipalantes, functions90% e Rulesfull.

A review fixa nativeRevision1/nativeContentHash para CAS futuro frente a edições;
não reutilizar pendências da cópia inicial como prova da revisão atual.

## Incremento 49 — censo físico e separação da contribuição editorial

Turno48 classificado progresso por código/testes preparados/docs, semrunner. Em49,
leitura encontrou erro real de contrato nos incrementos47–48: p13 auditdone exigia
checkedArtifacts==artifactCount-retired, mas raw/heads inflavam artifactCount após
a base. Corrigido SEM relaxar igualdade: editorialAddedArtifacts positivo sóp13,
obrigatóriojob15source2 e ausente1–14; writerraw/heads atualiza na mesmaTX, readControl
confere count==artifactCount-baseArtifacts, readOp conserva monotonicidade. Base
live usaartifactCount-retired-added; ledger global continua usando o total.

Novo bookRestoreEditorialAudit: primeiro rawwrite verifica baseSeal imutável no
mesmo nativecommitdojob; censo reconfere preparo-base exato e baseSeal anterior
à criação do controle. Layoutv14 intacto; v15 inclui raw/head/reviews e famílias
forbidden derivadasdo catálogo+literaryPlanLinks (não adotar execuções históricas).
Journal/physicalaté8; metadataonly, parentcursors, anchor última congelada; controle
mutável counted mas nãoanchor, autenticado no commitdejob todaunidade. Recibo novo
advanceBookRestoreEditorialAudit permitidointernamente, foraBOOK_RESTORE_METHODS.

Control.census opcional só materialized+headsprepared. Contexto fixa origem/proofroots,
baseSeal/contadores/layout; terminaldone confere journals==physical==ledger. Native
seal/control/job mesmo commit. openVerifiedBookRestoreEditorialAudit éportinterno
comverify(tx) revalidandojob/control/seal/context (semgrant), inválidoapóscancel.
Gettermostrasófase/counts. Ativação15/source2 segue bloqueada.

Fixture48 extraída parahelpers e aceitaAdminFirestorereal; fimheads consultaAPI
metadata emvezMap paraSDK. Preparados13Node+1SDK=14 dedicados: counterbase/ledger,
páginas,controlemutável,orphan/missing,2recriações,baseSeal,replay,rollback,consumo
cancelado,input/UID,coleçãooperacional. SDK percorre upload2->validar->base14->raw->
heads->censo, nativeTime/Rules/cancel/cleanup; NÃO HTTPAuth/AppCheck nemativação.
Nenhum teste/syntax/type/lint/formatter/build/browser/coverage/validate/diffcheck.
Rodadasanteriores não validam47–49. Sem commit/mergeback/push/deploy/servidor/runner.

Docs49+ADR0297+architecture/publicdoc/índice. Objetivo integralativo0/5. Próximo:
revisão/ativação comcenso+flags/clocks, fontespendentes comCAS, histórico privado,
recaptura agrupandoorigens semexpandirJSON8MiB/nem duplicarcurrent, inventário de
exclusãoANTES deativar livrosreais; auditarE1–E5 e gatesintegrais comprincipalantes,
functions90% e Rulesfull. Não fechar pelo certificadointerno.

## Incremento50 — exclusão do arquivo no livro

Turno49 foi progresso: censo/contador/certificado+testes preparados+docs, semrunner.
Nesta50, inspeção do sceneJobs mostrou raw archive/reviews fora da lista plana.
Criados bookEditorialStorage (endereços comuns4) e bookEditorialArchiveDeletion
(planos metadata, rootauthor+deleting+publicRootausente, limite1..50). Sharedstorage
adotado no RestoreInventory; sem importar protocolo de restore na exclusão ativa.

sceneJobs inclui faseeditorial-archive apósarcs anteschapters; legado semarquivos
não ganha callbackvazio extra. Ordemparts->bodies->records->reviews, recomeça pelas
partes emcadaunidade. Caller confirma plano/deletes/count/checkpoint/receipt TX.
finish probe4coleções redirecionaparaarchive sequalquerrestar, cobrindo1–3 cursors
passados ebodyórfão tardio. Depoisrefazflatpass normal; fence literário existente
continua. Não muda cleanupVersion3/loreprotocolv3. Wholebookremoveprópriosfilhos,
sem grants/chaves derestore; cancel privado continua inventáriopróprio nativo.

Preparados8Node+1SDK=9dedicados:53partes,metadata/página/ordem,auth/revocation,
API normal,correntes+versões,otherbook/library/externaljob preserved,latefinish,
3legacyversions,rollback/retry/terminalreplay. SDKAdminreal+Rules usa livro próprio
jádeleting, NÃO restauração2ativada nemHTTPAuth/AppCheck. Nenhum teste/syntax/type/
lint/formatter/build/browser/coverage/validate/diffcheck. Aprovações anteriores
não validam47–50. Sem commit/mergeback/push/deploy/servidor/runner iniciado.

Docs50+ADR0298+architecture/publicdoc/índice. Objetivo integralativo0/5. Próximo:
revisão/ativação comcenso+flags/clocks, histórico privado e fontespendentes CAS;
recaptura comorigens explícitas sem duplicarcurrent/nemexpandirJSON8MiB; auditoria
E1–E5 e gatesintegrais comprincipalantes, functions90%/Rulesfull. Exclusão preparada
é prérequisito, não liberação de ativação.

## Revalidação após os incrementos 47–50

Atendida novamente a ordem de reconferir a principal antes dos testes:
fetch origin + merge --ff-only master confirmou Already up to date, HEAD/master
b666233 e comparação 0/0. As 48 entradas não commitadas da principal original
continuaram preservadas, sem serem copiadas. Nenhuma implementação de ativação
foi acrescentada nesta rodada.

Primeiro validate parou em 33 arquivos de formatação; segundo em dois restantes.
Correções delimitadas e format:check integral posterior passou. Skills,
arquitetura, docs/styleguide aprovados; lint zero erros e dois avisos existentes;
sintaxe 626 módulos. Frontend 5480/5480, 429 arquivos, mas comando reprovado por
functions 85,85% < 90% (statements87,18/branches82,68/lines90,32). Scripts116/116,
TypeScript/build/smoke aprovados; Chromium7/7 somente navegação/styleguide.

Functions primeira integral5894/5896. Duas fixtures novas violavam JSON canônico
e frame máximo64KiB. Produto/limites preservados: teste positivo usa texto com
BOM/Unicode/CRLF/escapes em JSON canônico; item70KiB usa dois frames válidos.
Adicionados dois casos negativos exigindo rejeição de JSON não canônico e frame
maior que64KiB. Arquivo17/17; repetição integral Functions **5898/5898**, nenhum
skip/cancel/fail. Expectativas antigas sobre wire não canônico/frame>64KiB eram
incorretas e não foram comprovadas pelo incremento47; docs corrigidas.

Rules completas **timeout30min exit1**, sem resumo integral; não houve aprovação
de segurança. Não ampliado timeout nem reduzido coverage. Dois validates pararam
em formatação; aprovação separada posterior não vira validate verde. Não somar
casos de execuções dirigidas aos totais integrais.

Relatório: revalidacao-incrementos-47-50.md. Logs ignorados principal-current-*.
Objetivo integral continua ativo; 0/5 etapas encerradas. Sem commit, mergeback,
push ou deploy. Próximo: revisão/ativação interna com censo/flags/clocks e padrão
fechado; leitor privado e fontes pendentes CAS; recaptura sem duplicar current
ou expandir JSON8MiB; auditar E1–E5, resolver cobertura90% e Rules completas.
Não confundir materialização/censo interno com restauração pública utilizável.

## Incremento 51 — ativação editorial interna

Turno anterior foi progresso: reconferência de principal, execução das suítes,
correção de duas fixtures e formatação, backend5898/5898, frontend5480/5480,
scripts116/116, Chromium7/7, build/lint/syntax626 aprovados. Coveragefunctions85,85
abaixo90 e Rulesfulltimeout30min continuaram reprovados/incompletos. Processos e
listener encerrados; sem mergeback/commit/push/deploy. Evidência no relatório da
revalidação47–50; não reutilizar esses números como prova deste incremento51.

Implementados bookRestoreEditorialActivation e composição em ActivationReview,
Activation/Effects/Contracts, Upload/Contracts, EditorialAudit e Artifacts.
Host editorialActivation=false independente de editorialPreparation; nenhum boot,
DTO, método público/callable/Rules habilitado. Revisão C1v15 exige censo pronto,
mostra counts somente e fixa certificado no reviewToken. Ativação grava certificado
fechado schema/contextToken/controlToken/sealToken no recibo; obrigatório sóv15
source2. Raiz privada recebe hasLiteraryResources, clocks1 quando currentheads,
0 quando sóhistórico; dependency0. Política explícita marca hasLiteraryPublications
sem publicar. Nativeheads continuam guidance/proposal/refs[], arquivo intocado.

Retirev15 verifica censo e troca sócontrol.census.sealOperationId com journal/job/
reciboTX, created0 e baseaudit imutável. Censo aceita selo de retire e seu mesmo
commit. Funciona comflagoff, como a confirmação de ativação jáfeita. Idexato de
retire fecha activate sem criarroot; outra tentativa precisa freshreview/ID.
Histórico continua job/reserva/recibo nativos e nunca grants do livro atual.

Fixtures recebem opção privada e helper faz atécenso/reviewsemseed. Preparados
17Node+1SDK: padrãofechado,semcenso,metadata,atomicidade,normalwriterscontract/plan,
retire/replay2/oldreview,2recriações,cancel/cleanup,rollback,edits/deletion historical,
closedcertificate,historyonly,account/input,wholebookdelete,publicationpolicy.
SDKAdminreal percorre source2->base14->raw->heads->censo->ativação->normaledits->
wholebookdelete, timestamps eRulesprivacidade. NÃO HTTPAuth/AppCheck nemUIpublica.
Nenhum teste/syntax/type/lint/formatter/build/browser/coverage/validate/diffcheck
executado nesteincremento. Revisão manual de fontes/contratos e edições somente.

Docs51+ADR0299+architecture/publicdoc/índice. Sem commit/mergeback/push/deploy/
servidor/runner. Objetivo integral ativo0/5formalmenteencerradas. Próximo: leitor
privado do arquivo/pendências por autorização atual e CAS, incluindo cleanup da
origem de restore; recaptura agrupandohistórico sem duplicarcurrent/nemexpandir
JSON8MiB; UI e abertura pública sódepois. AuditarE1–E5 e gatesintegrais comsync
principalantes, coveragefunctions90% e Rulesfull. Não fechar pelo caminho interno.

## Incremento 52 — leitor privado após cleanup da origem

Turno51 foi progresso: composição de ativação/revisão/retire v15+certificado e
clocks nativos, testes preparados e docs. Não executou testes/checks. Este52
leu ArchiveUnits e encontrou journals removidos no cleanup normal. Não depender
deles para o arquivo permanente. Foram criados bookEditorialHistoryOrigin,
HistoryContracts/History e composição interna no RestoreUpload. ArchiveUnits
v15 reconfere testemunho metadata antes das unidades; não altera layoutv14.

readBookEditorialArchiveProof confere controle/censo/ledger e tokens do certificado,
selo/checkpoint/preparation e nativeactivationreceipt; pode servir cleanup após
rootdeleted como metadata, nunca grant. readBookEditorialHistoryOrigin exige
rootatualdono/nãodeleting/flag/restoreOrigin e nascimento da ativação. Root/job/
control/seal recriados iguais nãoherdamacesso. Controle metadata semprosa/chave
permanece apósjournals/sourcecleanup; recibos históricos também permanecem.

History lista metadata1..50 porcursorligadoàorigem; getheader/bodyconfereCIDdojob,
sourceBook/index, cutoffheader imutável, bodyBirth+commit. Partmetadata valida
index/size/hash/cutoff e depoisbytesSHA<=64KiB. PortopenVerified entrega partes,
tokens/cadeia/SHA e verify(tx)reauthorizaorigem/item; unit.verify sómetadata, sem
relerbytes. Consumidor deve conferir SHA/cadeia íntegros e reautorizar no fim.
Não mapear IDs dentro do JSON8MiB nem resolver fontes externas na leitura.

getBookEditorialRestoreReview valida revisão imutável, sourceartifact e versão1
nativa. Birth+revision+hashcurrentdetermina unchanged/changed/missing; recriação
igualéchanged. Tokeninclui corrente/review/version econtexto; referências ficam
históricas semgrants. Importante: só base/token de comparação, NÃO aceite/CAS de
escrita implementado. Originaldraft indisponível apósmudança; não sobrescreve.

Headfixturepassa idopcional para testes deduasorigens. FixtureHistory usa percurso
source2->base14->raw->heads->censo->ativação real; cleanup finaliza mídia none e
removeorigemnormal. Preparados22Node+2SDK: páginas/metadata/bytesSHAcadeia,cleanup
pósleitura eapósrootdeleted,closedUID,4origensrecriadas,3resourcesrecriados,tamper,
heldproofrevoked/deleting,normalwriter/pendingtoken,headmissing/recreated,cursors/
indices. SDKnativeconferetimes/Rules/leituraapóscleanup/revocation; NÃO HTTPAuth/
AppCheck/UIpublica. Nenhumrunner/test/syntax/type/lint/formatter/build/browser/
coverage/validate/diffcheck executado; 5898/5480 não validam51–52.

Docs52+ADR0300+architecture/publicdoc/índice. Semcommit/mergeback/push/deploy/
server/runner. Objetivointegralativo0/5. Próximo: aceite/reconciliação explícitos
comCAS eUI; recaptura agrupada preservandoJSON/IDscontextuaiss em8MiB sem duplicar
current; integração cliente+abertura somente apósgates. AuditarE1–E5 e reconferir
principal antes de testes; resolverfunctions90% e Rulesfull. Não encerrar pelo
leitor interno nem tratar tokenreadonly como aceite persistido.

## Incremento 53 — aceite e reconciliação com CAS

Turno52 classificado progresso: leitor/Origem/contratos, testemunho apóscleanup,
22Node+2SDK preparados e docs; semrunner/checks. Neste53 extraído literaryPlanWrite
prepareLiteraryPlanSave do saveLiteraryPlan normal, preservando DTO/recibo/CAS/
freshrefs/no-op/index/versions. Portcommit pode omitirrootwrite para caller
comporuma sóatualização. Modificações no escritor normal exigem regressão futura.

Historyitem/record extraídos em bookEditorialHistoryRead para reuso transacional.
ReviewRead/Store/Service novos, compostos internamente em RestoreUpload. Token
inclui clockroot literaryRevision junto de origem/review/current/version/resolution;
HistoryOrigin inclui campo no mask mas NÃO no contexto dos bytes imutáveis.
keep-current metadataack nãoedita/recriahead, inclusive missing; reconcile-references
sóplanexistente/refs12explícitasfresh, semtrocartítulo/status/fields/prosa. Reusa
writer nativo e reautoriza naTX. RootlitRevision/updatedAt uma vez, ContextRevision
sóquandoalteraplano. Arquivo/revieworiginalintocados, semcopiargrants/policiesold.

Store names novos literaryRestoreReviewResolutions/{reviewid} imutável1pororigem e
literaryRestoreReviewOperations/{operationId}. Somente IDs/escolha/hashes/origem/
basis/nativeRevision/birth/time, semprosa/listarefs/chaves. Receipt e resolução
nascimento comum, requestHash exato; replay metadata histórico antes de freshrefs,
massempreauthorizaçãoraizatual. Ordemdifferent operationID nunca sobrescreveACK.
Um par ausente/recriado falha; ambosperdidosnãoaceitamwireantigo porclockavançado.
getOperation ausência=unconfirmed, nãoautorizareenvio. ReadviewreviewState separado
statecurrent, nativeBirth/hash/revision detectamedição/recriação pósACK; missingACK
mantém currentChangedSinceAcknowledgement false quandocorrentecontinuaausente.

RegistryStorage e ArchiveDeletion incluemambosantesprodutor; wholebookdeleting
bloqueiawriters/lookup/replay ecleanupconferevazioantesroot. Sourcearchivecleanup
preservares/opslivro. Inventoryassert eActivationReview exigemnamespacesvaziosantes
root, semmudarlayout/certificadoC1v15. Duas Rulesdenies explícitas, nenhumgrantnovo.
Métodos reviewBookEditorialRestore/getBookEditorialRestoreReviewOperation continuam
foraBOOK_RESTORE_METHODS/registro público; nenhumbootflaghabilitado nemUI.

Preparados26Node+2SDK. Fixturefazprotocolo2atérootativa; criaato própriocomnascimento
nativo eusa listLiteraryReferences normal, não seedgrant. Cobrekeep/reconcile,
manual/stale/missing/contract,rawrefsinvalid,sourceupdate/delete/recreate,external
volumeauthloss,replayafteredit/revoke semlivegrant,wiremismatch/secondack,race,
rollback,2recreated/2missingpairs,bothlostclock,noOp,owner/deleting,sourcecleanup+
wholedelete,2orphanC1namespaces,closedinput. SDKrealnativecommit(plan/root/res/op),
Rulesprivacy,revokedsource/CAS/race/delete. NÃO HTTPAuth/AppCheck/UIpublica.
Nenhumrunner/test/syntax/type/lint/formatter/build/browser/coverage/validate/
diffcheckexecutado; 5898/5480 não validam51–53. Gitbranchcodex/producao-literaria,
HEADb666233confirmadosporleitura; originalEintocado.

Docs53+ADR0301+architecture/publicdoc/índice. Semcommit/mergeback/push/deploy/
server/runner. Objetivointegralativo0/5. Próximo: painel e seleção derefs, wires
congelados/recuperação peloresolverpróprio eCASsemperderrascunhos; recaptura agrupada
incluindoACKcomo histórico semgrants, semexpandirJSON8MiB/duplicarcurrent; integrar
clientepúblico sócomfluxocompleto. AuditarE1–E5, reconferirprincipal e gates antes
integração; resolvercoveragefunctions90% e Rulesfull. Não encerrar no writerinterno.

## Rodada solicitada de sincronização e testes — 2026-11-04

Fetch origin e merges ff-only master/origin-master: Already up to date, HEAD e
master b666233, origin/master16d8af5 ancestral. 48 alterações originais E preservadas,
sem copiar conteúdo não commitado. Worktree codex/producao-literaria. Nenhum código
alterado nesta rodada; sem commit/merge-back/push/deploy.

Estado 54 incompleto: painel/CSS/picker existem, mas importa BookEditorialHistoryBrowser
ainda ausente; slot/composição cliente, testes específicos e docs54 pendentes.
Os oito métodos editoriais já estão no registro de setor, sem abrir fonte v2 no boot.

Resultados reais: validate falha em41 arquivos de formatação; architecture/docs/
styleguide/skills passam antes disso. Typecheck3 erros (módulo ausente,2 props
message em LoadingState). Lint interrompe no lote10/39 com5 erros no journal e4
avisos; não validou lotes posteriores. Scripts116/116, sintaxe637 módulos.
Functions5959/5963:2 fixtures chamam limpeza sem iniciar exclusão;2 contratos de
domínio esperam453 versus461 e não reconhecem8 métodos editoriais. Reprodução
isolada confirmou esses4 pontos. Frontend5480/5480,429 arquivos, cobertura functions
85,17%<90 (statements86,55/branches82,23/lines89,92), exit1. Rules2 falhas observadas
no arquivo de review e timeout30min sem resumo integral; não inferir aprovação.
Todas as sessões encerradas e porta58745 sem listener. Build/browser não executados.

Relatório detalhado: [revalidação 51–54](revalidacao-incrementos-51-54.md).
Logs ignorados current-main-54-* em .firebase/local-validation. Nenhum ajuste
de fixture/expectativa/limite foi feito nessa rodada. Próximo: concluir54 e
resolver gates; recaptura agrupada/aceitesE1–E5 continuam pendentes,0/5 fechadas.
