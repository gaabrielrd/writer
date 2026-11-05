# Operações do Estúdio em abas

Em `/studio/operations`, os três grupos existentes foram separados nas abas
**Importações e restaurações**, **Campanhas** e **Exclusões**, usando `Tabs` do
kit compartilhado. A primeira abre por padrão, inclusive com parâmetro inválido.

A seleção usa `tab=imports|campaigns|deletions`, preserva os demais parâmetros
e acompanha recarga e histórico do navegador. Setas, Home e End navegam entre
abas. Os oito painéis continuam montados após a primeira visita para conservar
seus controles; apenas o painel selecionado fica visível e acessível por teclado.
Os diálogos e protocolos de retomada existentes foram preservados.

## Validação local

- Vitest: 29 testes do Estúdio aprovados, incluindo retomadas, URL inicial de
  campanhas, aba inválida e preservação dos painéis ao alternar.
- Chromium: 3 testes das abas aprovados, nos temas Claro, Escuro e Sépia.
  Cobertura de URL, parâmetros adicionais, voltar/avançar, recarga e teclado,
  sem transbordamento em 1440 × 1000 e 1100 × 720. Capturas conferidas.
- Chromium adicional no tema Escuro: 4 cenários aprovados de exclusão de
  aventuras e retomada/descarte de candidata de campanha, incluindo reload,
  pedido incerto e troca de conta, usando as abas correspondentes.
- `npm run typecheck`, `npm run check:styleguide`, ESLint dos arquivos alterados,
  `npm run check:docs`, `npm run check:architecture`, Prettier e
  `git diff --check` aprovados; detector de layout sem achados.

A documentação de primeiro acesso foi atualizada e o diff foi revisado.
As verificações de navegador usam dados fictícios e rede externa bloqueada;
os estados de erro de restauração vistos nessa prévia não comprovam falha no
backend local ou em produção.

Sem `npm run validate` integral, commit, push ou deploy. Alterações locais de
outros trabalhos, incluindo os componentes compartilhados, foram preservadas.
