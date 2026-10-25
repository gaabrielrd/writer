# ADR 0144 — Lore nativo na lateral do editor

- Status: aceito e implementado localmente.
- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco E.

## Contexto

A composição nativa de BookPage/LorePage não substituía o formulário independente
de EditorLoreSidebar. A criação por menção exigia nome inicial e retorno ao
manuscrito; usar os callbacks antigos permitia tentar um writer incompatível
com hasLoreResources. Um bloqueio de navegação inativo do capítulo também podia
tomar precedência sobre o formulário protegido.

## Decisão

EditorLoreSidebar usa a interface pública BookLoreAuthoring para criar, editar,
ler e abrir as cinco retomadas do livro. O host fixa conta SDK, livro e alvo
original. Nome inicial é literal e inicializa somente uma tentativa nova;
mudanças de props não sobrescrevem o texto e retomada ignora essa semente.
Fechar devolve o alvo original, permitindo reconhecer somente a menção atendida
e preservar uma solicitação mais recente. Restaura foco ao gatilho conectado.

EditorPage recebe confirmação somente para reler valores atuais. Seus callbacks
de formulário recusam mutações locais e preservam exclusivamente o universo.
Refresh drena as duas leituras, verifica actor SDK exato e época/sessão antes de
publicar e remove dados visíveis se a releitura atual falhar.

Leitura modal e detalhes inline compartilham captura C1/v2 e apresentação em RAM.
O modal conserva o token original quando disponível; a lateral captura a ficha
atual por ID, revalidando acesso antes de mostrar o corpo. Não usa o DTO antigo
como fonte do writer. Consentimento ausente ou inválido continua privado também
no adaptador legado. A ficha inline reaproveita detalhes/relações/privacidade,
sem repetir resumo, categoria e apelidos já exibidos no card.

A transição modal de leitura para edição mantém o host aberto; não chama a saída
do fluxo antes de mudar o modo. LoreDrawer preserva o fechamento anterior por
padrão e permite à composição nativa controlar essa transição.

BusyNavigationGuard só registra bloqueio de rota quando realmente ativo.
Nova entrada de autoria aguarda operações do capítulo; uma operação posterior
não desmonta o rascunho já aberto. Recuperações e entrada por leitura não
habilitam outro escritor enquanto o capítulo estiver ocupado. Preserve os
avisos e a confirmação de saída dos próprios hosts.

As cópias de criação/edição e pedidos pendentes continuam no journal protegido
já existente. Abrir uma retomada não aplica nem reenvia; revalida a mesma origem
e exige as ações explícitas do protocolo. O host de composição não cria outro
armazenamento, chave, RPC ou formato de recuperação.

## Inventário das entradas

- LoreCollection em escopo book, por string ou objeto: BookLoreCollection.
- LoreTab de BookPage e página própria: mesma composição nativa.
- EditorLoreSidebar e menções: BookLoreAuthoring; callbacks locais recusados.
- Universo na lateral e na coleção: formulário/serviço do universo preservados.
- AdventureLoreCollection: contrato próprio de aventuras preservado.
- AssistedBookPage: LoreEntityForm altera proposal.entities em RAM antes da
  criação atômica do livro. A suposição anterior de migração desse formulário
  como writer de uma ficha existente estava incorreta.
- LoreAnalysisDialog: proposta enviada pelo contrato próprio de análise;
  não encaminha uma edição manual pelo formulário da lateral.
- APIs legadas de serviço/hook continuam presentes e protegidas pela barreira
  do servidor. Não inferir que o inventário manual conclui todos os produtores.

## Consequências e limites

A composição manual alcança a lateral e as menções. As cinco retomadas usam
os hosts existentes; não há nova certificação de coleta nem de valor atual
por resultado histórico. Nenhuma alteração em backend, Rules, env ou dependências.

Lifecycle de chaves/exclusão, demais escritores/consumidores, backup/restauração,
drain, rollout e validate integral de P1 continuam necessários, assim como
fases 3–5 e gates humanos/comerciais. Preservar hasLoreResources.
Somente commit local, sem CI/push/PR/merge/deploy.
