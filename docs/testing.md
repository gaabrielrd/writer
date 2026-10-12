# Testes

## Filosofia

Testamos o **comportamento observável** da aplicação: o que o usuário vê e faz. Não testamos detalhes internos de implementação. Um bom teste continua passando mesmo que você reorganize o código por dentro, desde que o comportamento continue o mesmo.

## Tipos de teste

- **Unidade**: funções e lógica isoladas (ex.: cálculo, formatação).
- **Componente**: renderização e interação de componentes, com Vitest + React Testing Library.
- **Contrato local**: setup transacional, regras arquiteturais, links da documentação e artefato de build.
- **E2E**: fluxo crítico no Chromium contra o bundle de produção, com
  Playwright.
- **Identidade visual**: contrato de estilo (valores computados dos tokens) e
  regressão visual da página `/styleguide`.

## Localização

Os testes ficam dentro da feature, na pasta `tests/`:

```
features/minha-feature/
├── components/
├── model/
├── services/
└── tests/        # os testes desta feature
```

## Comandos

```bash
npm run test          # roda os testes uma vez, com limites de cobertura
npm run test:unit     # roda apenas Vitest, sem cobertura (mais rápido)
npm run test:coverage # roda Vitest aplicando os limites de cobertura
npm run test:book-generation # backend de geração e normalização real de capas
npm run test:setup    # testa setup e regras arquiteturais em projetos temporários
npm run test:e2e      # testa o fluxo crítico em um navegador Chromium real
npm run test:e2e:update # regera as imagens de referência do styleguide
npm run test:watch    # roda em modo contínuo enquanto você edita
```

Antes da primeira execução local do E2E, instale o navegador compatível com a
versão do Playwright:

```bash
npx playwright install chromium
```

O E2E escolhe uma porta efêmera, gera o bundle e serve a aplicação localmente.

## Identidade visual

`e2e/styleguide.spec.ts` protege o styleguide em duas camadas:

1. **Contrato de estilo**: compara os tokens semânticos (`--background`, `--foreground`,
   `--primary`, `--destructive`) e as cores aplicadas ao corpo, aos botões e ao
   alerta de erro nos temas claro, escuro e sépia. Verifica também persistência
   após recarregar, alternância e acompanhamento do tema do sistema. É
   determinístico em qualquer sistema operacional e a falha diz exatamente qual
   valor mudou. Roda sempre, inclusive no CI.
2. **Regressão visual**: compara a página `/styleguide` inteira, pixel a pixel,
   com a imagem em `e2e/__screenshots__/<plataforma>/`. Pega mudanças de
   layout e espaçamento que o contrato não vê.

A fonte do sistema muda o resultado, então cada plataforma tem sua própria
imagem. Quando não existe imagem para a plataforma atual (por exemplo, no Linux
do CI antes de alguém gerar a primeira), o teste é **pulado** com a instrução,
em vez de falhar.

Depois de uma mudança visual **intencional**, regere e revise a imagem no diff
do pull request:

```bash
npm run test:e2e:update
```

Se a imagem mudou sem que ninguém tenha mexido no visual, é regressão: veja o
comparativo em `test-results/` antes de aceitar.
Ele não depende de rede externa nem de dados preexistentes. O CI instala também
as dependências de sistema do Chromium e publica trace e screenshot apenas em
caso de falha.

## Cobertura

Instale também as dependências do backend com `npm ci --prefix functions`. `npm run test:setup` executa os testes de geração. Os testes de regras cobrem criação manual atômica e isolamento dos registros de geração.

`npm run test` aplica limites mínimos definidos em `vitest.config.ts`: 85% de instruções e linhas, 75% de ramos e 90% de funções. Uma queda abaixo disso falha o `validate` e o CI.

Os limites existem para impedir regressão, não para virar meta. Não escreva teste de caso impossível só para subir o número — se um trecho é difícil de cobrir, normalmente ele está pedindo para ser simplificado. O relatório HTML fica em `coverage/` após rodar `npm run test:coverage`.

## Exemplo curto

```tsx
import { render, screen } from '../../../test/render';
import { Saudacao } from '../components/Saudacao';

test('mostra o nome informado', () => {
  render(<Saudacao nome="Ana" />);
  expect(screen.getByText('Olá, Ana')).toBeInTheDocument();
});
```

