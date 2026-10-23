# Instruções do projeto

## Leia primeiro

1. README.md
2. docs/architecture.md
3. docs/development-process.md
4. docs/testing.md
5. docs/styleguide.md (antes de qualquer trabalho de interface)

## Processo obrigatório

1. Entenda a solicitação e os critérios de aceite.
2. Inspecione os arquivos relevantes e os testes existentes.
3. Apresente um plano para mudanças que afetam vários arquivos.
4. Mantenha as alterações dentro do escopo solicitado.
5. Adicione ou atualize testes para mudanças de comportamento.
6. Execute testes direcionados a cada ajuste e `npm run validate` no fechamento de grandes blocos.
7. Revise o diff final.
8. Atualize a documentação afetada.
9. Registre a evidência da entrega em `docs/entregas`.

## Arquitetura

- Organize as capacidades do produto em `src/features`.
- Não importe arquivos internos de outra feature.
- Use as exportações públicas das features (index.ts).
- Mantenha APIs externas e armazenamento do navegador atrás de serviços.
- Mantenha `shared` neutro em relação ao domínio.
- Centralize capacidades de raciocínio no contrato puro `functions/src/chatGeneration.mjs`, sem I/O ou credenciais.
- Não adicione abstrações sem necessidade demonstrada.
- Reutilize parser, revisão e prévia pela API pública de document-import; preserve os reexports legados de books.
- Mantenha `campaign-deletions` folha, importando apenas auth/shared; componha-a em `campaigns` e use essa interface no Estúdio.
- Mantenha `campaign-sessions` folha de auth/shared; componha painel e closer somente em `campaigns` pelas interfaces públicas.
- Mantenha `campaign-preparation` folha de auth/shared; componha editor estável, slot e closer em `campaigns`, fora de `materialEpoch`, conforme ADR 0040.
- Limite `campaign-session-references` a auth/shared, projeções públicas puras C2 e tipos/verificador puro `verifyCampaignBaseFields` de campaign-bases; não use readers/loaders B fora do gate da sessão e componha slot, pendência e closer em campaigns.

## Estilo e interface

- Siga `docs/styleguide.md`.
- Use finais de linha LF, definidos por `.gitattributes` e `.editorconfig`.
- Cores, superfícies e estados visuais vêm das variáveis de tema semânticas em `src/styles/globals.css` (`--background`, `--foreground`, `--primary`, `--secondary`, `--card`, `--border`, etc.).
- Suporte a temas dinâmicos via `src/shared/theme` (`ThemeProvider`, `useTheme`, `ThemeToggle`): Claro (`light`), Escuro (`dark`) e Sépia (`sepia`).
- Ícones somente de `lucide-react`, com a classe `icon`; acrescente `icon-sm` para o tamanho menor.
- Monte as telas com os componentes modulares de `@/shared/ui` (`Button`, `Input`, `Textarea`, `Dropdown`, `Slider`, `Badge`, `Card`, `Dialog`, `Alert`, `LoadingState`, `EmptyState`, `ErrorState`, `PageHeader`, `Table`).
- Campo de formulário sempre pelo `Input`/`Textarea`/`Dropdown mode="select"` de `@/shared/ui`; use `Slider` para atributos de 0 a 100.
- Use `Dropdown mode="action"` para menus de ação; siga a API de `docs/dropdown.md`.
- Toda tela que busca dados cobre carregando, vazio, erro e sucesso.
- Mantenha a rota `/styleguide` funcionando e atualizada com os temas.

## Escopo

- Não expanda o escopo além do solicitado.
- Uma funcionalidade por vez.
- Siga os contratos e portões por incremento em `docs/tasks/writer-v2/execucao/06-contratos-e-replanejamento.md`; confira o estado no registro de execução.
- A autorização registrada de F2-01 permite implementar o Estúdio com contratos técnicos aprovados; preserve pendências humanas/comerciais nos seus próprios aceites, sem declarar a fase 1 integralmente concluída.

## Dependências

- Não adicione dependências sem explicar a necessidade.
- Prefira APIs da plataforma e dependências existentes.

