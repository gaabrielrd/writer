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
- Preserve hasLoreResources como barreira permanente do servidor: depois dela use writers nativos, inclusive em fichas inline irmãs; não implante Rules de bloqueio isoladamente (ADR 0125).
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
- Distinga origem v1 de livro e v2 com target de aventura; use namespaces/recibos próprios e preserve os gates de disponibilidade, conforme ADR 0200.
- Instale personas de aventura por unidade/journal com lote preparing; revogue o lote antes de limpar perfis e preserve a encarnação de biblioteca preexistente, conforme ADR 0201.
- Mantenha lote/recibos ativos de personas após excluir o livro e implante gates/Rules/cliente antes de instalar cópias globais.
- Instale personas restauradas por unidades sob inventário v14, sem sobrescrever biblioteca; revogue o lote antes da limpeza e preserve o marcador cancelled permanente, conforme ADR 0084.
- Preserve texto lógico e pin próprio das fontes congeladas nos corpos de capítulo existentes; reconfira origem/revisão em cada parte e omita ponteiros físicos no backup, conforme ADR 0085.
- Gere o índice JSON das fontes com a própria geração e leia somente o intervalo autorizado; inclua a identidade nativa do corpo no token e recuse índice inválido sem fallback, conforme ADR 0086.
- Migre índices de fontes somente por partes/journals/recibos nativos e progresso v12; preserve no-op, artifactCount e cancelamento v14, conforme ADR 0087.
- Grave payloads de lore sob payloadInventoryVersion 1 com journals/cleanup e birth fixado; mantenha a raiz ausente até integrar consumidores e exclusão, conforme ADR 0089.
- Migre prefixos de lore com contador autenticado pelo recibo original; preserve o prefixo até a troca atômica e contadores monotônicos, conforme ADR 0090.
- Leia payloads de lore por unidades reautorizadas, com tokens, escopo nativo e sealBirth; não exponha stubs como fichas completas, conforme ADR 0091.
- Use token v2 de lore somente por opção explícita; preserve origens v1/journals sem promoção e lista pelo clock global. Confira identidade nativa da ficha e reautorize cada unidade, conforme ADR 0136.
- Hidrate lore antes de mapear/ordenar; confira SHA/schema/origem final, conta exata e epoch, aguardando confirmação servidor nas assinaturas, conforme ADR 0092.
- Valide campos de lore por unidades sem reter texto livre no checkpoint; Rules não permitem mutação SDK de payloadStorage/stubs, inclusive deleting, conforme ADR 0093.
- Prepare campos sob job/lease com recibos nativos, SHA privado e partSealBirth; preserve fences e incorpore cleanup/exclusão antes de habilitar adoção, conforme ADR 0094.
- Leia gerações v2 por campos achatados, datas explícitas e relações com selo próprio; exija partSealBirth nos ponteiros novos e não habilite produtores antes de CAS/leases/privacidade/GC, conforme ADR 0095.
- Resolva metadata de origem no servidor por inspeção privada, com SHA/recibos e cancelamento; preserve ausências/datas e não use certificado histórico como grant ou disponibilidade física dos corpos, conforme ADR 0096.
- Registre alcance dos corpos de lore com provas nativas; reconfira toda a cabeça por lotes antes dos deletes, preserve leases/recriados e mantenha fences de coleta sem reativação, conforme ADR 0097.
- Reserve uploads de lore em geração preparing com slot/job/lease/recibo nativos; cancele a geração antes de coletar seus bytes e exija capacidade interna ligada à transação para limpar após revogação, preservando cabeça ativa e recriações, conforme ADR 0098.
- Congele reservas ao compor lore, vincule corpos à geração preparing e audite por partes com SHA/recibos nativos; certificado ready não ativa cabeça nem substitui autorização e cleanup deve preservar descritores alcançados, conforme ADR 0099.
- Materialize lore inline somente da origem reautorizada no servidor; mantenha filho/pai na mesma transação, marque job/lease privados e limpe filhos ainda não reservados antes dos slots, conforme ADR 0100.
- Adote cabeça/geração/leases lógicas/clock/privacidade/recibo atomicamente; exija consentimento explícito lógico e provas nativas para liberar leases aposentadas, preserve hasLoreResources como marca servidor e bloqueie exclusão legada, conforme ADR 0101.
- Limpe lore do livro já deleting pelo inventário v3 e cutoff nativo; coordene filhos/checkpoints na mesma transação, remova partes antes do header e preserve jobs/leases/controles como fences, conforme ADR 0102.
- Retire lore individual com inspeção/CAS, clock/privacidade e tombstone permanentes; adie o coletor genérico e entregue a limpeza ao inventário do livro ao entrar em deleting, preservando recibos nativos, conforme ADR 0103.
- Retire unidades conjuntas por plano/commit na mesma transação, com clock/privacidade únicos e prova nativa de nascimento compartilhado; não promova recibos singulares a lote e fixe o jobToken observado, conforme ADR 0135.
- Preserve seleção inteira de retirada em manifesto metadata antes de RPC; confirme outcome/cursor por CAS, não reenvie start incerto sem retry explícito e feche todos os IDs no cancel. Revalide provas frias e preserve intenção frente a ACK tardio, conforme ADR 0137.
- Preserve seleção de visibilidade em manifesto próprio antes de RPC; fixe refs/tokens pelo gate, consulte apply incerto e só reenvie explicitamente. Vincule cada ACK ao membro/geração originais e confirme controles fechados sem chave no cancel, conforme ADR 0141.
- Grave referências pelo gate metadata após o write-ahead e antes da RPC; revalide actor/ticket/cancel depois do await e use flushLocal sem produção para salvar dívida, sem inferir aceite, conforme ADR 0140.
- Confirme aceite manual histórico somente por bookLoreEditOutcome e provas nativas do escopo original; fixe jobToken/outcomeToken, não infira sucesso por checkpoint/valor atual e não use ausência para reenviar apply, conforme ADR 0139.
- Confira nomes da seleção por C1/v2 sem trocar o token original; mantenha nomes só em RAM, revisão e confirmação distintas. Notifique somente IDs retirados conferidos e use handle fresco no cancel, conforme ADR 0138.
- Encaminhe retirada manual somente por bookLoreRemoval e namespaces lore-removal-source/lore-removal; preserve os 18/22 métodos antigos e não envie start destrutivo ao abrir a interface, conforme ADR 0132.
- Grave wire da retirada em journal metadata antes da RPC; start incerto só consulta por advance e reenvia por apply explícito. Cancel fecha inspeção e confere retirada original, sem restaurar cabeça; preserve CAS/oncomplete e bloqueie ACK tardio, conforme ADR 0133.
- Exija origem C1/revisão/confirmação na UI de retirada; verificar ou salvar dívida não autoriza reenvio. Invalide o driver antigo ao cancelar e notifique retirada só por prova própria confirmada, conforme ADR 0134.
- Reserve criação de lore por ID servidor e prova nativa, mantendo cabeça ausente; preserve fences e amplie inventário/cancelamento antes do primeiro byte, conforme ADR 0104.
- Vincule uploads de criação à reserva nativa antes dos bytes; intenção de cancel bloqueia novas unidades, e filho/journal/recibo compartilham transação, preservando bindings e leases, conforme ADR 0105.
- Componha criação por origem explícita sem cabeça/inspeção fictícia; vincule tentativas nativamente e limpe reserved antes de auditar controles, conforme ADR 0106.
- Ative criação somente com cabeça/geração/leases lógicas/clock/datas/recibo e prova histórica do criador no mesmo commit; cabeça reservada exige nascimento original, e sucesso não pode ser cancelado nem recriado por replay, conforme ADR 0107.
- Encaminhe toda exclusão de livro ao protocolo servidor, inclusive sem flags; SDK não finaliza raiz nem grava deletedBooks, e falhas não executam fallback de cleanup, conforme ADR 0108.
- Monte contexto da análise por lore lógico com budgets agregados e origem nativa; reautorize após resposta e antes de reutilizar corpo, preserve recibo metadata e recuse writer inline sobre payload até adoção preparada, conforme ADR 0109.
- Adote lotes preparados de até 50 fichas na transação do caller, com clock/privacidade agregados e prova conjunta de nascimento; aguarde leituras irmãs antes de rejeitar, preserve replay metadata sem inferir atomicidade de sucessos individuais, conforme ADR 0110.
- Reserve todo o manifesto/IDs da análise com origem/provedor e provas nativas antes de habilitar filhos; get/retry são metadata, cancel sem filhos exige ausência conferida e exclusão fecha a reserva pelo cutoff, sem presumir cleanup de filhos desconhecidos, conforme ADR 0111.
- Produza filhos reservados da análise somente com capacidade nativa da unidade e vínculo de nascimento a proprietário/prova/evento/pai; cancelar fecha antes de limpar, leitura de dependência não concede escrita e adoção individual permanece bloqueada, conforme ADR 0112.
- Confirme o lote ready da análise com adoção integral, globais, crédito e recibo no mesmo commit; exija abertura opaca do batch e prova conjunta original no replay, preserve recibos legados e nunca use o ticket novo como fallback, conforme ADR 0113.
- Planeje edição de lore da captura C1 bruta com CAS e campos tocados explícitos; preserve literais/presenças, envie só campos/páginas alterados em partes de 64 KiB e trate o plano/manifesto cliente somente como intenção, conforme ADR 0114.
- Coordene edição de lore por unidade com pedido/CAS/bytes imutáveis, apply explícito e cleanup independente de RPC pendente; limite status/controles e não trate metadata em memória como recuperação durável, conforme ADR 0115.
- Encaminhe escrita manual preparada pela callable bookLoreEdit com UID autenticado e operações/IDs/filhos fechados; não exponha jobs da análise, namespaces internos ou fallback SDK, conforme ADRs 0116 e 0126.
- Vincule recuperação da criação à reserva/livro originais antes da cabeça e ao nascimento da adoção depois dela; cancel conserva só chave existente, sem liberar upload, conforme ADR 0126.
- Preserve os 18 métodos do journal de edição até suporte explícito à criação; a lista de 22 métodos do transporte manual não amplia o formato persistido, conforme ADR 0126.
- Coordene criação de lore pela reserva nativa e apply explícito; congele input/bytes e confira checkpoint privado/grant fresco sem anunciar estado em memória como recuperação durável, conforme ADR 0127.
- Preserve a preparação de criação de lore em stores aditivos v3, com ticket antes de RPC, cópia imutável cifrada e cancel/release/purge próprios; não habilite advance/apply sem checkpoint write-ahead integrado, conforme ADR 0128.
- Grave checkpoint da criação em gerações cifradas com controles até 50 e ponte metadata sem wires; confirme active/ACK/antecessora atomicamente, valide a sucessora antes da coleta e preserve inventário próprio no descarte, conforme ADR 0129.
- Dirija criação durável somente por write-ahead e dívida local; vincule apply ao checkpoint privado e confirme pai/edição/hash/token/geração nativos antes de liberar a recuperação aplicada, sem coletar a cabeça ou repetir apply por advance, conforme ADR 0130.
- Confira ticket/conta/livro antes de retomar criação de lore; mostre draft só por leitura autorizada, preserve cancel independente e confirmação explícita de criar/descartar com retorno de foco, conforme ADR 0131.
- Não finalize descarte/liberação de chave por phase conflict: confirme jobs próprios fechados e preserve a cabeça adotada por outra tentativa, conforme ADR 0127.
- Libere chave de recuperação de lore só por HTTP autenticado, com prova/nascimento/fingerprint originais e origem reautorizada; preserve fences, não regenere chave ausente e não confunda revogação da chave com cancelamento dos jobs, conforme ADR 0117.
- Preserve journal de edição de lore em partes cifradas com manifesto privado, chave não persistida, reautorização fresca antes/depois da leitura e CAS/oncomplete local; mantenha cleanup metadata sem chave e não envie ou descarte pedidos ao abrir, conforme ADR 0118.
- Restaure o coordenador de lore somente de checkpoint privado e controles paginados coerentes com o input/CAS original; confira pedidos/bytes/cursores, preserve reconciliação e nunca persista checkpoint com wire em claro ou envie ao reconstruir, conforme ADR 0119.
- Grave checkpoints de lore em gerações cifradas independentes; troque active e acks no mesmo oncomplete, preserve staging divergente e colete apenas cópias substituídas em lotes até 50; reautorize a leitura e aplique cancel monotônico ao reconstruir, conforme ADR 0120.
- Prepare o mapa completo de controles de lore antes de produzir, com referências fechadas de pai/filhos; cleanup sem chave persiste pedido/progresso metadata por passo, reconhece adoção própria e preserva draft/produtor incerto/recibos sem conceder leitura de conteúdo, conforme ADR 0121.
- Componha edição durável de lore com checkpoint antes de RPC e ponte metadata sem prosa para resultado validado; confirme active/ACK/receipt/remoção juntos, bloqueie produtores com dívida local e verifique ciphertext antes de idempotência/coleta da antecessora; cancel não espera chave/produtor, conforme ADR 0122.
- Grave ticket metadata antes de reservar recuperação de lore; preserve identidade/hash/ACK e cópias nas migrações. No cancelamento, conserve chave/draft; só liberação explícita fecha jobs e depois revoga a chave, com pedido exato durável e sem esperar reserve/produtor/crypto; nunca invente texto não confirmado, conforme ADR 0123.
- Edite lore por captura bruta/campos tocados; vincule a UI ao actor SDK, preservando drafts em atualizações de perfil. Descarte local exige confirmação, jobs/chave fechados e batches com fence/head/contador/tombstone atômicos; confira ausência real antes de anunciar conclusão e impeça recriação, conforme ADR 0124.
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

