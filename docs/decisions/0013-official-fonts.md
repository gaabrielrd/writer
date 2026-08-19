# ADR 0013: Fontes oficiais autohospedadas

## Status

Substituída pela [ADR 0014](0014-extract-shared-styleguide-package.md). A
decisão abaixo registra o estado anterior à extração do pacote.

## Contexto

O template usava `system-ui`, então cada projeto assumia a fonte do sistema de
quem abre a página: San Francisco no macOS, Segoe UI no Windows, algo diferente
no Linux. Duas consequências: nenhum projeto parecia da mesma marca, e a
regressão visual entre plataformas nunca podia ser comparada.

A marca tem duas fontes: **TheMix** para títulos e **Archivo** para texto.

## Decisão

1. **Autohospedar as fontes** em `src/shared/styles/fonts/`, declaradas em
   `fonts.css` e importadas por `global.css`. Sem CDN: nenhuma dependência
   externa em runtime e nenhum dado de quem usa a página indo para terceiros.
2. **Converter para WOFF2** (de 570 KB em TTF para 149 KB), com
   `font-display: swap` para que o texto apareça imediatamente na fonte de
   reserva.
3. **Dois tokens**: `--font-display` (TheMix) e `--font-sans` (Archivo). O
   `global.css` aplica `--font-display` em `h1`–`h4`, então título já nasce
   correto sem ninguém lembrar.
4. **Declarar só os pesos que existem**. TheMix está disponível apenas em Bold
   (700), normal e itálico; Archivo em 400, 400 itálico, 700 e 900 itálico.
5. **Cobrir no contrato de estilo** (`e2e/styleguide.spec.ts`): o teste falha
   se o título deixar de renderizar em TheMix, o corpo em Archivo, ou se um
   arquivo de fonte não carregar.

## Alternativas consideradas

- **Google Fonts / CDN**: mais simples, mas adiciona dependência externa,
  expõe o IP de quem acessa e não serve para TheMix, que é comercial.
  Rejeitado.
- **Manter `system-ui`**: zero custo de download, mas nenhuma identidade.
  Rejeitado — é justamente o problema.
- **Fonte variável do Archivo**: um arquivo cobrindo todos os pesos e larguras
  (652 KB em TTF). Como usamos quatro estilos fixos, os estáticos saem menores.
  Vale revisitar se o projeto passar a precisar de muitos pesos.

## Consequências

- **Positivas:**
  - Projetos diferentes passam a ter a mesma tipografia.
  - A renderização fica muito mais parecida entre sistemas operacionais.
  - Sem requisição a terceiro para carregar fonte.
- **Negativas:**
  - 149 KB de fontes no bundle inicial de qualquer projeto (mitigado por
    WOFF2, cache do navegador e `swap`).
  - TheMix é comercial: publicar um projeto externo exige confirmar que a
    licença da empresa cobre webfont autohospedada. Archivo é OFL, com a
    licença versionada em `fonts/Archivo-OFL.txt`.
  - Um peso novo exige converter o arquivo e declarar o `@font-face`.
