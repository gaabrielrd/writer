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
5. execute testes direcionados durante ajustes e `npm run validate` ao fechar grandes blocos;
6. revise o diff final.

Durante o desenvolvimento, mantenha commits locais e ignore a CI remota.
Não faça push nem atualize PRs sem nova instrução do usuário; siga o registro
de evidências do `AGENTS.md`.

Não expanda o escopo, não adicione dependências, não exponha
segredos e não altere a arquitetura sem antes explicar a necessidade.

Em interface: use os tokens de `src/styles/globals.css` (nunca cor
literal), ícones de `lucide-react` e o kit de `@/shared/ui`. Use `Dropdown`
nos modos `select` e `action`, conforme `docs/dropdown.md`. O styleguide
continua valendo depois da inicialização do repositório.