### Injeção de Dependências em Testes

Para componentes que dependem de estado global, providers de roteamento, ou clientes de API, o ambiente de testes deve fornecer instâncias ou mocks desses contextos (Dependency Injection via Context).

- Em vez de importar o `render` do `@testing-library/react` em cada arquivo, centralizamos essa configuração em um utilitário próprio, como um `renderWithProviders`.
- No nosso template, a importação customizada de `../../../test/render` (mostrada acima) se encarrega de envelopar o componente com todos os Providers necessários, garantindo que a árvore de componentes em teste tenha o mesmo contexto que a aplicação real.

O foco é no que aparece na tela, não em como o componente foi escrito por dentro.

### O que já vem testado

A composição da aplicação tem smoke test em `src/app/tests/`: a rota raiz monta com layout e página inicial, um endereço desconhecido cai na tela de "não encontrada" sem derrubar o layout, e uma rota que lança erro é substituída pelo `errorElement`. Se você mexer em rotas ou no layout, esses testes são a primeira rede.

O setup também é comportamento público do template. Seus testes executam dry-run, personalização, repetição idempotente e rollback em pastas temporárias. A persistência testa migração, backup de dados inválidos, conflitos de revisão e sincronização entre abas. O smoke test serve `dist/` em uma porta efêmera e acessa o HTML e seus assets como um navegador faria.

O smoke E2E complementa essas redes executando o React no Chromium: verifica a
página inicial, os campos e a troca de modo do login, o histórico de navegação e
o retorno da rota de fallback. Não autentica usuários nem cria contas reais. Ele fica
em um gate separado de `npm run validate` para que a validação local não baixe
binários de navegador implicitamente.

## O que NÃO testar

- Estado interno ou nomes de variáveis do componente.
- Detalhes de implementação de bibliotecas de terceiros.
- Estilos puramente visuais sem impacto no comportamento.
- Casos impossíveis só para "aumentar cobertura".

## Investigar falhas

Dropdowns são testados abrindo o controle e escolhendo a opção pelo label visível;
não use `selectOptions`/`selectOption` de selects nativos. `src/test/dropdown.ts`
e `e2e/dropdown.ts` ajudam nesses fluxos. Os contratos de busca, seleção, ações,
teclado e feedback ficam em `src/shared/ui/tests/Dropdown.test.tsx`; os temas,
dimensões e integração com modal ficam em `e2e/visual/dropdown.visual.ts`.

1. Leia a mensagem de erro: ela costuma indicar o que era esperado e o que aconteceu.
2. Rode em modo contínuo (`npm run test:watch`) e ajuste até passar.
3. Se um teste falha após uma mudança de comportamento intencional, atualize o teste para o novo comportamento esperado.
4. Se a falha for inesperada, corrija o código, não o teste.

O cenário visual de seleção parcial posiciona o cursor no início, zera a
rolagem do contêiner e da página e aguarda dois frames antes de medir o arrasto.
No celular, a distância para ocultar o trecho é calculada pela posição real
dele. O CI executa primeiro esses seis cenários como verificação rápida no
Linux; quando passam, executa a suíte visual completa de 324 cenários.
O gate E2E tem limite de 25 minutos para os testes e artefatos; o timeout
individual dos testes visuais permanece em 45 segundos.

## Roadmap Writer e regras reais

A [matriz de aceite](tasks/roadmap-acceptance.md) relaciona as tarefas 01–08 aos
comportamentos e testes. `npm run test:rules` inicia somente um emulador Firestore
local e roda as regras reais com identidades fictícias, inclusive anônimo, autor
e intruso. Requer Java 21; o runner baixa uma versão oficial fixa do emulador e
verifica SHA-256 antes de executar. Não depende do Firebase CLI nem acessa
produção. O projeto de teste é sempre `demo-writer-rules`.

Antes de executar `npm run test:rules`, instale as dependências da raiz com
`npm ci` e do backend com `npm ci --prefix functions`. Os testes de análise de
lore usam o Admin SDK de `functions` para verificar transações reais no emulador.
Cada job de CI que executa regras precisa fazer ambas as instalações; o contrato
em `scripts/run-firestore-rules.test.mjs` verifica essa ordem por job.