- Use o runner Functions com dois arquivos simultâneos; preserve casos, volumes
  e asserções. Limitar concorrência não autoriza reduzir cobertura.
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

## Revisão da visibilidade de seleções

- Fixe bool e origens da tentativa; ao retomar use o manifesto, não props novas.
  Nomes/consentimento vêm de C1/v2 autorizado e ficam só em RAM (ADR 0142).
- Verifique antes de revisar retry e reenvie apenas o membro original explícito.
  Oculte filhos de visibilidade da lista manual isolada, preservando cópias e
  paginação; retomada do grupo deve dirigir apply/cancel e dívida.
- Callback separa applied/unchanged e exige provas completas, sem dívida,
  uma vez por seleção/host. Releia valores atuais antes de atualizar o compêndio:
  efeito histórico não congela privacidade, publica ou certifica coleta.

## Composição do compêndio de livros

- Escopos book de LoreCollection usam C1/v2 e hosts nativos; universos e aventuras
  mantêm seus próprios contratos (ADR 0143). Nunca faça fallback para writer inline.
- Use captureList para tokens/fontes originais e apresente defaults somente na UI,
  sem fabricar datas ou converter projeção de apresentação em fonte de escrita.
  Reautorize a ficha pelo token ao abri-la; conta/livro e epoch limitam resultados.
