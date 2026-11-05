# Resumo das orientações de persona

Na criação e edição de personas, o resumo usa a seção recolhível padrão do kit.
A direção de escrita fica separada dos atributos e conserva as quebras de linha.
Sem instruções, a interface informa a ausência explicitamente.

Os atributos aparecem em uma lista de definições com duas colunas no desktop,
nome, valor de 0 a 100, barra e significados dos extremos. As linhas usam
separadores discretos e nomes longos quebram linha. A adaptação existente para
janelas menores conserva uma coluna. O resumo acompanha valores e definições
do rascunho, incluindo os oito atributos personalizados, sem salvar ou gerar
orientações automaticamente.

## Evidência local

- Vitest: `PersonaManager.test.tsx` e `PersonaGenerationDialog.test.tsx`, 13 testes
  aprovados. Cobre 16 atributos, valores 0/50/100, definições alteradas, instruções
  com quebras de linha, ausência de instruções e recolhimento sem gravação.
- `npm run typecheck`, `npm run check:styleguide`, ESLint dos arquivos TS/TSX
  alterados, Prettier e `git diff --check` aprovados.
- Detector de layout sem achados nos componentes alterados.
- Chromium: 3 testes aprovados nos temas Claro, Escuro e Sépia, com dados
  fictícios e rede externa bloqueada. Capturas conferidas com instruções e
  atributo próprio de nome longo. Grade em duas colunas, teclado, valores 0/100,
  ação Salvar e ausência de transbordamento conferidos em janelas de desktop/laptop.
- `npm run check:docs` aprovado. A primeira rodada de navegador expirou ao
  carregar inicialmente `/settings/ai` no tema Escuro; a repetição passou nos
  três temas, mantendo o timeout padrão.

Documentação de personas atualizada e diff revisado. A borda preexistente de
`.instructions` pertence ao detalhe da persona e não foi alterada ou suprimida.
As alterações das entregas anteriores e de outros trabalhos foram preservadas.

Sem validação integral (`npm run validate`), commit, push ou implantação.