A suíte visual estende os cenários existentes com leitor/publicação e exportação
nos três temas e em desktop/mobile. Ela anexa DOCX, PDF gerado pelo Chromium a
partir do documento de impressão e imagens para revisão. A confirmação do
diálogo nativo de impressão continua pertencendo ao navegador/usuário.

`npm run validate` mantém os limites de cobertura; os testes unitários usam dois
workers para evitar saturação de memória/CPU em máquinas compartilhadas. Não há
redução de limites, desativação de testes ou regeneração automática das imagens
de referência para esconder regressões.

## Modais

`e2e/visual/dialog-layout.visual.ts` mede o limite de `80vh` e confirma que
header/footer mantêm suas posições ao rolar o conteúdo em edição de livro,
importação extensa e configurações de IA. Cobre os três temas, desktop,
celular, viewport baixo e largura de 320 px, incluindo envio pelo footer.

## Biblioteca de imagens

Criação assistida: `AssistedBookPage.test.tsx` cobre entrevista, briefing,
revisão, lore privado, capa, saldo, retomada e recuperação de resposta incerta.
`assistedBookService.test.ts` verifica a callable e os erros definitivos/incertos.
`functions/test/assistedBook.test.mjs` cobre autorização, limites, expiração,
relações, regeneração e confirmação transacional com débitos idempotentes.
As regras de geração também bloqueiam acesso direto a sessões e recibos.

Os testes da feature cobrem seleção, gerenciamento, páginas, erros e isolamento
na troca de conta. Os testes de backend cobrem aceite permanente e idempotente,
reutilização sem débito, referências, exclusão protegida, migração e paginação.
As regras no emulador impedem forjar imagens ou referências pelo navegador.
`e2e/visual/image-library.visual.ts` valida menus por teclado, tooltip, breadcrumb,
gerenciamento e seleção no formulário nos três temas e em desktop/celular, incluindo
320 px. Serviços fictícios isolados impedem acesso ao Firebase de produção.

## Universos e lore compartilhado

Testes de componentes cobrem gestão de universos, vínculos, seções de lore,
edição separada no editor, atualização global e backup privado de versão 2.
O backend cobre autoria, retentativas, contadores, referências globais e exclusão
concorrente. `npm run test:rules` inclui isolamento de universos, proteção de
metadados, consentimento global e revogação por URLs diretas.

A suíte visual usa serviços fictícios isolados, sem rede externa, em desktop e
celular nos temas claro, escuro e sépia:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/universes.visual.ts
```

`LoreCollection.test.tsx` cobre lista/grid, seleção individual e de resultados
filtrados, cancelamento/confirmação, foco, progresso, falhas parciais, escopos e
remoções recebidas por sincronização. Os testes de serviços existentes continuam
verificando revogação local e mutações globais no servidor.
`e2e/visual/compendium.visual.ts` mede alinhamento das ações com as abas e da
busca com categorias, verifica seleção/visibilidade/exclusão e captura lista,
barra e modais nos três temas, incluindo a largura de 320 px:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/compendium.visual.ts
```

`e2e/visual/editor-adjustments.visual.ts` verifica o topo compacto do compêndio,
busca e filtros, o assistente lateral com campo/envio acessíveis, ações acima da seleção,
aceite explícito, foco por teclado e contraste do item ativo em `@`. Cobre os
três temas, desktop/celular e 320 px. A medição anterior ao ajuste foi 313 px
entre o topo do painel e a lista em 1440 × 1000; o novo limite é 70% dessa altura.
As respostas de IA são fictícias e a configuração visual bloqueia rede externa.