- Mantenha cinco retomadas acessíveis mesmo quando a lista de fichas falhar.
  Releia valores atuais após provas e preserve falhas selecionadas.
- Na lateral do editor e menções, use BookLoreAuthoring pela interface pública;
  callbacks do formulário legado atendem somente o universo (ADR 0144).
  Fixe nome/alvo originais e não substitua rascunho por novas props.
- Compartilhe leitura C1/v2 para modal e detalhes inline; não use DTO visual
  como fonte de escrita. Mantenha o host aberto na transição leitura/edição.
- Não registre bloqueio de navegação inativo. Aguarde operação do capítulo antes
  de iniciar autoria, sem desmontar rascunho já aberto.
- A revisão assistida anterior à criação edita a proposta em RAM; preserve esse
  contrato. Não enfraqueça hasLoreResources nem habilite rollout antes do
  inventário/drain de todos os produtores e consumidores.

## Chaves de recuperação na exclusão do livro

- Inventarie novas chaves de lore atomicamente com reserva/prova/chave;
  exija o índice imutável original para liberar ou revogar (ADR 0145).
  Controles legados sem declaração não recebem índice fictício.
- Na exclusão, revalide abertura nativa, livro/cutoff/provas; visite um controle
  por unidade e leia da chave somente schema/timestamps, nunca material AES.
  Terminal, deletes e checkpoints devem compartilhar o commit.
- Verifique o estado v1 antes de migrar para v2, mesmo se o controlador de lore
  já estiver completo com a raiz presente. Preserve fases/contadores e aliases.
- Exija inventário de chaves vazio antes de finalizar o livro; resíduo
  desconhecido/recriado bloqueia, sem varrer controles, recibos ou outros livros.
- A exclusão integral já autorizada por deleting pode revogar a chave antes da
  limpeza dos produtores; termine a limpeza pelo controlador do livro e conserve
  recibos. O descarte de uma preparação no cliente mantém sua ordem própria.

## Auditoria das chaves históricas

- Audite por UID e páginas de metadata; não busque AES/prosa nem use o relatório
  como grant. Aplicação exige revisão do mesmo projeto/UID (ADR 0146).
- Reconfira ausência do livro, marcador de exclusão e provas nativas na mesma
  transação; alteração/recriação invalida a revisão. Livro presente é preservado.
- Em caso de prova ausente, resíduo ou erro de infraestrutura, preserve os dados;
  não certifique inventário global vazio nem execute limpeza por heurística.
- Mantenha a CLI em modo de leitura por padrão, com projeto/UID explícitos,
  arquivo limitado e resultados parciais sanitizados; execução real é operação
  própria e não decorre dos testes locais.

## Projeções de lore para contextos

- Use leitura nativa autorizada na mesma transação; observadores dos parsers
  não certificam bytes nem persistem prosa no checkpoint (ADR 0147).
- Retenha somente campos/prefixos pedidos em RAM, preservando ausências/contagens.
  Não baixe relações/campos v2 não selecionados nem monte base v1 inteira.
- Certifique todo corpo utilizado, mesmo após truncar a apresentação. Budget
  explícito de I/O/retenção pertence ao consumidor, sem teto de autoria/backup.
- Autorização histórica conserva nascimento: integração do chat revalida origem
  sem transformar revisão atual em identidade da conversa.

- No chat de livros, compartilhe o budget de lore entre página e snapshots por
  avanço (ADR 0148). Não trunque aliases do matcher para contornar complexidade.
- Revalide histórico por metadata, tombstone e prova original de criação, sem
  baixar corpos de lore. DTO privado e defaults de contexto não são fonte de escrita.

## Lore nas referências de cenas e planejamento

- Confira origem C1 na transação antes de vincular lore local; disponibilidade
  e índices inversos não devem depender de baixar prosa (ADR 0149).
- Resolva nome/categoria lógicos em listas, com budget por página e sem truncar
  label, gravá-lo no link ou buscar outros campos/relações v2.
- Ausência/revogação conhecida omite nomes; corrupção/infraestrutura é erro,
  sem fallback. Preserve remoção explícita de vínculo já indisponível.
- Cursores locais observam localLoreVersion e nascimento do livro; consultas
  inversas observam também token nativo exato da ficha, sem reduzir a millis.

## Publicação com lore nativo

- Capture fontes C1 originais e coleção completa, sem usar DTO visual/defaults;
  revalide metadata antes/depois de staging e fixe Auth/UID originais (ADR 0150).
- Livros nativos copiam lore local e ativam ponteiro/status somente no servidor.
  Reconfira consentimento lógico, prova nativa do livro/universo/marcador público,
  clocks/status/privacidade/cenas e header staged na transação.
- Preserve projeção pública fechada e limites existentes, sombra privada local,
  autor explícito, staging invisível, retirada e replay sem nova aplicação.
- Hashes de metadata não são grants; readToken de fichas e campos privados não
  vão para documentos públicos. Não permita fallback SDK após erro nativo.
- Prepare a projeção pública pela inspeção com publicationHash e candidato exato,
  em unidades de 64 KiB; preserve CAS/recibos/fence/cleanup e Auth originais.
- Copie somente os quatro campos certificados após reautorizar origem/consentimento;
  certificado apenas de metadata não autoriza copiar texto ou ler corpos.
- Preserve o checkpoint sem candidato/prosa e não substitua o preparo incremental
  por uma transação sem limite.

## Índice portátil do lore

- Use BookPortableLoreIndex somente para domínio/ranges do objeto data lógico;
  vincule bytes/hash/framing/origem no protocolo antes de produzir ou restaurar.
- Mantenha a coleção portátil de relações na entrada separada; não amplie o
  contrato das páginas nativas de 64 relações nem aceite estado v2 nas APIs antigas.
- Preserve o checkpoint sem prosa/lista integral e trate IDs/ranges como metadata,
  sem conceder leitura ou ativação por esse índice puro (ADR 0151).

- Componha lore portátil pela leitura C1 fixada no clock da coleção, sem DTO
  visual, reler corpos por página ou guardar a ficha inteira em RAM (ADR 0151).
- Aguarde o consumo da parte antes de ler a próxima; confira SHA/EOF/domínio/
  header antes da prova e mantenha bytes provisórios até o selo do arquivo.
- Revalidação metadata não certifica bytes/corpos atuais; não habilite arquivo
  ou restauração antes de integrar validação e materialização por spans.

