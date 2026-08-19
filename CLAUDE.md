# Contexto do projeto para o Claude Code

Leia e siga o `AGENTS.md`.

Depois leia, quando relevante:

1. `docs/architecture.md`
2. `docs/development-process.md`
3. `docs/testing.md`
4. `docs/styleguide.md` (obrigatório antes de mexer em interface)
5. os arquivos relevantes em `docs/decisions`

As skills do projeto estão disponíveis em `.claude/skills`.

Para trabalho com vários arquivos ou ambíguo:

1. inspecione os módulos relevantes;
2. use a skill de planejamento (plan-feature);
3. apresente o plano;
4. implemente um incremento por vez;
5. execute `npm run validate`;
6. revise o diff final.

Não expanda o escopo, não adicione dependências, não exponha
segredos e não altere a arquitetura sem antes explicar a necessidade.

Em interface: use os tokens de `@vitru/styleguide/tokens.css` (nunca cor
literal), ícones de `lucide-react` e o kit de `@vitru/styleguide`. O
styleguide continua valendo depois da inicialização do repositório.
