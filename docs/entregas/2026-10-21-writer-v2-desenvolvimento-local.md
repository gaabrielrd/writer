# Desenvolvimento com commits locais

Em 2026-10-21, o operador determinou ignorar a CI durante o desenvolvimento e
manter as alterações em commits locais. A orientação foi registrada em
`AGENTS.md`, `CLAUDE.md`, no [processo](../development-process.md) e no
[guia de testes](../testing.md).

Não acompanhar, disparar ou repetir workflows, fazer push ou atualizar PRs durante
esta etapa. Preservar testes direcionados após ajustes e `npm run validate` no
fechamento de grandes blocos. Os portões remotos se aplicam quando o usuário
solicitar o envio; validação local não comprova aprovação da CI.

Verificação desta atualização documental: `npm run check:docs`, Prettier nos
cinco arquivos alterados e `git diff --check`. Nenhuma mudança de comportamento da
aplicação; suíte de testes e CI não executadas para esta atualização.