- Use o prefixo com consumed e orçamento de até 64 referências na validação
  semântica do lore; não suponha que 64 KiB limitam o número de escritas.
- Preserve a validação do envelope/EOF e vincule índice/offsets ao mesmo arquivo
  e item antes de usar spans; o parser puro não certifica SHA nem autorização.

- Na validação servidor do lore, guarde só cursor/SHA e um frame pendente;
  confirme origem/índice/checkpoint/recibo atomicamente antes do ponteiro final.
- Preserve checkpoints antigos em andamento; não use a API integral pequena
  como substituta do leitor grande por spans nem emita ponteiros novos em rollout
  com validadores/leitores antigos ainda ativos.

- Capture lore do arquivo por C1/writePortable e revalide loreDigest por metadata
  v1 antes do selo; não guarde catálogo de provas nem serialize tokens no arquivo.
- Compartilhe port/guard de ator até a resposta após close; abort antes do commit
  preserva o arquivo anterior, mas não prometa desfazer close já confirmado.
- Recuse payloadStorage no leitor físico de recursos; erro C1 não autoriza fallback.

- Abra lore indexado da restauração somente pelo ponteiro original imutável C2;
  cursor/ranges/sourceToken não são grants nem prova de disponibilidade de corpos.
- Consuma ranges de até 64 KiB com observações próprias por unidade e reconfira
  verify(tx) antes da escrita; não acumule provas ou monte a ficha inteira (ADR 0151).
- Preserve ausência explícita dos campos e o limite do leitor integral pequeno;
  D1 não substitui remap/materialização/roundtrip grandes de D2/D3.

- Projete lore indexado por unidades com o remapeador original e índice nativo;
  ID local qualificado tem precedência e externo ausente não vira grant.
- Preserve bytes literais fora de targetEntityId e retenha ID partido até fechar;
  limite 64 KiB/64 alvos por entrada e trate saída de até 80 KiB como fragmento.
- Cursor/summary D2 não são prova acumulada ou parte nativa: persista pelo journal
  e empacote sob inventário D3 antes do manifesto; não acumule prosa/provas (ADR 0151).

- Prepare corpos de lore por estágios inventariados no journal/recibo original;
  controles/fragmentos/árvore privados nunca são ponteiros nativos de leitura.
- Mantenha o acumulador parcial de até 64 KiB no artefato privado com CAS,
  sem prosa no checkpoint; copie partes finais imutáveis e confira SHA/Merkle.
- Não regrave acumulador sem mudança: preserve o updateTime nativo e seu journal.
  Reconciliação/geração/roundtrip completos continuam obrigatórios (ADR 0151).

- Materialize lore indexado por campos/páginas com controles nativos e verify(tx)
  explícito antes do commit; página fecha após o objeto completo da 64ª relação.
- Preserve datas físicas obrigatórias e datas lógicas originais em portableDates
  somente em geração sem base; ausência e zero não recebem timestamp inventado.
- Não regrave controle de geração sem mudança. Retome jobs streamed mesmo com
  novas adesões desligadas; habilite-as somente após Counts/drain/roundtrip (ADR 0151).

- Reconcilie lore restaurado por intervalos da fonte projetada e até três partes
  nativas por transação, com journals/Merkle e SHA/tamanho finais por campo/página.
- Fixe identidade nativa da cabeça e origem no controle privado de reconciliação;
  não use o leitor lógico integral de testes no Counts de produção (ADR 0151).

- Drene temporários de lore pelo journal nativo antes de sair de Counts; varra
  depois a metadata física e recuse stageKind remanescente, inclusive desconhecido.
- Preserve artifactCount monotônico: retiredArtifacts debita drenagem bem-sucedida,
  cleanedArtifacts só cancelamento; exija saldo exato ao cancelar (ADR 0151).

- Leia lore preparado somente pelo port interno ligado ao job/reserva/marcador
  originais, Counts/drenagem done e raiz ausente; reautorize cada unidade e seu journal.
- Separe tokens preparados por escopo do job e mantenha C1 público com autorização
  normal de livro; não exponha o port interno como callable por composição dinâmica.
- No modo indexado novo, preserve datas/ausências também em fichas pequenas;
  opção padrão continua desligada até host/roundtrip/rollout coordenados (ADR 0151).

## Inventário final de restauração

- Congele a preparação em schema13 antes da auditoria; preserve completude de
  índices/Counts/drenagem/capa e lote de personas original preparando (ADR 0152).
- Varra journals e namespaces físicos com páginas limitadas, pais/âncora originais
  e totais exatos; não adote órfãos, stageKind ou dados recriados.
- Grave somente cursor/job/recibo; activation-ready não é grant nem prova atual
  de Storage. Reautorize revisão/origens na futura ativação atômica.
- Preserve cleanup14, saldo e replay histórico; evolução do layout exige contrato.

## Revisão antes da ativação de livros

- Exija selo/recibo e preparação final originais antes de oferecer revisão; token
  de revisão não concede acesso ou dispensa CAS/reautorização (ADR 0153).
- Verifique a geração Storage e reautorize job/dependências após a espera externa;
  mudanças invalidam a resposta. Não confunda isso com atomicidade distribuída.
- Prévia limitada do título não trunca o título original ou o manuscrito.

## Ativação de livros restaurados

- Ative raiz privada, countReady, lote de personas, universo e registro/uso de
  capa junto com job/recibo; revalide CAS/revisão/Storage/origens (ADR 0154).
- Preserve job/recibo/reserva originais após activated. Consulta histórica não
  abre a raiz nem concede conteúdo; cancel/cleanup anteriores não removem livro ativo.
- Rules preservam restoreOrigin; procedência não é autorização atual.
- Capa preparing/url null não é selecionável ou aceita. Finalização de mídia e
  limpeza pós-ativação exigem progresso próprio e reautorização; não use cancel.

## Finalização da capa restaurada

- Autorize job/imagem/definições originais antes e depois do PATCH Storage;
  preserve geração decimal exata, duas precondições e token de retomada (ADR 0155).
- Grave conclusão/recibo separados sem URL; não regrave a prova de ativação.
- Atualize URL da raiz só se nascimento/origem/capa/uso originais ainda coincidirem;
  exclusão, troca ou recriação não são desfeitas. Não repare usos estrangeiros.
- Separe conclusão histórica de disponibilidade atual; replay não concede URL.
  Limpeza posterior conserva provas e não usa cancelamento de um livro ativo.

## Limpeza após ativação de livros

- Use controle/recibos próprios após mídia concluída; preserve job/recibo/reserva
  de ativação, mídia e provas de personas originais (ADR 0156).
- Autentique journals antes de removê-los; para recursos ativos não consulte ou
  apague o alvo atual. Deletes somente nas famílias privadas originais do job.
- Percorra recibos originais sem apagá-los; exija nascimentos e totais exatos
  para chunks/provas/itens, limites fixos e namespaces conhecidos vazios.
- Retirada confirmada da capa só conclui unavailable pelo tombstone original
  deleted, sem usos/URL/I/O Storage. Ausência/recriação não substitui essa prova.

## Transporte de restauração

- Exponha restauração somente pela lista literal imutável e pelos exports
  Functions explícitos; mantenha ports de conteúdo/preparação e helpers internos
  fora da fronteira pública (ADR 0157).
