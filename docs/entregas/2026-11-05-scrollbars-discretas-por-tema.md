# Barras de rolagem discretas por tema

As barras de rolagem usam apresentação fina, trilho transparente e controle
com a cor semântica `--muted-foreground` a 80% de opacidade. O trilho acompanha
a superfície onde está inserido, evitando a faixa escura destacada em campos
e painéis. A mudança é global: página, editor, campos e diálogos em portal.
As cores acompanham os temas Claro, Escuro, Sépia e os tokens de temas próprios.

O fallback WebKit usa 8 px, controle arredondado com espaço transparente,
sem botões de seta, reforço no hover e `--primary` ao arrastar. Navegadores com
suporte ao padrão usam `scrollbar-width: thin` e conservam os detalhes nativos
do controle. Cores forçadas restauram largura e cores automáticas do sistema.
Não há handlers de rolagem nem dependências novas.

## Verificação local

O cenário `e2e/visual/scrollbars.visual.ts` foi atualizado para conferir largura
fina, transparência, troca de tema sem recarregar e restauração das preferências
do sistema em cores forçadas. Também verifica rolagem real de textarea e corpo
do modal em viewport de 1440 × 620, além do editor em 1440 × 1000.

O Chromium headless oculta scrollbars por padrão. O cenário remove somente o
argumento `--hide-scrollbars`, permitindo inspecionar a aparência nas capturas.
Os dados são fictícios e o acesso ao backend de produção permanece bloqueado.

- As primeiras duas execuções passaram nos três temas; a segunda inclui
  rolagem real e modal com conteúdo excedente.
- Com barras visíveis nas capturas, Claro e Sépia passaram. O primeiro
  carregamento de `/styleguide` no Escuro excedeu 45 segundos antes das
  asserções; o cenário foi repetido separadamente em porta e saída próprias e
  passou: `1 passed (40.5s)`. Os três temas têm capturas com barras visíveis
  conferidas, incluindo o modal com rolagem real.
- Prettier e ESLint dos arquivos afetados: aprovados.
- `npm run check:styleguide`: `Verificação do styleguide OK.` e
  `Anatomia de página OK.`
- `npm run check:docs`: `Validação da documentação OK.`
- `git diff --check`: aprovado.

O fallback WebKit não foi exercitado em Safari. A aparência exata do controle
padronizado depende do navegador e do sistema operacional. Os controles de
alto contraste continuam nativos.

Alterações locais de outros trabalhos foram preservadas. Commit local solicitado
explicitamente sem executar `npm run validate`. Sem push ou implantação.