## Segurança

- Nunca faça commit de segredos.

## Armazenamento e APIs

- Chamadas HTTP em serviços/clientes.
- Acesso a localStorage em adaptadores/repositórios.
- Leitura de `import.meta.env` só em `shared/config/env.ts`.
- Mantenha geração de livros e débitos de créditos em `functions`; configure segredos somente no servidor.
- Mantenha conversas de capítulo privadas e sem débito; aplique sugestões com manuscrito, crédito e recibo atômicos em `functions`.
- Congele provedor, modelo e raciocínio dos pedidos de chat; nunca inclua chaves em snapshots, histórico ou recuperação.
- Resolva lore/persona de cenas e blocos no servidor e reautorize a origem nativa antes de cada derivado; siga `docs/tasks/writer-v2/execucao/30-contratos-do-chat-de-cenas.md`.
- Preserve perguntas próprias ao ocultar respostas revogadas; origem recriada não reautoriza histórico antigo nem remove prosa aplicada.
- Mantenha o journal de editorChat somente com metadados, CAS integral e Web Locks curtos; não perca ponteiros antes de consumo ou cleanup confirmado.
- Use captura/aceite pelo host e bridge públicos; adote metadados sem resetar o editor e não habilite débito legado nos novos alvos.
- Incremente o clock local de lore do livro na mesma transação de cada writer; coordene writers/regras e drene clientes antigos antes do rollout.
- Na criação assistida, mantenha sessões, entrevista, validação e confirmação do livro/lore/capa com débito atômico em `functions`.
- Mantenha vínculos e exclusão de imagens da biblioteca no servidor; todo seletor de imagem deve oferecer `ImageLibraryPicker` pela interface pública da feature.
- Mantenha universos, vínculos de livros e mutações de lore global em `functions`.
- Preserve a revogação do lore global por versão nas regras e no leitor público.
- Mantenha lore próprio de aventuras nas cinco APIs de servidor; metadata, corpos, recibos e fences não admitem SDK direto.
- Preserve contextToken/encarnação e CAS do lore local; menções exigem todas as páginas locais antes das globais e detalhes só por get autorizado.
- Mantenha a origem/hash global antiga; captura local usa origem adventure-lore e originAdventureToken interno separado, conferido com a raiz atual antes de derivados B/C2/C3/S2.
- Pedidos incertos de lore de aventura ficam somente em memória; não adote corpo atual por confirmação histórica nem rebaseie rascunhos silenciosamente.
- Mantenha aventuras/campanhas, recibos de criação e preparação do Estúdio no servidor; use paginação por tipo/dono e preserve identidade/conteúdo dos livros legados.
- Importe aventuras pelo protocolo da ADR 0042: reserva permanente, raiz ausente até ativação atômica e limpeza limitada sem excluir projeto ativado.
- Persista a revisão confirmada cifrada e aguarde oncomplete antes de append; não persista PDF ou chave e obtenha a chave somente por HTTP autorizado sem cache.
- Confira encarnação, hash e keyId antes de alterar controles locais de importação; preserve CAS binário integral e remova chave/sinopse temporária no encerramento remoto.
- Datas válidas de livros não podem ser removidas ou invalidadas, inclusive por mutações Admin; preparação usa metadados reais do snapshot, sem inventar datas.
- Vínculo de universo e criação do projeto são atômicos; exclusão confere contadores e referências de livros, aventuras e campanhas.
- Mantenha cenas, conversão, contagens e jobs em `functions`; compare revisões observadas e preserve prosa ao remover agrupadores.
- Componha capítulos em modo cenas somente pela prosa ativa ordenada; preserve a fonte legada e não exponha planos privados na publicação.
- Capture revisões de cena na publicação e de cenas/narrativa no backup; bloqueie escrita legada e exportação durante exclusão do projeto.
- Mantenha arcos, marcos, cronologia e jobs em `functions`; revalide a origem das referências em cada consulta.
- Ordene arcos, marcos e eventos independentemente da composição do manuscrito.
- Atualize referências explícitas de cenas e o índice de entidades atomicamente; não crie vínculos por detecção textual.
- Preserve os marcadores narrativos e limpe seus filhos pelo protocolo `deleteSceneBook` antes de remover o livro.
- Atualize o ledger de palavras atomicamente com a prosa; preserve checkpoints e confirme recibos incertos antes de enviar outra edição.
- Após ativar `hasProgressResources`, altere corpo/contagem e criação/exclusão de capítulos somente pelos escritores de `functions`.
- Separe estado editorial de publicação; registre retomada somente por tipo/IDs/data, revalidando autorização e revisão global por usuário.
- Guarde histórico privado somente por captura manual ou antes de restaurar; retenha até exclusão explícita da versão ou projeto.
- Incremente `historyRevision` na mesma transação de criação/retirada de versão e cópia anterior; preserve o contador no cliente, replay e cleanup.
- Capture histórico completo com o mesmo token nativo por página e reautorização final; coordene writers/Rules e drene instâncias antigas antes de habilitar, conforme ADR 0044.
- Use o fluxo por ID/hash incremental para backup de histórico; preserve UTF-8/BOM literais e confira a prova antes do selo, conforme ADR 0048.
- Verifique selo/EOF do contêiner inteiro antes de confiar no backup; mantenha validação semântica/autorização separadas do framing, conforme ADR 0045.
- Avance updatedAt do livro atomicamente na criação SDK de ato/capítulo e na remoção de capítulo ativo; preserve a limpeza já deleting, conforme contrato 35.
- Confira a prova nativa da estrutura após todas as seções e antes do selo; não remova controle de progresso ativo nem trate tokens como dados portáteis, conforme ADR 0047.
- Capture cenas/fontes/narrativa com tokens nativos de item/pai e conferência final; preserve slot de ordem, recuse manutenção e projete referências somente por IDs, conforme ADR 0049.
- Capture lore próprio sem resolver global e personas somente por vínculo autorizado; confira identidades nativas externas, inclusive perfis arquivados, antes do selo, conforme ADR 0050.
- Capture universo por vínculo da raiz, sem metadata global; confira encarnação/autorização e não promova descriptor indisponível ao restaurar, conforme ADR 0051.
- Congele rascunho explícito antes de await, inclusive vazio/removido; reautorize seu perfil declarado próprio e não salve nem recrie capítulo ao capturar, conforme ADR 0052.
- Capture capa somente por biblioteca/uso próprios e geração Storage fixada; reautorize antes/depois do I/O, confira hashes e rode test:media para esse protocolo, conforme ADR 0053.
- Componha backups com pressão de consumo, provas reconferidas antes de footer/selo e arquivo temporário confirmado só no sucesso; envelope-only não autoriza restauração, conforme ADR 0054.
- Valide conteúdo com DTOs fechados, hashes, partes, índices e vínculos antes de revisão; mantenha índice temporário protegido e limitado fora da RAM do projeto e limpe só a operação própria, conforme ADR 0055. Relatório do cliente não autoriza ativação.
- Leia JSON de backup v1–v6 por spans e mantenha procedência/ausências legadas explícitas; não fabrique selo/histórico/datas, não busque URL de capa nem promova lore global inline, conforme ADR 0056.
- Reserve restaurações de livro por nascimento nativo e marcador tipado em deletedBooks; mantenha raiz ausente e uploaded separado de validado/ativado, conforme ADR 0057.
- Remova bytes/chave somente pelo cleanup versionado da restauração; amplie seu inventário antes de criar recursos de preparação e preserve reservas permanentes.
- Confira SHA integral por checkpoint privado e provas nativas; bytes-verified não valida conteúdo nem autoriza ativação. Limpe estado SHA/provas pelo inventário v2, conforme ADR 0058.
- Use o mesmo núcleo semântico para novo/legado; vincule checkpoint/índice à origem no host e não aceite semantic-only ou prova raw do cliente como autorização, conforme ADR 0059.
- Confirme leituras nativas e índice/item/checkpoint/recibo juntos na validação servidor; preserve vínculo de nascimento e cleanup v3, conforme ADR 0060.
- Valide JSON legado pelos passos compartilhados e snapshot v2 opaco privado; meça o payload antes do escape, preserve codec archive v1 e não trate procedência como autorização, conforme ADR 0063.
- Consuma itens validados somente pelo leitor interno e confira verify(tx) antes de escrever na mesma transação; preserve origem nativa e provas por unidade, conforme ADR 0064.
- Remapeie IDs por contexto/tipo/pai fixos e chaves nativas; trate relações de lore em páginas com prova do índice, sem alterar prosa ou autorizar origem externa, conforme ADR 0065.
- Prepare estrutura restaurada com journal nativo/cursor/recibo atômicos e clone por tentativa; preserve cleanup v4 e checkpoint fixado da validação, conforme ADR 0066.
- Prepare lore próprio com varredura separada, relações paginadas e provas reconferidas no commit; preserve inventário v6, ausência da raiz e campos sem truncamento, conforme ADR 0072.
- Prepare cenas/narrativa sob inventário v7, limpando filhos registrados antes dos pais; reutilize vínculos idênticos sem regravar o journal e reconcilie contagens antes da raiz, conforme ADR 0073.
- Reconcilie restauração de livro pelo ledger e artefatos comprovados; preserve inventário v8, no-op integral e countReady false enquanto a raiz estiver ausente, conforme ADR 0074.
- Prepare definições de persona sob o job com inventário v9, conferindo vínculos e igualdade; preserve ausências e arquivo sem adotar perfis atuais da biblioteca, conforme ADR 0075.
- Reconcilie personas dos vínculos salvos com a contribuição exclusiva do rascunho verificado; preserve draftProfileId no replay e certifique a definição antes da raiz, conforme ADR 0078.
- Reautorize a encarnação do universo na transação final de restauração e componha vínculo estrito com a raiz; não promova unavailable nem use observação como grant, conforme ADR 0076.
- Prepare histórico por partes com hash integral antes do manifesto e inventário v10; preserve versões de recursos removidos sem recriá-los e certifique artefatos antes da raiz, conforme ADR 0077.
- Prepare rascunho sob inventário v11 e preserve o salvo; finalize com contagem real, provas por máscara e metadata draft portátil antes da capa, conforme ADR 0080.
- Prepare bytes da capa somente sob o job com inventário v12, SHA integral e nascimento nativo; não exponha imagem/URL antes da materialização e ativação autorizadas, conforme ADR 0081.
- Materialize capa privada somente após intenção v13; cancele por fence vazio permanente antes dos recursos, preserve geração decimal exata e nunca remova o marcador por cleanup/lifecycle, conforme ADR 0082.
- Preserve restoreOrigin nos escritores de persona; IA/backup exigem lote ativo com recibos nativos, SDK não altera a origem nem edita/vincula perfis pendentes, conforme ADR 0083.
- Mantenha lote/recibos ativos de personas após excluir o livro e implante gates/Rules/cliente antes de instalar cópias globais.
- Instale personas restauradas por unidades sob inventário v14, sem sobrescrever biblioteca; revogue o lote antes da limpeza e preserve o marcador cancelled permanente, conforme ADR 0084.
- Preserve texto lógico e pin próprio das fontes congeladas nos corpos de capítulo existentes; reconfira origem/revisão em cada parte e omita ponteiros físicos no backup, conforme ADR 0085.
- Gere o índice JSON das fontes com a própria geração e leia somente o intervalo autorizado; inclua a identidade nativa do corpo no token e recuse índice inválido sem fallback, conforme ADR 0086.
- Migre índices de fontes somente por partes/journals/recibos nativos e progresso v12; preserve no-op, artifactCount e cancelamento v14, conforme ADR 0087.
- Grave payloads de lore sob payloadInventoryVersion 1 com journals/cleanup e birth fixado; mantenha a raiz ausente até integrar consumidores e exclusão, conforme ADR 0089.
- Migre prefixos de lore com contador autenticado pelo recibo original; preserve o prefixo até a troca atômica e contadores monotônicos, conforme ADR 0090.
- Leia payloads de lore por unidades reautorizadas, com tokens, escopo nativo e sealBirth; não exponha stubs como fichas completas, conforme ADR 0091.
- Hidrate lore antes de mapear/ordenar; confira SHA/schema/origem final, conta exata e epoch, aguardando confirmação servidor nas assinaturas, conforme ADR 0092.
- Valide campos de lore por unidades sem reter texto livre no checkpoint; Rules não permitem mutação SDK de payloadStorage/stubs, inclusive deleting, conforme ADR 0093.
- Prepare campos sob job/lease com recibos nativos, SHA privado e partSealBirth; preserve fences e incorpore cleanup/exclusão antes de habilitar adoção, conforme ADR 0094.
- Restaure texto, cópia anterior, contagens e recibo na mesma transação; compare o token preciso da fonte observada e revalide replay.
- Bloqueie restauração com texto ou operação pendentes; aceite corpo, revisão e bases do autosave juntos e limpe versões/corpos ao excluir livros.
- Preserve o corpo da cena de aventura como Texto principal; adicionais têm identidade própria, audiência privada por padrão e escritores transacionais em `functions`.
- Conte principal e adicionais ativos uma vez no ledger da cena; não invente zero para agregado inválido nem adote revisão com outro hash do principal.
- Filtre prévias por audiência no servidor antes de ler corpos; entregue somente HTML e mídia projetados, sem lore privado, caminho Storage ou URL permanente da biblioteca.
- Mantenha usos tipados de ilustração por aventura/bloco atomicamente com vínculo, duplicação e exclusão; prévia continua restrita ao dono e não concede compartilhamento.
- Altere metadados de campanha em `functions` com revisão, vínculo organizacional e recibo atômicos; preserve pedido incerto por UID/campanha e não adote revisão remota sem descarte explícito.
- Prepare bases de campanha em gerações privadas; compare o token preciso da origem por etapa e crie a campanha somente com a ativação integral e atômica.
- Sirva base e lore derivado pelo servidor com autorização vigente, preservando procedência separada do universo organizacional; não resolva fichas por nome nem relações transitivas.
- Preserve pins próprios de mídia da base e sua geração Storage; reautorize antes/depois do I/O e mantenha controles locais incertos descobríveis mesmo após ativação ou limpeza.
- Mantenha notas autorais de campanha separadas da base/variantes e acessíveis sem a origem; não copie conteúdo derivado automaticamente para notas.
- Vincule notas, controles e recibos à encarnação precisa da campanha; compare revisões e conserve tombstones sem corpo para impedir recriação por replay.
- Reserve e limpe pedidos de notas sob Web Locks por UID/campanha, sem lock durante HTTP; o journal integral de texto próprio não autoriza cache de variantes derivadas.
- Vincule variantes inteiras à encarnação da campanha e à base; preserve revisão contínua e bodyRevision ao retirar/restaurar, conforme ADR 0033.
- Recupere variantes somente após reautorizar ficha e alvos congelados; persista ciphertext em IndexedDB sem chave e invalide respostas após mudança de projeção.
- Prepare e compare candidatas sem trocar a base ativa; adote base, procedência, geração de lore e revisões no mesmo commit, conforme ADR 0035.
- Resolva lore pela geração ativa; permita fallback legado somente quando o ponteiro estiver ausente, nunca quando estiver inválido.
- Preserve anchors e bindings físicos achatados das variantes legadas; não colete bases, pins ou corpos emprestados ao cancelar adoção.
- Confira a barreira de adoção em toda mutação C2 e atualize o relógio privado de autorização atomicamente em todo escritor de universo/lore global.
- Implante todos os escritores do relógio e drene versões antigas antes de habilitar adoção; manutenção Admin segue o mesmo protocolo e exclusão de campanha preserva o relógio do UID.
- Conserve a base/AAD de rascunhos cifrados; resolva pedidos antigos por metadados/recibos sem migrar chave, texto ou descriptor ao navegador.
- Congele o controle integral mostrado em confirmações; releia-o antes do RPC e compare sob Web Locks ao limpar, preservando pedidos novos de outra aba.
- Use o resolver histórico B somente para confirmar o evento de ativação, sem reconhecer ou recriar a campanha atual.
- Projete diferenças antes de classificar e invalide a composição ao observar outro token, revisão ou datas; não use hashes privados como sinal de mudança.
- Preserve pedidos incertos de comparação sob Web Locks e CAS integral; controles conhecidos não autorizam RPC automático, e encerramento inicial exige intenção explícita.
- Aguarde oncomplete antes do envio e da confirmação local antes de fechar a chave; encerre pedidos desconhecidos por cancelamento explícito com fence, salvo exclusão permanente comprovada conforme ADR 0036.
- Confira a reserva global permanente antes de criar, ler ou repetir mutações de campanha; roteie controles antigos por máscara de dono/campanha antes do registro completo e não reutilize o ID reservado.
- Exclua campanhas pelo protocolo limitado da ADR 0036; remova um pin tipado por transação, preserve biblioteca/outras mesas e certifique os filhos antes da raiz.
- Atualize o inventário e a compatibilidade dos jobs de exclusão antes de habilitar qualquer novo recurso privado de campanha.
- Preserve os inventários C4 v1 (3/7), v2 (4/9) e v3 (6/11); inicie jobs v4 (8/16) com todos os recursos S3, rejeitando versões desconhecidas, conforme ADR 0040.
- Mantenha sessões autorais no servidor com CAS, ordem adjacente transacional e tombstones; confira a campanha própria e a reserva antes de corpos/recibos, sem depender da origem da aventura.
- Conserve pistas/missões próprias na campanha e vínculos sem prosa nas sessões; excluir sessão preserva itens/corpos e excluir item deixa vínculo neutro removível.
- Congele o CAS do editor S3 e confira revisão exata antes do corpo; mantenha recibos/resolver sem prosa e journal próprio integral sob Web Locks, separado do material derivado S2.
- Separe a confirmação histórica do pedido da adoção do corpo atual; não rebaseie preparação por resumo da lista, movimento ou foco, conforme ADR 0037.
- Preserve o painel autoral e sua pendência durante refresh da base; invalidação própria de exclusão continua ocultando apresentação antes do CAS do journal.
- Reautorize sessão ativa e projeção C2 em cada página de candidatos ou leitura de referência; persista somente IDs/tokens/revisões, sem nomes, prosa ou hashes privados.
- Invalide somente material derivado ao observar adoção ou projeção C2 alterada; mantenha o rascunho e a pendência S1.
- Separe plano da cena e blocos capturados; valide o manifesto completo antes de selecionar campos, leia o principal somente como bloco e não faça fallback de cenas após adoção.
- Reautorize todo o escopo da sessão/vínculo e pin/generation após download e derivação de mídia; limpe corpos/imagens em trocas e não invalide filtros quando a opção atual for selecionada.
- Confirme recibos históricos de vínculo sem exigir sessão ativa ou origem; persista intenção cancel sob CAS antes do resolver e preserve o journal até recibo, fence ou encerramento C4 próprio.
- Oculte apresentação após prova remota própria de revogação antes do CAS local; trate o pulso neutro somente como invalidação e preserve controles diferentes.
- Encerre rascunhos antigos somente por prova permanente própria de UID/campanha e confirmação do snapshot integral, sem decriptação; preserve controles inválidos e aguarde oncomplete da transação IndexedDB.
- Implante guardas, escritores e regras conjuntamente e drene versões antigas antes de habilitar exclusão; manutenção Admin deve respeitar a reserva permanente.