- Preserve Auth/App Check e contratos fechados dos comandos; nome no payload
  não seleciona método. Chave conserva HTTP separado; não exponha-a por callable.
- Comandos públicos recebem private no-store e Vary Authorization no handler;
  mocks de verificação existem apenas nos testes, sem bypass em runtime.

## Preparação de livros no cliente

- Execute uma unidade com intenção completa salva por CAS antes de RPC;
  reenvie dívida antes de selecionar novo passo e limpe só por confirmação própria
  e CAS estrutural, preservando-a em erros (ADR 0158).
- Projete identidade/fase/checkpoint somente; valide schema e completude dos
  índices antes de escolher auditoria. Nunca ative automaticamente em activation-ready.
- Revalide conta/vida útil após waits; instância não executa unidades concorrentes.
  Port de journal não comprova persistência cifrada ou recuperação após recarga.

## Journal protegido da preparação de livros

- Use chave HTTP autorizada/contexto exato e AES-GCM não extraível; não persista
  chave, tokens, prosa ou arquivo no journal (ADR 0159).
- Vincule contexto/stamp por AAD, limite intenção/envelope e reautorize antes
  de abrir/substituir. Erros de parser não revelam resposta ou plaintext.
- Faça crypto/rede fora da transação IndexedDB; Web Locks coordena abas,
  CAS interno compara envelope inteiro, não só stamp ou operationId.
- Preserve ciphertext em falhas/revogação; origem terminal sem chave não autoriza
  reabertura ou descarte implícito. Não use fallback plaintext.

- Em pedidos de restauração, valide operationId/restoreId pelo contrato real
  de 16–80 caracteres ASCII alfanuméricos ou hífen antes de persistir; UID
  conserva seu contrato próprio. Não renomeie dívida inválida automaticamente.

## Inspeção e envio de backups de livros

- Produza revisão metadata sem título/prosa/nome do arquivo; valide header e
  bytes, fixe fonte/guard/signal e não trate revisão local como grant (ADR 0160).
- Antes de existir chave servidor, preserve somente metadata mínima do início
  em store separado; CAS e confirmação/fence originais encerram a tentativa.
  Job encontrado na resolução não é cancelamento de job.
- No upload, use partes limitadas, ID determinístico por job/índice e checkpoint
  original comprovado. Reenvie pedido pendente; após recarga confira arquivo/hash
  e prefixo nativo. Não persista chunkBase64.
- Conserve reviewHash original do job ao retomar; getters/listas projetam metadata
  autorizada. Início/envio/preparação nunca ativam automaticamente a raiz.

## Finalização durável no cliente de livros

- Preserve intenção operacional metadata em store separado antes de ativar,
  finalizar mídia/limpeza ou cancelar; sem prosa/chave/Auth/App Check (ADR 0161).
- Confirme revisão explícita capturada antes de awaits e reenvie pedido original;
  chave revogada não autoriza descartar dívida ou trocar token/checkpoint.
- Use recibo/resolver apropriado a cada ação; already-complete exige conclusão
  nativa. Desconhecido no mesmo checkpoint não encerra tentativa.
- CAS compara registro inteiro. Histórico não concede acesso ao livro nem
  recria raiz excluída; cleanup de cancelamento mantém limit 16 no fingerprint.

## Restauração no Estúdio

- Componha diálogo/painel pela interface pública de book-portability; mantenha
  importação de documentos separada e revisão/ativação explícitas (ADR 0162).
- Capture conta/vida útil, pause entre unidades e preserve pedidos ao fechar.
  Remonte listas por conta; falha de uma fonte não oculta as demais.
- Antes de navegar, consulte livro no servidor, confira autor/exclusão e revalide
  o guard após await. Recibo histórico não abre conteúdo.
- Descarte de ciphertext terminal é explícito: reautorize contexto original e
  compare envelope inteiro antes de removê-lo; não remova projeto nem decripte.

## Recaptura e ausência portátil de persona

- Omita somente narrativeControls/entity-scenes da listagem portátil; leia até
  limit+2 metadata nesse grupo para conservar páginas/cursor, sem filtrar
  inconsistências desconhecidas (ADR 0163).
- Preserve personaAvailability fechada e ID neutro junto ao dono/remap. Ausência
  não cria perfil nem autoriza biblioteca por coincidência; vínculo novo exige
  autorização normal. Overrides antigos conservam snapshot/valores e aviso.
- Sem marcador explícito, formato novo mantém recusas de perfis/traits ausentes.
  Cursor legado v1 conserva saída/hash; normalização v2 registra a metadata.
- JSON antigo projeta fontes sem a marca nova e sem mutar objeto original.
  Warnings opcionais atuais não invalidam checkpoints anteriores.

## Persona ausente no rascunho portátil

- Preserve personaAvailability explícita no snapshot do rascunho e no histórico.
  profile-not-recorded exige persona null e nunca consulta perfil por coincidência;
  legacy-overrides conserva perfil autorizado/token/hash e valores (ADR 0164).
- Sem marca, preserve a recusa M8 de perfil/traits ausentes. Marca malformada falha;
  outro vínculo omite marca antiga e segue a autorização normal.
- Conte avisos reais no draft e em work-version.draft, sem instalar perfil ausente
  ou recriar capítulo. Reautorize a origem antes do selo, inclusive sem perfil.

## Revisão alterada na ativação de livros

- activation-review-changed pode retirar o pedido original somente por transação
  retireBookRestoreActivation, com mesmo operationId/fingerprint. Recibo nativo
  e checkpoint impedem ativação antiga posterior; unknown sozinho não apaga journal.
- Confira selo/âncora antes de renovar seu ID; mantenha preparação congelada.
  Revisão exige checkpoint/preparação/nascimento exatos (ADR 0165).
- Históricos de audit/retirada aceitam outro selo só com self-ID, checkpoint
  anterior e audit idêntico exceto sealOperationId; preserve demais recusas.
- Host reapresenta revisão e exige novo clique. Rede/conta/CAS incertos preservam
  metadata; replay confirma efeito original sem conceder acesso ou recriar raiz.

## Backup completo pela interface do editor

- Formato .writer usa saveEditorBookBackup/sink por fluxo, livro inteiro e
  histórico, com contribuição explícita congelada antes do seletor (ADR 0166).
  JSON antigo continua separado e não deve prometer histórico completo.
- Seletor/gravação ficam em serviços, com conta/livro/sinal conferidos e close só
  após selo. Cancelar escolha é neutro; falha/abort não anunciam arquivo salvo.
- Não criar fallback Blob integral nem cópia plaintext oculta. Sem API compatível,
  explique disponibilidade e preserve outros formatos. Hosts remontam por contexto.

## Metadata de persona no editor

- Projete personaAvailability fechada e vinculada ao ID atual em get/list de
  livro/capítulo. Livro só admite ausência; capítulo preserva também overrides
  antigos. Marca velha é omitida e inválida falha, sem lookup (ADR 0167).
- Book/Chapter usam tipo puro compartilhado; inputs de escrita não ganham essa
  autorização. Preserve metadata até o rascunho portátil sem mudar texto/datas.

