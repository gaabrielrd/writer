# 0008 - Versionamento e migrações locais do template

- **Status**: Aceito
- **Data**: 2026-08-08

## Contexto

O fluxo anterior sugeria mesclar o remote do template com históricos não
relacionados. À medida que um projeto derivado evolui, essa operação acumula
conflitos e não informa quais transformações são necessárias nem se foram
aplicadas.

## Decisão

- Registrar `templateVersion` em `.template-state.json`.
- Manter migrações locais, sequenciais e explícitas em
  `scripts/update-template.mjs`.
- Oferecer `--dry-run`, idempotência, detecção de caminhos incompletos e rollback
  transacional.
- Compartilhar a infraestrutura de rollback entre setup e atualizador.
- Não baixar arquivos, executar merges ou resolver conflitos automaticamente.

## Consequências

Projetos conseguem identificar sua versão de origem e aplicar apenas caminhos
conhecidos. A evolução exige que cada mudança incompatível acrescente uma
migração e seus testes. A obtenção dos novos arquivos do template continua sendo
uma ação explícita e revisável de Git.
