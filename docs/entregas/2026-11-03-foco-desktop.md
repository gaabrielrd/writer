# Foco inicial em desktop — 2026-11-03

## Entrega

Suporte inicial e critérios de aceite passam a desktop/laptop, inclusive para
leitura pública. README, PRD, processo, styleguide, testes e contratos centrais
do Writer V2 apontam para a [direção de suporte](../platform-support.md) e a
[ADR 0274](../decisions/0274-desktop-initial-support.md). Requisitos mobile antigos
são substituídos para novos aceites; relatos de validações anteriores ficam intactos.

`playwright.visual.config.ts` mantém somente desktop nos três temas por padrão.
CI e deploy já usam essa configuração. A variável `WRITER_VISUAL_MOBILE=1` recupera
explicitamente a matriz anterior. Nenhum arquivo/caso de teste foi removido.

## Verificação executada

- Descoberta Playwright por `--list --reporter=json`: três projetos desktop e
  765 casos selecionados no padrão; seis projetos e 1.530 casos com a opção mobile.
  A descoberta lista os casos como skipped; não executa o navegador.
- `npm run check:docs`: positivo.
- Prettier nos arquivos alterados: positivo.
- `git diff --check`: positivo.
- Revisão do diff restrito ao escopo: sem alteração de código de produto,
  dependências ou arquivos de teste; alterações preexistentes preservadas.

A tentativa inicial de Prettier encontrou EPERM ao gravar a configuração; a
formatação foi aplicada por patch e conferida pelo comando de check.

## Limites

Etapas de 320 px embutidas em casos funcionais compartilhados continuam ativas.
A mudança remove a matriz de emulação mobile padrão, sem suprimir esses fluxos.
Não há nova prova de navegador real, merge, push, CI ou deploy nesta entrega.

## Preparação do commit — 2026-11-03

`npm run validate` foi executado antes do commit: skills, arquitetura,
documentação, styleguide, formatação e lint completo passaram. A etapa de
cobertura não iniciou no sandbox porque o subprocesso Git recebeu EPERM.
A retomada fora do sandbox encontrou outra execução Vitest usando `coverage`;
foi usada a pasta isolada `.firebase/local-validation/desktop-support-coverage`,
com os mesmos testes, instrumentação e limites.

Essa execução reportou 15 falhas em `BookLoreManualEditor.test.tsx` e 11 em
`BookLoreCreationEditor.test.tsx`, arquivos fora do diff desta entrega. Não foi
determinada a causa nem comprovado se já falhavam no HEAD. A execução foi
interrompida após essas falhas, sem corrigir código de outro escopo. Também
houve avisos de act em testes de campanhas que passaram.

O validate integral não está verde. Testes de setup/Functions, cobertura final
e build não foram alcançados. O commit contém somente os 12 arquivos desta
entrega, incluindo apenas o trecho de plataforma no styleguide; alterações
paralelas permanecem fora dele.