## Política de lore na preparação

- Start fixa loreMode no job e reserva nativa imutável; cliente não declara o
  modo. Load e prova histórica conferem presença/valor originais (ADR 0168).
- Configuração posterior não troca pedido novo. Para job antigo, preserve prefixo;
  entre fichas, só candidate metadata v2 com journal original certifica indexado.
  Reconferir decisão antes de writes, com consulta limitada a um candidato.
- Não fabricar flag retroativa, migrar hash/cursor ou adotar órfão como prova.
  Factory conserva false; runtime local seleciona true para novos jobs nos dois
  pontos de composição após inventário/ciclo ativo. Preserve essa configuração
  compartilhada e os gates operacionais antes de rollout (ADR 0169).

## Backup privado de aventuras

- Use adventureBackupSource somente como âncora raiz/progresso; exija máscaras
  e revalide recursos/bindings/perfis antes do selo completo (ADR 0170).
- Preserve leitura do próprio com universo indisponível; não copie lore global
  nem trate a âncora como grant ou backup integral.
- Liste partes por metadata/cursor limitado e confira origem nativa por unidade
  de até 64 KiB. Capture índice/IDs/tokens antes de awaits (ADR 0171).
- Preserve conteúdo legado literal; recuse corpo externo sem leitor e mantenha
  importId/URLs operacionais fora da procedência portátil.
- Capture cenas/blocos físicos, incluindo arquivo/sem parte, e rankSlot/ranks
  declarados. Ausência opcional é explícita; corpo obrigatório ausente falha
  (ADR 0172). Preserve formerParentId sem recriar parte retirada.
- Confira hash do texto contra corpo/head e identidades nativas do item, pai e
  cena dona. Não exija revisão numérica igual ou contador derivado para salvar
  prosa própria. Referências/imagens/personas são vínculos neutros até suas
  provas específicas; nunca copie labels globais como fallback.
- Na narrativa portátil, derive somente os controles de ordem conhecidos pelo
  sequenceKey; não exporte entity-scenes. Marco exige arco/arcId coerentes;
  link exige source próprio e seus ancestrais, sem resolver o alvo (ADR 0173).
- Lore portátil próprio deve conferir metadata/corpo pelo nascimento da raiz,
  conta e revisão, sem consultar universo. Tombstone exige corpo ausente e não
  vira ficha ativa; recuse corpo órfão ou de raiz recriada (ADR 0174).
- Na preparação portátil, preserve escolhas/meta e tarefas atuais; não exporte
  jobs/contadores como autoria nem preferências/atividade da conta. Ausência do
  controle não cria defaults; futuros totais vêm das tarefas reais (ADR 0175).
- Histórico portátil da aventura exige target/resource e nascimento nativo
  coerentes; chunk depende de parentToken/ordinal/ID derivado (ADR 0176).
  Não adote versões anteriores ao nascimento da raiz nem exija fonte corrente.
- Hash da unidade JSON não certifica texto histórico completo: confira ordinais,
  quantidade, bytes e SHA do manifesto antes de selar pacote. Restore futuro
  cria raiz privada pendente antes dos filhos ou planeja prova equivalente.
- Personas portáteis da aventura seguem vínculos root/cena e herança dos blocos;
  confira perfil/lote ativo antes da prosa. Preserve IDs legados válidos sem
  prefixo custom- e arquivo, sem habilitar geração ou fabricar fallback (ADR 0177).
- Compartilhe somente a projeção pura portablePersonaProfile entre domínios;
  preserve alias/bytes do serializer de livro e exclua origem operacional,
  credenciais/provedor e extras de perfil/trait do DTO.
- Imagens portáteis da aventura exigem vínculo/cena dona/biblioteca/uso tipado
  autorizados, caminho canônico e geração fixada. Revalide metadata/binding
  após I/O antes dos bytes; não emita URLs/tokens de download (ADR 0178).
- Preserve adventureImageUseKey do produtor; uso tipado anterior à raiz não
  autoriza cópia recriada. Head pode anteceder raiz em importação ativada,
  mantendo owner/schema/identidade/backlink; bytes exigem uso atual posterior
  (ADR 0180). Biblioteca pode ser anterior. PNG/ranges não substituem selo global.
- Origem do universo portátil é referência neutra com nascimento nativo, nunca
  duplicação/grant. Revalide fonte/acesso; origem indisponível não autoriza
  coincidência nem bloqueia leitura própria (ADR 0179). Compartilhe só validador
  puro portableUniverseOrigin, mantendo alias/payload de livro.
- Framing de aventura usa WRITER-ADVN/erro próprio; preserve bytes/APIs de livro
  ao compartilhar portableBackupContainer. Envelope de oito seções é somente
  envelope-only: ainda exige validação autoral/acesso antes de uso (ADR 0181).
- Cursor/index de arquivo privado pertencem ao host confiável; não aceite
  checkpoints do arquivo/usuário nem os transfira entre domínios.
- No cliente, compartilhe somente adventureBackupResourceDefinitions puro;
  percorra todas as views/filhos com páginas, IDs UTF-8 e presença explícita.
  Inventory-only é metadata; reconfira digest/fonte/totais em nova passagem,
  mantendo provas independentes de corpos/histórico/Storage (ADR 0182).
- Ao acrescentar view/produtor autoral, atualize registro, percurso, fixtures
  e manifestos; não omita namespace novo de um backup declarado completo.
- Corpos de aventura no cliente passam por readAdventureBackupUnit: fixe intenção
  antes de next/await, valide DTO/base64/manifesto e SHA incremental (ADR 0183).
  Unit-bytes-only não certifica pacote, histórico textual ou Storage. Return
  deve fechar sem aguardar RPC e impedir emissão/prova após resposta tardia.
- Compartilhe a ponte de registros por shared/streams, mantendo-o neutro;
  ack ocorre após consumo e fechamento não aguarda RPC (ADR 0184).
- streamAdventureCoreData produz somente cinco seções/core-data-only. Preserve
  endereços/manifestos e unidades iguais ao inventário; só verificar/selo global
  depois de histórico/drafts/imagens e suas provas, nunca por esse recorte.

No backup privado de aventuras, preserve o cabeçalho histórico nativo e separe
sua contagem de chunks da contagem portátil fixed64k em adventure-version-body.
Leia texto por ordinal/chunkRef canônico; confira UTF-8/bytes/SHA completos antes
de provar a seção. history-data-only não autoriza selo ou restauração do arquivo.

Na captura portátil de imagens da aventura, cada recurso conserva seu vínculo
autorizado. Não deduplique por imageId. Reconfira todos os vínculos/gerações em
segunda passagem antes do selo global; mantenha digest operacional fora do arquivo.

No backup de aventura, draft é contribuição explícita de um editor de cena/bloco,
separada do texto salvo e vinculada às provas autorizadas de head/body. Não
exporte journals/pedidos ou enumere storage. Restore preserva draft em versão
separada; baseRevision local antiga não concede acesso nem substitui o salvo.

A composição de arquivo de aventura só emite package-end após verificar inventário
completo, imagens/gerações e draft. Confira conta/abort em cada bloco binário,
inclusive antes do selo final. captured-data-only não autoriza importar/ativar
projeto; arquivos externos ainda exigem validação semântica independente.