O chat tem contratos/modelos/serviços em `chapterChatModel.test.ts` e
`chapterChatService.test.ts`, interface e ciclo da conversa em
`ChapterChatPanel.test.tsx`, captura real/seleção/viewport/transação em
`chatEditorBridge.test.tsx` e backend em `functions/test/chapterChat.test.mjs`.
`tests/firestore/chapter-chat.rules.test.mjs` bloqueia leitura/forja por dono,
intruso e anônimo e executa aceite concorrente com transações reais no emulador.
`e2e/visual/chapter-chat.visual.ts` mede espaço compartilhado, testa comandos,
aceite/desfazer, retomada, viewport e cancelamento nos seis projetos de tema/dispositivo.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/editor-adjustments.visual.ts
```

## Atos

Os testes de atos cobrem numerais, grupos, busca, seleção, modais, conflitos,
contagens, publicação e exportações. A suíte de regras inclui autoria, vínculos
entre livros, projeções mínimas, imutabilidade e revogação.
O cenário visual captura modais e grupos nos três temas, desktop/celular e
320 px, mede a busca ao lado de Novo capítulo e anexa DOCX e PDF reais.
A variável WRITER_VISUAL_PORT permite testar uma worktree em porta separada.

Veja [atos](book-acts.md).

## Minimapa do capítulo

`chapterMinimapModel.test.ts` cobre títulos, parágrafos, listas/citações, aliases,
formatação inline, exclusão de código, vazio e 15 mil palavras. Os testes de
`ChapterMinimap` verificam escolha/aceite por teclado, clique por posição,
ocorrência e gesto de toque. `useChapterMinimap.test.tsx` cobre geometria,
scroll/resize, atualização de documento/lore, preservação da seleção e limpeza.
`RichEditor.test.tsx` verifica substituição externa e atualização ao formatar.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-minimap.visual.ts
```

A suíte usa os componentes reais e serviços fictícios em seis projetos
(desktop/celular × claro/escuro/sépia). Mede o destaque no início, meio e fim,
preserva seleção e HTML durante cliques, verifica escrita contínua, compêndio
aberto, 320 px e ausência de transbordamento horizontal. Compara também as cores
das quatro categorias com as tags reais, nos esquemas do sistema claro/escuro,
e confirma traços de 1 px com contorno de 2 px sem escala do SVG e intervalo
mínimo de 1 px entre marcas em capítulos densos. Capturas incluem a
viewport de 320 px para revisar a faixa aderente sem reduzir o capítulo inteiro.

## Listagem de capítulos

`e2e/visual/chapters.visual.ts` compara a borda, raio, superfície do cabeçalho,
divisórias, padding e tipografia da tabela de capítulos com a lista do compêndio
no desktop. Nos três temas e em celular, cobre seleção por teclado, estado
intermediário, destaque de linha e abertura do editor pelo título. Em 320 px,
verifica títulos completos acessíveis, contagens, ações e ausência de rolagem
horizontal na página e dentro da tabela.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/chapters.visual.ts
```

## Personas de escrita

Os testes de `ai-assistant` cobrem os seis padrões, atributos personalizados,
precedência, referências indisponíveis, revisões concorrentes, formulários,
falhas e retry. Autocomplete e ações invalidam respostas antigas sem inserir
texto nem cobrar; os três adaptadores recebem as mesmas instruções. O backup
v3 preserva apenas personas utilizadas e seus vínculos, sem credenciais.
`tests/firestore/personas.rules.test.mjs` cobre isolamento, revisões, limites,
16 atributos e vínculos próprios.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/personas.visual.ts
```

A suíte cobre os três temas em desktop/celular, com edição em 320 px, sliders
por teclado, ações fixas, arquivamento/reativação e composição enviada às
chamadas de escrita. As respostas são fictícias; não avalia qualidade literária
do modelo nem faz chamadas de produção. Veja [personas](ai-personas.md).

`AISettingsPage.test.tsx` verifica a navegação para `/settings/ai`, as abas com
setas/Home/End, abertura de detalhes gráficos e retorno do foco à linha da lista.
Os testes visuais confirmam os avatares, barras de intensidade, layout em uma
coluna em 320 px e retorno ao editor. A aba do provedor persiste na URL e as
preferências são mantidas ao recarregar. Cada teste tem um contexto de navegador
novo; a preparação da prévia não limpa configurações durante um reload.

## Formulários do estúdio

`FormSection.test.tsx` cobre teclado, abertura controlada e preservação ao recolher.
Testes de livros/lore cobrem salvamento pelos dados essenciais, edição direta,
visibilidade, relações incompletas em seções fechadas, IDs estáveis de retry,
URL inválida, busy e aceite explícito de IA. Campos compartilhados verificam
IDs únicos e hints/erros associados por ARIA.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/studio-forms.visual.ts
```

O cenário usa somente fixtures, cobre desktop/celular nos três temas, teclado,
retorno do foco, aviso de publicação e 320 px. A suíte visual completa continua
protegendo capas 2:3, livro único, títulos longos, capítulos, minimapa, personas,
importação, universos e IA. Nenhum snapshot é regenerado automaticamente.
