# Prévia visual isolada do Writer

Este conjunto renderiza os **componentes, CSS, providers e rotas reais** da aplicação com uma conta e um universo literário inteiramente fictícios. Não usa usuários, manuscritos, credenciais, créditos ou persistência de produção.

## Executar

Depois de instalar as dependências do projeto e o Chromium do Playwright:

```sh
npx playwright install chromium
npx playwright test -c playwright.visual.config.ts
npx playwright show-report visual-playwright-report
```

O Playwright inicia um servidor Vite exclusivo em `127.0.0.1:4177`, com `vite.visual.config.ts`, e o encerra ao terminar. Uma porta já ocupada causa falha, sem reutilizar um servidor desconhecido. Para investigar apenas uma combinação:

```sh
npx playwright test -c playwright.visual.config.ts --project=mobile-dark
```

A suíte existente de produção continua usando `playwright.config.ts` e não descobre os arquivos `*.visual.ts`. Nenhum script de produção, sinalizador da aplicação ou fluxo de implantação é alterado.

## Cobertura e evidências

São seis projetos: desktop de 1440 × 1000 e mobile de 390 × 844, cada um em escuro, claro e sépia. Cada projeto cobre:

- Landing, login, cadastro e histórico Voltar/Avançar
- Biblioteca populada, capa fictícia, ausência de capa, título e gênero longos
- Modal de novo livro com teclado, confinamento de foco, Escape, Cancelar e retorno ao acionador
- Obra, capítulos longos, compêndio e modal de edição
- Editor com texto e lore, painel lateral e configurações de IA
- Navegação repetida entre biblioteca, obra e capítulos, incluindo Voltar/Avançar
- Ausência de transbordamento horizontal e limites do modal em relação à viewport
- Biblioteca vazia, erro de serviço simulado e recuperação pelo botão de tentar novamente
- Preferência por transparência reduzida, com opacidade e desfoque computados verificados
- Percurso adicional de biblioteca, obra, editor, lore e modal na largura mínima de 320px
- Ausência de exceções JavaScript e de tentativas de chamadas externas

As 16 capturas por projeto recebem a marca **“Prévia visual • dados fictícios”**. O relatório HTML apresenta cada PNG como anexo, junto com tema, viewport e evidência de isolamento. Elas são material de revisão visual; **não são baselines aprovadas nem um teste de comparação pixel a pixel**. As verificações funcionais e geométricas geram falhas reais.

O CI executa a suíte após o E2E existente, inclusive se esse E2E falhar, e publica `writer-visual-preview` em sucesso ou falha. O artefato contém `visual-playwright-report/` e `visual-test-results/`, com retenção de sete dias. Abra `visual-playwright-report/index.html` ou os PNGs após baixar o artefato. Capturas automáticas e traces adicionais são preservados em falhas.

## Isolamento

- Somente o config separado de Vite resolve os módulos de serviços para `fixtures/`. Os componentes e hooks não são substituídos.
- O plugin aplica-se apenas a `serve`; tentar gerar um build com esse config falha deliberadamente. O config normal de produção não o importa.
- Autenticação, livros, capítulos, lore, respostas de IA e créditos usam dados locais determinísticos. Alterações são apenas em memória e desaparecem ao recarregar a página. A seleção da sessão e dos cenários vazio/erro usa o `sessionStorage` exclusivo do contexto do navegador, lido somente pelos serviços fictícios. Não há seleção de cenário no código de produção.
- A exportação compartilhada de Firebase é inerte e falha explicitamente se um caminho inesperado tentar inicializar o SDK.
- O hook real de Google One Tap encontra uma implementação local inerte. Não há login externo.
- Um CSP limita requisições à origem local. O Playwright bloqueia todas as outras origens, registra tentativas e bloqueia service workers. As capas são SVGs fictícios embutidos; nenhuma foto remota é carregada.
- A hora, idioma e fuso são fixos. O relógio continua executando timers normalmente, preservando autosave e comportamento de interação.

Esta prévia não comprova autenticação, autorização, regras Firestore ou integrações de IA em produção. O E2E de produção e os testes existentes continuam responsáveis por seus respectivos contratos.
