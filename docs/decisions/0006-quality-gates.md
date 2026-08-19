# ADR 0006 — Portões de qualidade automatizados

## Contexto

O [ADR 0003](0003-local-reliability-tooling.md) deixou CI/CD fora do escopo e apostou apenas na execução local de `npm run validate`. Na prática isso deixou lacunas:

- Nada obrigava a rodar `validate` antes de integrar; um Pull Request podia ser mesclado quebrado.
- Os limites de cobertura existiam em `vitest.config.ts`, mas `test:unit` rodava sem `--coverage`, então nunca eram aplicados.
- `eslint.config.js` restringia as regras a `**/*.{ts,tsx}`, deixando os scripts de `scripts/` — a ferramenta que personaliza cada projeto novo — sem lint algum.
- Nenhuma verificação de vulnerabilidades nas dependências.
- A convenção de mensagem de commit estava documentada, mas não era verificada.
- `.claude/skills` e `.agents/skills` são ignorados pelo Git e só existiam após `npm run sync:skills` manual, então `validate` falhava em um clone limpo.

## Decisão

Adotar CI e fechar cada lacuna acima, sem abrir mão da execução local:

1. **CI no GitHub Actions** (`.github/workflows/ci.yml`): `npm ci` e `npm run validate` em Node 22 e 24, mais um job separado de `npm audit --audit-level=high`.
2. **`npm audit` só no CI.** Uma falha ali indica vulnerabilidade publicada, não erro de código; manter fora do `validate` evita travar o trabalho local por indisponibilidade do registry.
3. **Cobertura aplicada de fato**: `npm run test` passa a chamar `test:coverage`, e os limites subiram para 85% de linhas e instruções, 75% de ramos e 90% de funções.
4. **Lint dos scripts do repositório**: bloco dedicado para `scripts/**/*.mjs` e para os arquivos de configuração da raiz.
5. **Hooks completos**: `pre-commit` (lint-staged), `commit-msg` (convenção
   verificada por `scripts/check-commit-message.mjs`, sem dependência nova) e
   `pre-push` (`typecheck` e `test:unit`, sem cobertura; o gate completo fica no
   CI).
6. **Reprodutibilidade**: `prepare` passa a rodar `sync:skills`, então `npm ci` deixa o clone pronto para `validate`.
7. **`engine-strict=true`** em `.npmrc`, tornando `engines.node` uma exigência real.
8. **Dependabot** semanal para npm e mensal para as actions, com atualizações de patch/minor agrupadas.

## Consequências

- **Positivas:** o estado verde passa a ser verificável por terceiros e não depende de disciplina individual. Regressões de cobertura, vulnerabilidades e quebras em Node 24 aparecem no Pull Request.
- **Negativas:** o ciclo de commit e push fica mais lento, e o projeto passa a depender do GitHub Actions. Quem usa outra forja precisa portar o workflow — o `validate` continua sendo o comando único que descreve tudo que o CI faz.
- Este ADR substitui a frase "CI/CD permanece fora do escopo" do ADR 0003.
- Falhas de hook devem ser corrigidas; a documentação pública não recomenda
  contornar as verificações.
