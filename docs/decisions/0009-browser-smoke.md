# 0009 - Smoke E2E separado no Chromium

- **Status**: Aceito
- **Data**: 2026-08-08

## Contexto

Os testes de componente usam jsdom e o smoke do build faz requisições HTTP aos
assets. Nenhum deles confirma que o bundle inicializa e executa o fluxo principal
em um navegador real.

## Decisão

- Adicionar `@playwright/test` como dependência de desenvolvimento.
- Cobrir somente Chromium e um fluxo crítico nesta primeira versão.
- Escolher uma porta efêmera e não depender de rede externa.
- Executar `test:e2e` em um job separado do CI, sem incluí-lo em
  `npm run validate`.
- Guardar trace e screenshot somente quando houver falha.

## Consequências

O CI passa a detectar falhas de inicialização, roteamento e interação que jsdom
não reproduz. Em troca, o job baixa o Chromium e fica mais lento e pesado. A
separação mantém o ciclo local padrão rápido e torna a instalação do navegador
uma escolha explícita.
