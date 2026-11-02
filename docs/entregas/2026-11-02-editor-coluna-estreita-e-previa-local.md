# Editor: coluna de escrita mais estreita — 2026-11-02

A preferência de largura continua controlando as páginas em 960/1280/1600 px.
A prosa do editor passa a ter limites próprios de 640/760/880 px, com 760 px no
padrão Médio. A coluna permanece centralizada na área de escrita e respeita a
tela disponível, inclusive com painéis abertos e em tela cheia.

O operador confirmou que as linhas curtas do capítulo da captura eram quebras
provenientes da importação. Nenhum conteúdo ou quebra do manuscrito foi alterado.

## Prévia local

Servidor isolado com componentes reais, conta e dados fictícios, sem backend de produção:

```text
npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 4182 --strictPort
http://127.0.0.1:4182/e2e/visual/editor-layout.html
```

A entrada prepara prosa longa e abre o editor real. Aceita `?width=small`,
`?width=medium` e `?width=large`. O parâmetro `sample=imported` prepara um exemplo
com quebras fixas para comparação. A página e o bootstrap ficam apenas em e2e;
não são entradas de produção. Preferências também permite trocar a largura pela UI.

## Verificação

- Quatro jornadas Chromium passaram: desktop e mobile, três preferências,
  centralização geométrica, tela cheia, alternância de Assistente/Compêndio e
  ausência de overflow horizontal.
- Página local com parágrafos longos: largura medida de 760 px no padrão Médio.
- Captura desktop inspecionada; página aberta no Edge para aprovação do operador.
- check:styleguide e lint dos arquivos TypeScript afetados passaram.
- Diff revisado; nenhum segredo, dependência ou alteração de backend.
- Não foram executados validate, push ou deploy nesta correção.

## Fechamento aprovado

O operador aprovou a prévia e solicitou integração local na principal. A correção
foi consolidada diretamente na master. Os servidores Vite do Writer encontrados
foram encerrados, incluindo a prévia na porta 4182.