O lint integral usa scripts/run-lint.mjs: subprocessos sequenciais por diretório
e passagem final da raiz. Preserve cobertura de todos os arquivos/configurações;
não substitua por filtro de diff nem ignore diretórios sem verificá-los.

Na validação de arquivo de aventura, content-only exige DTOs fechados, hashes,
manifestos e relações independentes; não concede acesso nem ativa projeto.
Use checkpoints somente do host confiável, UTF-8 incremental para fixed64k e
índice OPFS cifrado por shared/validation. Preserve namespace/API dos livros;
limpeza falha impede aprovação e preserva os erros primário e de limpeza (ADR 0189).

Na validação retomável de aventura, releitura JSON deve corresponder ao SHA dos
frames e raw exige ponteiro/layout/manifesto coerentes. Host fornece fonte
imutável/verificada e buffer transacional; confirme índice, itens e checkpoint
juntos ou descarte o lote. stepped-content-only não é grant ou job autenticado;
exija provas dos bytes e contexto remoto antes do uso autoral (ADR 0190).

Na restauração de aventuras, preserve raiz mínima sem ownerId até a ativação,
com nascimento comum a job/reserva/start-op. Cancelamento mantém marcador mínimo
aposentado e reserva permanentes; não libere o ID por TTL. Estado atual exige
recibo do checkpoint exato, hash do job e updateTime/birth; recibo histórico não
prova progresso atual. Artefatos exigem contexto/birth/hash e operação imutável.
Trate estados SHA como conteúdo privado, pois podem conter cauda limitada dos
bytes; nunca os exponha em metadata/recibos de UI. Atualize schemas/registry de
cleanup ao criar fase/namespace. Transporte segue interno até recuperação,
validação semântica persistente e ativação privada (ADR 0191).

Na validação persistente remota de aventuras, fixe contexto/checkpoint e reconfira
as provas observadas antes de confirmar índice, itens, snapshot e recibo juntos.
validationState/current preserva nascimento e autentica criador/atualizador por
operações imutáveis; não aceite estado do cliente nem exponha buffers em views.
Reconfira toda a fonte em lotes antes de content-verified. Esse resultado não
ativa o projeto nem autoriza origens; consumidores futuros revalidam suas provas.
Cleanup inclui os três namespaces de validação mesmo para jobs anteriores,
recusando órfãos e falta de contagem; estado mutável exige protocolo próprio.
Transporte/validação continuam internos até recuperação e ativação (ADR 0192).

No consumo de aventuras restauradas, reconstrua reportHash/summary do snapshot
autenticado e confira cada item antes da leitura. Aguarde verify(tx) na transação
consumidora antes de escrever. sourceToken/projeção de IDs não são credenciais.
Prefixos raw são privados e só podem ser reutilizados após autenticação pelo
estado/recibo do host; não aceite checkpoint de cliente. Remapeie imagens por
asset/uso e preserve referências externas para autorização. Hashes sourceBindings
e sourceOnly continuam prova da entrada; reconstrua provas nativas no stager.
Não reviva recurso somente histórico nem aplique draft sobre o salvo (ADR 0193).

Na montagem privada de aventuras, mantenha a raiz reservada sem ownerId e a
definição em preparedRoot/current até ativação auditada. Una head/corpo por lookup
autenticado e aguarde suas provas na transação. Targets/journals/checkpoint/recibo
nascem juntos; não adote alvo ou filho existente. Respeite orçamento nativo sem
truncar e mantenha countReady false até reconstruir agregados. Cleanup confere
targets por operações/hash/metadata, inclusive namespaces de heads derivados da
fonte antes de descartar o índice. Novos filhos/famílias exigem ampliar prova e
limpeza antes de gravar; atualizações futuras preservam o criador e provam a
versão anterior. structure-ready não autoriza ativação (ADR 0194).

Na preparação de imagens restauradas de aventuras, preserve um ativo por recurso,
bytes em arrays numéricos canônicos e prefixo raw privado comprovado. Revalide
fonte/head/binding antes do commit de cada frame; image-bytes-ready não autoriza
biblioteca, URL, Storage ou ativação. Decodifique PNG integralmente e reserve/fence
o I/O na etapa de materialização (ADR 0202).

Na exclusão de imagens restauradas, preserve marcador Storage retired vazio,
privado e permanente. Use somente contexto/provas da biblioteca, CAS decimal
exato e remoção da geração original comprovada. Não faça fallback para delete
bruto. Confirme uses vazia antes de deleting e nascimento/conteúdo da biblioteca
antes de deleted; falha externa/Firestore deve permitir retomada (ADR 0203).

Na materialização de PNGs das aventuras restauradas, reserve intenção nativa
antes do I/O e revalide fonte/frames/head/binding antes/depois do upload. Use o
adaptador compartilhado, bytes exatos até 16 MiB e decodificação Sharp completa.
Cleanup revoga personas e confirma fences de todas as intenções antes de apagar
fonte/frames; preserve marcadores e criador dos journals. Não ative ou publique
mídia por image-storage-ready (ADR 0204).

Leitores de origem da biblioteca não devem importar contratos operacionais de
restauração que inicializam seeds: imageLibrary também é alcançada por lore/
cenas. Mantenha validação primitiva independente da orquestração (ADR 0204).

Na reconciliação de aventuras restauradas, prove fonte/alvos/journals antes de
recompor blocos, cenas e links por unidades. Reutilize o ledger de palavras por
proxy com writes journalados; preserve arquivo/órfãos sem inventar agrupadores.
Referências contam o source direto; counts-ready mantém raiz privada e
countReady false até auditoria/ativação. Cleanup preserva revogação/fences antes
dos alvos e inclui o ledger registrado (ADR 0205).

Na auditoria privada de aventuras restauradas, congele writers, confira journals
e inventário físico por páginas e revalide o anchor nativo em cada avanço.
Não leia corpos/frames completos nessa varredura. Verifique a geração de mídia
fora da transação e reconfira intenção/contexto no ACK. audit-ready não ativa:
novas instalações/layout/inventário exigem invalidar e refazer o selo; preserve
raiz privada e cleanup com revogação/fences antes dos alvos (ADR 0206).

Prepare imagens restauradas de aventura por pares imagem/uso journalados,
preparing/URL null/useCount 1. Use origem v2 tipada com instalação própria,
preservando retirada permanente e livros v1. Invalide o selo original antes de
instalar e refaça a auditoria incluindo imagens/usos. Recibos da auditoria inicial
permanecem históricos pela fronteira nativa capturada; a rodada atual e demais
contadores continuam monotônicos. Cleanup fecha Storage e remove usos antes
das imagens, preservando registros alheios/recriados (ADR 0207).

Na ativação de aventuras restauradas, exija revisão e selo posterior à instalação
da biblioteca; reautorize o universo e confirme raiz/countReady/personas/job/recibo
na mesma transação. Preserve o nascimento da raiz reservada e congele o job ativo.
Resolva recibos históricos sem consultar ou autorizar a raiz atual; recuse cleanup
pré-ativação de projeto ativo. Encerre pedido incerto pelo mesmo ID/fingerprint
de ativação. Mantenha mídia pendente e use sidecars para progresso posterior
(ADR 0208).

