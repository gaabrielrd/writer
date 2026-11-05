# Personas: todos os atributos no painel lateral

O painel lateral da biblioteca em `/settings/ai` mostra todos os atributos da
persona selecionada, na ordem do perfil, incluindo até oito atributos próprios
além dos oito padrões. Cada linha mantém nome, barra e valor; nomes longos
quebram linha e valores de 0 a 100 permanecem explícitos. O painel reutiliza a
rolagem existente e mantém a ação **Abrir detalhes** acessível.

## Verificação local

- Vitest: `PersonaManager.test.tsx` e `ChapterPersonaDialog.test.tsx`, 7 testes
  aprovados. Inclui troca entre persona padrão e persona com 16 atributos,
  valores 0/50/100 e abertura dos detalhes completos.
- Playwright: cenário `painel lateral` em `personas.visual.ts`, 3 testes aprovados
  nos temas Claro, Escuro e Sépia, com dados fictícios e rede externa bloqueada.
  Capturas conferidas em 1440 × 1000 e 1100 × 620; último atributo e ação
  acessíveis, sem transbordamento horizontal.
- `npm run typecheck`, `npm run check:styleguide`, ESLint dos arquivos TS/TSX
  alterados, Prettier e `git diff --check` aprovados.
- Detector de layout Impeccable sem achados nos componentes alterados.

As primeiras tentativas de Vitest/typecheck encontraram `EPERM` do ambiente;
os mesmos comandos passaram após execução com permissões para subprocessos/cache.
A revisão do diff não identificou achados no escopo. A documentação de personas
foi atualizada. Alterações locais de outros trabalhos foram preservadas.

`npm run validate` integral não executado: ajuste local sem commit ou merge.
Sem commit, push ou implantação; os testes de navegador não validam uma conta
real nem o backend de produção.

## Achado fora do escopo

O hook final repetiu duas vezes o mesmo aviso `side-tab` sobre a borda esquerda
de 3 px de `.instructions` em `Personas.module.css`. A regra já existia antes
deste ajuste e pertence às instruções no modal, não à lista do painel lateral.
Foi mantida sem supressão; sua revisão visual fica separada desta entrega.
