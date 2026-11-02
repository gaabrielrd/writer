# Consolidação Writer V2 e Node 24

- **Data**: 2026-11-02
- **Branch de origem**: codex/writer-v2
- **Plano de origem**: [consolidação da release](../tasks/consolidacao-release-writer-v2.md)

## Objetivo

Consolidar os históricos de Writer V2 e master, incorporar os PRs de dependências
e preparar a publicação coordenada dos serviços e do frontend.

## Funcionalidades entregues

- Integração do Estúdio, edição, aventuras, campanhas, operações duráveis,
  backup/restauração e importação revisada de lore presentes nos 307 commits de V2.
- Desenvolvimento e CI em Node 24.12+, com Functions de segunda geração em Node 24.
- Firebase 13/Rules Testing 6 e Vitest/cobertura 5.1 atualizados em conjunto.
- Limpeza de chats após exclusão da conta com trigger Auth de segunda geração,
  retry idempotente e isolamento de tenants.
- Testes de regras distribuídos em oito partes disjuntas na CI; encerramento
  da árvore de processos do emulador no Windows.
- Regras de execução dirigida, diagnóstico de quota e ordem de publicação no AGENTS.md.

## Critérios de aceite da consolidação local

- [x] Históricos e regra de testes da master preservados.
- [x] Atualizações dos PRs 24, 25, 26, 27, 29 e 30 incorporadas na árvore consolidada.
- [x] Validação completa local aprovada, sem reduzir cobertura ou segurança.
- [x] Correções de testes repetidas somente nos casos afetados.
- [x] Configuração de índices aceita em produção, com 66 compostos READY.

## Arquivos alterados

A consolidação reúne 2.974 arquivos do histórico e da manutenção, antes deste
registro. A manutenção afeta manifests/lockfiles, workflows, configuração de
Vitest, runner de Rules, seletores/fixtures visuais, trigger de conta e documentação.
Ver [ADR 0269](../decisions/0269-node24-and-function-runtime.md) para decisões,
compatibilidade e pendências transitivas.

## Testes e validações executadas

A execução de fechamento de npm run validate terminou com exit 0:

```text
Test Files  380 passed (380)
Tests  5145 passed (5145)
All files | 89.54 | 85.86 | 90.52 | 92.67 |
Scripts: tests 104, pass 104, fail 0
Functions: tests 4902, pass 4902, fail 0
Functions syntax checked: 490 modules
Smoke test do bundle OK.
```

Arquitetura, documentação, styleguide, formatação, lint, tipos e build passaram.
E2E Chromium: sete casos aprovados. Storage: dez casos aprovados. A correção
na adoção de lore passou no caso dirigido do emulador, preservando recusas de
SDK direto e de consentimento revogado.

O lote dirigido de outros cinco projetos visuais terminou com 166 aprovações,
oito skips e seis falhas móveis. As seis falhas foram corrigidas e repetidas
isoladamente nos três temas móveis: seis aprovações. Casos alterados do projeto
desktop-dark também passaram em execuções dirigidas anteriores.

## Publicação e verificação

Registro no fechamento local: regras publicadas e 66 índices READY; 25 Functions
existentes atualizadas para Node 24. O novo cleanupDeletedAccountChatV2 foi
confirmado ACTIVE, com evento Auth v2/retry, antes da retirada do trigger antigo.
As novas Functions seguem em lotes de 12 devido à quota regional de CPU; o Hosting
aguarda o backend. Storage coincide com a versão remota e não requer atualização.

O estado posterior de CI, integração e publicação é consolidado no
[PR 21](https://github.com/gaabrielrd/writer/pull/21). O marcador público
https://writer-44cd5.web.app/writer-release.txt identifica o SHA do frontend
quando publicado. O plano registra as etapas e a ordem de implantação.

## Limitações e pendências conhecidas

- O resultado local não substitui o aceite da CI no PR.
- A execução local global de Rules atingiu 30 minutos; o caso de falha real foi
  corrigido e aprovado isoladamente. A cobertura global remota usa as oito partes.
- A suíte visual global foi interrompida; a repetição local usa casos afetados.
- Restam advisories moderados upstream de minimatch/glob: 13 ocorrências na raiz
  e seis em Functions, sem vulnerabilidades altas/críticas. Não forçar uma API
  incompatível nem remover o lint de acessibilidade para zerar a auditoria.
- Testes com fixtures não constituem aceite humano/comercial nem piloto real.

## Como verificar manualmente

1. Conferir CI e integração no PR 21 e comparar o marcador de release com master.
2. Abrir o Estúdio, projetos, importações e operações nos três temas e em 320px.
3. Conferir Functions ACTIVE/nodejs24, índices READY e a release das regras.
4. Não excluir contas reais nem alterar saldos para validar o trigger ou a cobrança.

## Ajuste do hook solicitado durante o rollout

O pre-push anterior também terminou com 380 arquivos e 5.145 testes aprovados
em 598,84 segundos e publicou 53e5985 na branch V2. Por nova orientação, o hook
passa a reutilizar uma validação completa local do frontend com assinatura
idêntica, HEAD atual e entradas limpas. npm run test:coverage gera o registro
automaticamente, mantendo cobertura e relatórios; o typecheck e a CI permanecem.
Mudanças relevantes, falhas e alterações durante os testes invalidam o registro.
O fallback por destino remoto foi preservado.

Este ajuste usa testes direcionados do registro, runner de push e contrato da CI;
não exige repetir os testes de produto que acabaram de passar e cujo código
permanece idêntico. O primeiro registro é inicializado a partir dessa validação
real, após conferir o diff dos arquivos testados.

Resultado do ajuste: 24 testes direcionados aprovados; lint dos cinco scripts
e validação da documentação aprovados. A suíte completa anterior permanece
como evidência do código de produto inalterado.
