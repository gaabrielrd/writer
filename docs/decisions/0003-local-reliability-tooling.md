# ADR 0003 — Confiabilidade local do template

## Contexto

O template precisa detectar problemas antes da entrega sem depender de CI/CD e sem adicionar dependências de runtime.

## Decisão

- Tornar o setup idempotente, verificável por dry-run e protegido por rollback.
- Versionar a persistência de exemplo, migrar o formato legado e usar revisão otimista.
- Analisar fronteiras de imports com a AST do TypeScript.
- Validar links e comandos documentados dentro de `validate`.
- Fornecer um gerador mínimo de feature e um smoke test HTTP do bundle.

## Consequências

O fluxo local leva um pouco mais de tempo, mas cobre o template como produto: personalização, arquitetura, documentação, dados e artefato final.

> **Atualização:** a decisão de manter CI/CD fora do escopo foi substituída pelo [ADR 0006](0006-quality-gates.md). O `validate` continua sendo o comando único de verificação; o CI passou a executá-lo.
