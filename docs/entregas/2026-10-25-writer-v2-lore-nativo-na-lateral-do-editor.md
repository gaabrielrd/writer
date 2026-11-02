# Writer V2 — lore nativo na lateral do editor

- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco E / M38c6e.
- Decisão: [ADR 0144](../decisions/0144-native-editor-book-lore-authoring.md).
- Integração: local, codex/writer-v2. P1 e Writer V2 continuam abertos.

## Objetivo e funcionalidades

Criar, editar e consultar fichas locais pela lateral do editor, com as mesmas
operações nativas e cinco listas de retomada do compêndio do livro. A criação
por menção usa nome inicial literal, privado e fixo na tentativa. Mudanças de
props não apagam o rascunho; uma retomada usa a cópia protegida original.

Detalhes inline e modal capturam C1/v2 autorizado antes de mostrar o corpo.
A ficha inline conserva detalhes, características, relações e privacidade,
sem repetir o resumo/apelidos/categoria do card. Ver Ficha → Editar Ficha
mantém o host aberto.

EditorPage apenas relê após confirmação nativa. Seus callbacks antigos recusam
escrita local e continuam atendendo o universo. Refresh drena ambas as leituras,
confere actor SDK exato/sessão/época e não publica resposta de outra tentativa.
Consentimento ausente ou inválido permanece privado.

Nova entrada aguarda operação do capítulo; bloqueio de navegação inativo não
compete com o formulário. Uma operação posterior não desmonta o rascunho.
Fechar reconhece o alvo original e restaura foco. Recuperação após recarga
confere a origem e o aceite sem reenviar uma adoção já confirmada.

## Critérios conferidos

- [x] Autoria local pela interface pública do lore, sem callback inline.
- [x] Nome inicial, draft e pedido protegido preservados.
- [x] Cinco retomadas e isolamento por conta/livro.
- [x] Leitura autorizada compartilhada e consentimento privado por ausência.
- [x] Transição leitura/edição e proteção de navegação.
- [x] Escopo global e manuscrito preservados.
- [x] Testes direcionados, navegador real, documentação e commit local.

## Inventário e arquivos

BookLoreAuthoring, BookLoreInlineDetails e hook compartilhado de apresentação;
criação, Reader, WorkspaceDialog e conteúdo de LoreDrawer; interfaces públicas.
EditorLoreSidebar, EditorPage e BusyNavigationGuard; testes e prévia visual;
ADR, AGENTS, arquitetura, testes e registros de execução.

LoreCollection/LoreTab, BookPage/LorePage, lateral e menções usam o fluxo nativo
nos livros. AssistedBookPage edita proposal.entities em RAM antes da criação
atômica: a pendência anterior de migrar esse formulário como writer de uma
ficha existente estava incorreta. LoreAnalysisDialog conserva o serviço próprio.
Universos e aventuras mantêm seus contratos. Nenhum backend, Rules, env ou
dependência foi alterado. Serviços legados continuam presentes sob a barreira
hasLoreResources; este inventário manual não conclui todos os produtores.

## Testes dirigidos

**124 casos distintos positivos em sete arquivos:**

- EditorLoreSidebar: nove; roteamento local, globais, menções, filtros e busy.
- EditorPage: dez; releitura após confirmação sem SDK writer e regressões globais.
- BusyNavigationGuard: cinco; bloqueio ativo, saída e não competição inativa.
- BookLoreCollection: 28; hosts, leitura inline, contexto, alvo original,
  transição leitura/edição e regressões da coleção nativa.
- BookLoreCreationEditor: 23; nomes literais, props, retomada e preparação.
- LoreDrawer: dois; conteúdo/relações e contrato legado.
- loreService: 47; consentimento privado, barreiras e regressões de serviço.

m38c6e-unit.json registra 123/123; m38c6e-reader-unit.json registra 30/30 após
o ajuste de leitura/edição, incluindo um caso adicional e 29 repetidos.
O total distinto é 124, sem somar as repetições.

## Chromium e inspeção

**30 jornadas distintas positivas:**

- Matriz 24/24: quatro cenários nos seis projetos desktop/mobile × claro/escuro/
  sépia. Criação por menção, leitura → edição, recuperação, texto/foco do
  manuscrito, detalhes inline, painel compacto e cancelamento de menção.
- Repetição dirigida 6/6 da jornada de autoria, agora com recarga real antes
  de abrir a recuperação. Quantidade de adoções permanece duas: criação e
  edição distintas; a recuperação não produz outra.
- Duas jornadas desktop adicionais: minimapa com quatro categorias e criação
  protegida em 320px.
- Quatro regressões desktop: três do compêndio e uma de resumo/visibilidade,
  com preservação dos detalhes e retorno de foco.

As repetições não aumentam o total distinto. Sem skipped/flaky nos resultados
positivos. React, serviços, journal, IndexedDB, Web Locks e AES reais;
handlers nativos com Firestore em memória no Node. Auth, SDK, App Check e
HTTP de chave em fixtures locais, sob isolamento de rede/CSP. Não comprova
credenciais, regras implantadas, latência ou produção.

Capturas finais de desktop claro/escuro, detalhe mobile sépia, recuperação
mobile escura e criação em 320px inspecionadas. Campos/rodapés visíveis, conteúdo
dentro da largura e resumo sem duplicação. Artefatos fora do Git em
writer-v2-portability-qa: m38c6e-matrix, m38c6e-reload,
m38c6e-directed-desktop, m38c6e-regression-initial e m38c6e-regression-final.

Na primeira jornada, a expectativa contava uma adoção, embora criação e edição
usem duas identidades distintas. O teste passou a capturar o total anterior à
recuperação e exigir que continue igual. Na regressão de resumo, o teste antigo
esperava o card substituído pela releitura: atualizado para o controle estável
da lista, conforme o contrato nativo; reabertura sem aplicação retorna ao gatilho.
A repetição dirigida passou. A inspeção também corrigiu duplicação visual e a
saída prematura do host durante a transição leitura/edição.

## Validações locais

- npm run build positivo: tipos, 2979 módulos, bundle e smoke OK.
- Lint dirigido, arquitetura, styleguide, formatação, docs e diff positivos.
- Bundle principal 2964,97 kB, gzip 864,09 kB. Avisos herdados de chunk grande
  e imports dinâmicos ineficazes permanecem.
- Validate integral não executado neste incremento: decisão do operador exige
  testes dirigidos durante desenvolvimento e suíte completa no fechamento de P1.
- Sem repetir testes gerais Node/Rules/SDK: os contratos do servidor não mudaram.
- Sem CI, push, PR, merge ou deploy. Alterações em commit local.

## Limites e continuidade

A composição manual da etapa 5 está implementada localmente. Preserve lifecycle
de chaves/exclusão, inventário dos demais escritores e consumidores, backup/
restauração, drain/rollout e validate integral de P1. Fases 3–5 e gates humanos/
comerciais continuam necessários. Não enfraquecer hasLoreResources nem inferir
que a composição libera ativação.

Leitura completa mantém o corpo autorizado em RAM, sujeita aos limites reais do
dispositivo. Sem leitor de tela, zoom físico de 200%, segundo dispositivo ou
piloto humano neste marco.

## Como conferir

Abra um capítulo, use @Nome para criar uma ficha, prepare e confirme.
Confira o manuscrito; abra Ver Ficha e depois Editar Ficha. Prepare/aplique,
feche mantendo a cópia, recarregue a página e use Retomadas do compêndio para
reabrir. O texto deve permanecer e a retomada não deve aplicar novamente.
Confira também o escopo do universo e a largura de 320px.
