# Writer V2 — compêndio nativo em BookPage e LorePage

- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco D / M38c6d.
- Decisão: [ADR 0143](../decisions/0143-native-book-compendium-composition.md).
- Integração: local, codex/writer-v2. Não conclui o plano 125 nem P1/V2.

## Objetivo e funcionalidades implementadas

A aba Compêndio do livro e a página própria usam leitura nativa C1/v2 e os
hosts protegidos de criação, edição, retirada singular e seleções de retirada
e visibilidade. Escopos book em string/objeto seguem esse fluxo; universos e
aventuras conservam seus contratos.

Busca por nome/apelido/resumo, categorias e contagens, grid/lista, seleção de
todos os filtrados, relações locais/globais e portal de ações preservados.
A escolha de visibilidade antecede revisão/confirmar, com bool e origens fixos,
sem limite total de 50. Abertura não envia escrita.

Retomadas reúne edição, criação, retirada singular e duas seleções, acessíveis
mesmo se a lista de fichas falhar. Cópias protegidas não são removidas ao fechar.
Callback relê valores atuais; IDs aplicados/unchanged deixam a seleção e falhas
ainda presentes continuam selecionadas. Não projetar isPublic histórico.

captureList preserva fontes brutas imutáveis e tokens após prova da coleção
inteira; list mantém seu DTO clonado. Apresentação não inventa datas, não altera
literais e trata ausência de consentimento como privada. Seus defaults não
servem de fonte para writer. Abrir ficha reautoriza o token original antes
de mostrar detalhes, com erro focado e retry da mesma origem.

Actor SDK/livro/epoch limitam os resultados, incluindo refresh fora de ordem,
StrictMode e perfil versus substituição do actor. Foco retorna ao gatilho
conectado ou a um controle estável após fechar.

## Arquivos e contratos

BookLoreCollection, WorkspaceDialog, Reader, hook e projeção de apresentação;
roteamento de LoreTab, captura no cliente e tipagem de LoreDrawer. Testes
dirigidos e prévia visual com leitura isolada/binding nativo, ADR/AGENTS/
arquitetura/testes/plano e registros. Sem backend, Rules, env ou dependências.

A lateral do editor ainda tem formulário próprio; não foi substituída por
esse componente. Menções e revisão assistida também exigem migração antes
do rollout, preservando nome inicial, escopo e retornos.

## Testes dirigidos

**115 casos distintos positivos em oito arquivos:**

- BookLoreCollection: 22; composição, escopos book, busca/seleção, cinco retomadas,
  53 origens, valor atual versus efeito histórico, falhas, actor/livro, foco,
  StrictMode e refresh fora de ordem.
- bookLorePresentation: dois, literais/presenças/consentimento e dados inválidos.
- bookLoreReadClient: 56, dois de captureList e regressões de paginação,
  Unicode/BOM, ausências, relações, dados acima de 8 MiB, contexto e prova final.
- bookLoreReadService: 11; leitura regional, actor e contexto.
- bookLoreReadRoundtrip: dois; protocolo real/partes e isolamento.
- bookLoreReadTokenRoundtrip: nove; tokens v1/v2 e origem nativa.
- LoreCollection: 11 regressões mantidas para universos, com writers próprios,
  sincronização, confirmação, falhas parciais, seleção e foco.
- LoreDrawer: dois; apresentação e relações.

São 26 casos do contrato novo e 89 regressões. A antiga verificação de troca
local/global foi incorporada aos testes da composição nativa; os demais casos
da UI antiga continuam conferindo o fluxo de universos.

Relatório principal m38c6d-vitest.json contém 113/113; LoreDrawer foi executado
separadamente e passou 2/2. Não somar repetições ao total de casos distintos.

## Chromium e inspeção visual

**18/18 positivos, sem skipped/flaky**, três cenários nos seis projetos
desktop/mobile × claro/escuro/sépia, em 2,9 minutos:

1. Grid/lista e alinhamento com abas/busca, ficha reautorizada, foco/Space/Escape,
   confirmação e aplicação real de visibilidade, retirada com revisão e
   preservação da seleção ao fechar.
2. Lista/barra/modal em 320px, última linha fora da área sobreposta pela seleção.
3. Criar, editar, fechar mantendo recuperação e reabrir a cópia/prova nativa.

Componentes/serviços/journal/IndexedDB/Web Locks/AES reais. SDK/Auth/App Check e
HTTP de chave são fixtures; handlers nativos executam com Firestore em memória
no Node. CSP e rede externa bloqueadas; não houve acesso ao Firebase real.
Não comprova credenciais/latência de produção, deploy ou rollout.

Sessenta PNGs foram preservados fora do Git; seis inspecionados: grid dos três
temas, lista 320px, criação e retomadas no celular. Ações/rodapé visíveis,
campos e cards dentro da largura, listas de recuperação roláveis no diálogo.
O fluxo inicial teve seletor de resultado ambíguo e prazo de 10s insuficiente
para preparar criação; seletor escopado ao diálogo e janela de 60s no teste.
A bateria final foi repetida após corrigir o ciclo inicial de leitura/foco.

Artefatos em writer-v2-portability-qa: m38c6d-vitest.json e diretório
m38c6d-visual com results.json, images.json e 60 imagens. O resultado visual
inclui logs das chamadas nativas e relatório de isolamento.

## Validações

- npm run build positivo: typecheck, 2976 módulos, bundle e smoke OK.
- Lint dirigido, arquitetura, styleguide, formatação, docs e diff positivos.
- Bundle principal: 2960,82 kB, gzip 862,99 kB, contra 2678,19/790,50 no marco C;
  a montagem passou a incluir os hosts antes exportados sem uso. Avisos de
  chunks/imports dinâmicos continuam; avaliar carregamento por ação no rollout.
- Validate integral não executado neste incremento, por decisão do operador:
  testes dirigidos durante desenvolvimento, suíte completa no fechamento de P1.
- Sem repetir Node/Rules/SDK gerais: handlers e seus contratos não mudaram.
- Sem CI, push, PR, merge ou deploy; somente commit local.

## Limitações e continuidade

Etapa 5 do plano 125 permanece parcial: migrar EditorLoreSidebar, criação por
menções e revisão assistida, sem perder nome inicial/retorno, escopo global e
rascunhos. Writers antigos podem ser recusados pela barreira hasLoreResources;
não enfraquecer essa proteção ou ativar rollout antes da migração/drain.

Também faltam lifecycle de chaves/exclusão, demais escritores, consumidores
lógicos/seletivos, backup/restauração e rollout/validate de P1, além das fases
3–5 e gates humanos/comerciais da V2. A validação de livro inclui captura
completa em RAM, sujeita aos limites reais do dispositivo; sem fonte fictícia.

Sem leitor de tela, zoom físico de 200%, segundo dispositivo ou piloto humano.
A integração das rotas está no código local; backend novo não foi implantado.

## Como conferir

Na aba Compêndio do livro, alternar lista/grid, buscar por apelido, selecionar
fichas filtradas, escolher visibilidade, conferir origens e confirmar.
Após o resultado, a lista deve ser relida. Abrir Retomadas permite entrar
pelos IDs preservados em cada fluxo. Criar/editar usam preparação protegida
antes da confirmação; fechar preserva a cópia conforme aviso do host.
Usar a prévia visual isolada para exercitar handlers nativos sem rede externa.