Finalize mídia de aventuras restauradas por ativo em sidecars, sem mutar o job
ativado nem religar heads. Prove nascimento/origem/Storage e usos atuais;
preserve detach/edições. Revalide o ACK após accept/retire; confirme retirada
física antes de unavailable. Trate contagens e replay como históricos, sem
grants atuais, e exija a consulta final vazia (ADR 0209).

Colete fonte/preparação de aventuras só após mídia concluída, em sidecar próprio
e páginas provadas. Apague alvos de journals somente no scope job; preserve
recursos atuais, biblioteca/personas e recibos. Use metadata nativa para descartar
payload, nunca para autorizar consumo. Exija contagens/vazio e bloqueie chave
pendente ou registros inesperados; não reutilize cleanup pré-ativação (ADR 0210).

Exija getAll com máscaras antes de qualquer leitura da coleta; recuse o port
incompatível. Confira presença da chave por metadata não vazia de restoreId,
sem hidratar material privado nem depender de máscara pontual vazia (ADR 0210).

Exponha restauração de aventuras somente pela lista imutável
ADVENTURE_RESTORE_METHODS e pelos exports literais; autorize UID antes do dispatch,
mantenha App Check e headers privados e não escolha método pelo payload.
Mantenha leitores/chaves/helpers fora dos callables; teste run e middleware HTTP
separadamente, com atestações sintéticas restritas aos testes (ADR 0211).

Crie chave de retomada de aventura atomicamente no início, com efeito de
metadados/fingerprint e nascimento nativo imutável; nunca crie chave tardia.
Entregue segredo somente no HTTP privado Auth/App Check, fora dos callables.
No cancelamento e primeira coleta, remova por metadata mascarada, sem ler
keyBase64; recuse port sem getAll. Replay não recria chave nem altera job
ativado; legado sem efeito não recebe chave nova (ADR 0212).

No cliente de retomada de aventura, use identidade própria e grant AES-GCM não
extraível. A primeira autorização obtém keyId; a retomada exige o mesmo keyId.
Confira conta/guard em cada await, limite a resposta e zere buffers, inclusive
o chunk recusado. Não persista/retorne keyBase64 nem substitua o HTTP privado
por callable. Preserve rewrite exata anterior à SPA (ADR 0213).

Registre pedidos de preparação da aventura somente na lista de 14 comandos
e no journal AES-GCM próprio, com AAD da aventura e CAS do envelope inteiro.
Exija Web Locks/IndexedDB/WebCrypto e reautorize cada abertura, sem fallback
plaintext ou exclusão após falha. Capture inputs antes de await e preserve
pendência se o ACK após commit for incerto. Efeitos que encerram a chave
exigem registro metadata separado (ADR 0214).

Execute a preparação da aventura por unidade, com intent persistido antes do
envio e confirmação de action/ID/checkpoints/views antes de limpar por CAS.
Repita pendência exata sem replanejar. audit-ready sem biblioteca exige
instalação; só a auditoria posterior permite pausar para revisão, inclusive
com zero imagens. Use fases/views próprios e mantenha ativação/efeitos fora
do controlador; metadata pública não é prova de grant (ADR 0215).

No início/upload de aventura, use fingerprint/target e IDs de bloco do domínio
próprio. Persista somente metadata do início antes de enviar, com CAS inteiro;
fence de início desconhecido não cancela job confirmado. Leia metadata sem
inventar keyId; journal/driver de preparação ainda exigem contexto privado.
Hash completo do Blob nativo precede append; preserve bytes/ID pendentes e
revalide o arquivo após reload. Não persista arquivo/nome/prosa (ADR 0216).

Na exclusão de aventuras, confira adventureDeletionReservations com máscara
antes de recriar/consumir a origem; raiz reaparecida não reabre acesso.
Catálogo da aventura usa servidor, não listagem direta pelo SDK. Fonte de
confirmação observa nascimento/updateTime nativos da raiz e progresso.
Recibo histórico não libera chave, corpo novo ou mídia; revalide o ACK depois
do I/O. Notas próprias da campanha e imagens/personas independentes continuam
separadas da origem. Não exponha produtor de exclusão antes de completar
inventário, quiescência, limpeza e retomada do plano 199 (ADR 0221).

No início privado da exclusão de aventuras, fixe sourceToken/nascimento/revisão,
reserve job/recibo/raiz na mesma transação e desfaça o vínculo tipado do universo.
Reconfira nascimento conjunto e último recibo/updateTime; fence desconhecido
não cancela confirmado. Leia receipt por folhas, não por objeto inteiro.
O inventário versionado usa páginas de até 25 e grupos de filhos por intervalo
da raiz, com caminho/família exatos; não dependa de head existente. Exija vazio
separado em todas as famílias e revise a versão ao mudar o layout (ADR 0222).

No avanço privado da exclusão de aventuras, conserve o nascimento original no
job conferido pelo token/recibo inicial. Grave checkpoint/recibo e efeitos na
mesma transação, preservando updateTime do marcador. Retire snapshots por
metadata e origem exatas; desligue turnos ativos antes de aceitar conclusão
tardia. Não descarte perguntas próprias implicitamente junto dos snapshots e
não certifique fases cujos processadores ainda não existem (ADR 0223).

Na exclusão de aventura restaurada, componha mídia/coleta originais e o
checkpoint da exclusão atomicamente. Retire preparing por geração e reconfira
a intenção após I/O; não publique no encerramento. Preserve biblioteca ativa,
personas e recibos. Retire a chave pela primeira coleta original após mídia,
sem quebrar seu sidecar. Reserva de fonte sem head e artefato reaparecido
impedem certificação; importação prova a raiz pelo recibo de ativação (ADR 0224).

Na limpeza de aventura, consulte usos de imagem somente no namespace do UID,
por caminho/tipo/recurso/chave tipados. Agregue decrementos por imagem em cada
página e preserve arquivos/metadata independentes. Uso sem imagem não recria
contador. Remova autoria pelo inventário limitado, sem carregar prosa ou exigir
pais. Reabra família conhecida que reaparecer antes do vazio final; não certifique
nem apague caminhos ou donos inesperados (ADR 0225).

Na limpeza derivada do chat da aventura, use páginas por metadata e escopo exato
do UID/projeto/nascimento. Órfão pronto exige recibo original imutável e hash
reconstruído; órfão temporário sem origem verificável recusa sem ler captura.
Preserve perguntas/recibos e outros projetos, inclusive criados após o início.
Cursor de grupo guarda o caminho completo. Retire retomada canônica com revisão
atômica da conta, preservando accessedAt; alias/inconsistência recusam (ADR 0226).

Na verificação terminal da aventura, repita a inspeção limitada do chat e releia
inventário/usos/fontes/atividade no commit final. Conteúdo próprio conhecido
reabre sua fase e trunca certificados; corpo/controle com escopos contraditórios
recusa. Remova raiz, atualize reserva e grave job/recibo atomicamente. Leitor
terminal exige raiz ausente e updateTime de reserva/job igual ao nascimento do
último recibo; enquanto deleting, reserva conserva o relógio inicial (ADR 0227).