## Rotas

- Importe de `react-router`, nunca de `react-router-dom`.
- Acrescente rotas em `app/routes`, mantendo a curinga `'*'` por último.
- Não envolva o `<Outlet />` em `ErrorBoundary`: o `errorElement` já cobre.

## Commits

- Primeira linha no formato `tipo: descrição`, até 72 caracteres, sem ponto final.
- Não use `--no-verify` para contornar os hooks.
- Durante o desenvolvimento, mantenha commits locais; não faça push nem atualize PRs sem nova instrução do usuário.

## Testes

- Toda mudança de comportamento deve considerar testes.
- Teste o resultado observável.
- `npm run test` aplica limites de cobertura; não os reduza para fazer passar.
- Instale as dependências de `functions` com `npm ci --prefix functions` antes de validar.
- Use `WRITER_VISUAL_PORT` distinto por checkout nas execuções visuais paralelas.
- Mantenha protótipos demonstrativos em `e2e/visual`; não registre fixtures como evidência de autorização, pagamento ou piloto reais.
- Repita apenas os testes afetados pelo ajuste; amplie a validação quando houver risco de integração ou falha sem causa resolvida.
- Confira a existência dos caminhos explícitos de arquivos nos lotes de teste dirigidos antes de executá-los.
- Durante o desenvolvimento, ignore a CI remota: não acompanhe, dispare ou repita workflows; registre a validação local realizada.

