# Integração das branches locais e acompanhamento da CI

## Autorização e escopo

Em 2026-11-06, o operador solicitou integrar as alterações locais na branch
principal, fazer commit e push, pular validações locais e acompanhar/corrigir a
CI. Confirmou explicitamente incluir também os rascunhos não commitados dos
outros worktrees.

O fetch confirmou `master` como principal e `origin/master` em `35c20d1`.
Todas as branches locais anteriores já estavam contidas nessa base, exceto o
commit `0b9c1af` de `codex/home-publica-impacto`.

O conjunto a integrar inclui:

- Homepage pública e Home autenticada, já registradas em `0b9c1af`.
- [Central de ajuda](2026-11-06-central-de-ajuda.md), pendente no checkout atual.
- Rascunho de produção literária, com 647 arquivos pendentes no worktree
  `codex/producao-literaria` (150 rastreados e 497 novos).
- Ajustes de tipografia, com 16 arquivos pendentes no worktree
  `codex/typography-legibility` (15 rastreados e um novo).

## Procedimento

O inventário e hashes anteriores foram preservados localmente em
`test-results/integration-2026-11-06/worktrees-before.json`. Cada rascunho recebe
um commit na sua branch antes da integração na principal. Resoluções de conflito
devem preservar as funcionalidades dos dois lados e os contratos vigentes.

Hooks são pulados somente nos comandos autorizados com `HUSKY=0`, sem mudar
`.husky` nem a configuração permanente do Git. Não executar testes, lint,
typecheck, formatação automática, build ou `npm run validate` localmente nesta
integração; a verificação técnica ocorre na CI remota.

## Estado da evidência

Este registro documenta o escopo e a autorização. Os commits finais, o push e o
resultado da CI devem ser conferidos nas referências remotas e no relatório
final desta integração. Registros anteriores de testes descrevem as respectivas
entregas e não comprovam validação deste conjunto integrado.

O pedido não autoriza implantação manual de Functions ou Firestore. Workflows
já configurados para responder ao push conservam seu comportamento existente.
