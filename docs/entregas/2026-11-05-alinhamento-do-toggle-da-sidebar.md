# Alinhamento do toggle da sidebar

O deslocamento vertical de 4 px estava aplicado somente à marca Writer,
deixando o botão de recolher acima dela. O deslocamento passou para o cabeçalho
completo: marca e toggle compartilham o alinhamento, preservando a posição da
marca em relação à barra contextual e o fluxo da navegação.

O cenário visual existente agora confere os centros verticais com a sidebar
aberta e os centros horizontais com ela recolhida, com tolerância de 1 px.

Verificações:

- Três jornadas Chromium passaram: Claro, Escuro e Sépia, com componentes reais
  e serviços fictícios locais. Incluem alinhamento, recolher/expandir e foco.
- Capturas da sidebar aberta e recolhida inspecionadas visualmente.
- ESLint do cenário, Prettier, styleguide/anatomia de página e
  `git diff --check`: passaram.

Sem `npm run validate`, commit ou deploy. Alterações paralelas preservadas.
