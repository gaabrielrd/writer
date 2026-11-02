# ADR 0143 — Composição nativa do compêndio dos livros

- Status: aceito, BookPage/LorePage implementados localmente; demais entradas pendentes.
- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco D.

## Contexto

As interfaces protegidas de criação, edição, retirada e seleções foram exportadas,
mas LoreCollection ainda encaminhava livros aos formulários e writers antigos.
Uma ficha externa ou livro com hasLoreResources não admite esse fallback.
A lateral do editor e outras entradas também terão de migrar antes do rollout.

## Decisão

Encaminhar escopos book, string ou objeto, de LoreCollection para
BookLoreCollection. A aba do BookPage e a página LorePage usam esse caminho.
Universos e aventuras continuam com seus contratos próprios. Não inferir que
isso migrou EditorLoreSidebar, criação por menções ou revisão assistida.

Expor captureList no cliente C1 existente. Preservar captura bruta imutável e
token original por ficha; reconferir a coleção inteira antes de retornar.
A API list mantém DTO antigo com dados clonados. Nenhuma nova RPC/schema.

Hook por actor SDK exato/livro, com guard e epoch em cada refresh. Corpos ficam
somente em RAM; resposta antiga ou desmontagem não publicam resultado. Falha
remove dados visíveis; Retomadas permanece disponível mesmo com erro na lista.
Sem cache local em claro, fallback SDK ou preenchimento fictício de fonte.

Projeção serve somente à apresentação. Preservar literais; ausências opcionais
podem aparecer vazias na UI, consentimento ausente é privado, datas não são
inventadas. Nunca usar essa projeção como entrada C1 de writer. A ficha aberta
é capturada/reautorizada pelo token original antes de mostrar detalhes.
LoreDrawer aceita essa projeção sem exigir datas ou normalizar texto de autoria.

Compor hosts já aprovados e cinco listas de recuperação: edição, criação,
retirada singular e seleções de retirada/visibilidade. Abrir nova tentativa não
envia escrita. Escolher visibilidade não confirma; bool e alvos ficam fixos
antes da revisão. Seleção de todos os filtrados, busca por nome/apelido/resumo,
categorias, grid/lista, relações e portal de ações continuam disponíveis.

Cancelar/fechar usa a política do host protegido. Dados de conta/livro anterior
não são reaproveitados. Após prova do filho, remover somente IDs concluídos da
seleção e reler os valores atuais; não aplicar isPublic histórico no estado
local. Unchanged e applied são distintos. Manter falhas ainda presentes
selecionadas. Restaurar foco ao gatilho conectado ou ao controle estável da lista.

A prévia visual usa uma leitura de fixture para cenários de layout e um binding
nativo isolado para os testes do compêndio. Nesse binding, React/serviços/journal/
IDB/AES são reais e os handlers nativos usam Firestore em memória no Node.
Auth, App Check, SDK e chave HTTP são fixtures locais, sob CSP/rede isoladas.
Sem binding, Firebase continua falhando fechado; não instalar simulação em produção.

## Consequências e continuidade

Etapa 5 avança para BookPage/LorePage; plano 125 permanece aberto para a lateral
do editor e entradas associadas. Inventariar e migrar menções e revisão assistida,
sem remover ações ou enfraquecer hasLoreResources para permitir writer antigo.
A migração dessas entradas exige preservar nome inicial, retornos ao editor,
escopo global/local e rascunhos protegidos.

Também continuam lifecycle de chaves/exclusão, outros escritores, consumidores
lógicos/seletivos, backup/restauração, rollout/drain e validate integral de P1,
fases 3–5 e gates humanos/comerciais. Sem mudança backend/Rules/env/deps,
sem ativação remota. Somente commits locais, sem CI/push/PR/merge/deploy.