## Documentação

- Toda decisão relevante atualiza a documentação ou uma ADR.
- Toda entrega implementada gera um registro em `docs/entregas`, com
  funcionalidades, testes e o resultado real das validações.
- Mudança que cria ou revoga uma regra atualiza este `AGENTS.md`.

## Conclusão

Uma tarefa só está concluída quando todos os itens da definição de
concluído estiverem satisfeitos. A lista fica em
`docs/development-process.md` e é a única fonte da verdade.

## Corpos de texto restaurados

- Preserve 8 MiB lógicos e o contrato content null/contentStorage da ADR 0067;
  não apresente corpo ausente ou inválido como manuscrito vazio.
- Grave corpo imutável, partes, capítulo, ledger, journals e recibo juntos;
  conte palavras pelo texto original e autorize o projeto antes do leitor interno.
- Mantenha cleanup v5 por filhos antes do pai e compatibilidade v1–v4;
  adapte leitores, escritores, histórico, pins/coleta e exclusão antes da ativação.

## Leitura de capítulos com corpo externo

- Use readLegacyChapterText para as partes do capítulo atual e reautorize cada
  página; não exponha bookTextBodies via SDK nem aceite abertura interna do cliente.
- Preserve o token de origem e a conta em toda a montagem; confira hash/UTF-8/BOM
  e confirmação final antes de entregar texto ao editor, conforme ADR 0068.
