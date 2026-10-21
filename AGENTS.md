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
6. Execute testes direcionados a cada ajuste e `npm run validate` no fechamento do incremento.
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
- Na criação assistida, mantenha sessões, entrevista, validação e confirmação do livro/lore/capa com débito atômico em `functions`.
- Mantenha vínculos e exclusão de imagens da biblioteca no servidor; todo seletor de imagem deve oferecer `ImageLibraryPicker` pela interface pública da feature.
- Mantenha universos, vínculos de livros e mutações de lore global em `functions`.
- Preserve a revogação do lore global por versão nas regras e no leitor público.
- Mantenha aventuras/campanhas, recibos de criação e preparação do Estúdio no servidor; use paginação por tipo/dono e preserve identidade/conteúdo dos livros legados.
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

## Testes

- Toda mudança de comportamento deve considerar testes.
- Teste o resultado observável.
- `npm run test` aplica limites de cobertura; não os reduza para fazer passar.
- Instale as dependências de `functions` com `npm ci --prefix functions` antes de validar.
- Use `WRITER_VISUAL_PORT` distinto por checkout nas execuções visuais paralelas.
- Mantenha protótipos demonstrativos em `e2e/visual`; não registre fixtures como evidência de autorização, pagamento ou piloto reais.
- Repita apenas os testes afetados pelo ajuste; amplie a validação quando houver risco de integração ou falha sem causa resolvida.
- Avance após validação local sem esperar a CI remota; acompanhe os checks em paralelo e corrija regressões identificadas.

## Documentação

- Toda decisão relevante atualiza a documentação ou uma ADR.
- Toda entrega implementada gera um registro em `docs/entregas`, com
  funcionalidades, testes e o resultado real das validações.
- Mudança que cria ou revoga uma regra atualiza este `AGENTS.md`.

## Conclusão

Uma tarefa só está concluída quando todos os itens da definição de
concluído estiverem satisfeitos. A lista fica em
`docs/development-process.md` e é a única fonte da verdade.