- Use texto lógico no histórico, backup, análise e contagem; leitura metadata-only
  não pode servir como texto salvo. Ativação exige integrar escritores e coleta.

## Escrita e referências de capítulos grandes

- Crie um bookChapterStorage por tentativa transacional e compartilhe entre
  escritor e versões; some deltas antes do commit, conforme ADR 0069.
- Confira CAS pelo texto lógico e preserve versões por referências; excluir
  capítulo não exclui versões e a revogação da versão libera seu pin uma única vez.
- Não reabra corpo com pins zero; mantenha unreferenced até coleta comprovada.
  Integre coleta, inventário de exclusão, conversão/chat antes da ativação.

## Coleta e exclusão de corpos de capítulo

- Colete somente unreferenced/pins zero com origem nativa fixada pelo evento,
  por máscaras e lotes limitados; confirme gcRevision com os deletes (ADR 0070).
- Preserve filhos antes do pai, gerações referenciadas e compatibilidade dos jobs
  de exclusão: inventário v2 inclui text-bodies e reconfere corpos no finish.
- Implante leitores/coletor/exclusão antes dos produtores; drene invocações antigas.
  Não habilite novos corpos com handler antigo de exclusão ainda em execução.

## Consumidores do texto lógico

- Aplique sugestões do chat legado pelo escritor compartilhado, com CAS lógico e
  corpo/pins/ledger/crédito/recibo atômicos; preserve os limites atuais (ADR 0071).
- Converta texto completo somente quando couber; congele fonte autossuficiente,
  limpe ponteiro físico e libere apenas o pin do capítulo, preservando versões.
- Libere pin também na revogação por agrupadores mistos; retomada usa metadados
  e não reabre corpo já liberado. Capítulo composto usa cenas como texto canônico;
  backup deve preservar seu campo legado congelado, inclusive externo.
