# Sidebar recolhida e painel principal

Recolher a navegação no desktop mantém uma faixa de 64 px com ícones e
tooltips à direita, incluindo o símbolo do Writer e a conta no rodapé.
Expandir restaura os 240 px. Os destaques do perfil Livros, Aventuras e Campanhas
usam ícones Lucide nos dois estados, e os rótulos mantêm nomes acessíveis.

A área principal tem recuo de 8 px no topo, à direita e embaixo, borda do tema
e cantos discretos. O símbolo do Writer acompanha o centro da barra principal,
com o ajuste de posição solicitado. A transição curta usa o token existente;
os rótulos não quebram linha durante a expansão. Movimento reduzido usa a regra
global de duração quase nula. O modo expandido do editor conserva a área integral;
a gaveta de navegação das janelas estreitas foi preservada.

## Evidência local

- Vitest: 32 testes de `AuthenticatedWorkspace`, `StudioNavigation` e `AuthButton`
  aprovados. Cobre foco, navegação recolhida, tooltip, ícones dos três interesses,
  menu da conta e bloqueios durante operação pendente do editor.
- Chromium: os 3 cenários do editor nos temas Claro, Escuro e Sépia aprovaram
  ganho de espaço, preservação do manuscrito, entrada/saída do modo expandido
  e ausência de transbordamento.
- Chromium: 3 cenários de navegação aprovados nos mesmos temas. Conferem
  faixa de 64 px, tooltips, logo, menu da conta, foco, atalhos, recuo/raio,
  alinhamento vertical e transição com rótulos em uma única linha em cada frame
  amostrado, além da duração quase nula com movimento reduzido. Capturas conferidas.
- `npm run typecheck`, `npm run check:styleguide` e `npm run check:architecture`
  aprovados; detector de layout sem achados nos componentes alterados.
- ESLint dos arquivos TS/TSX alterados, Prettier, `npm run check:docs` e
  `git diff --check` aprovados.

O diff foi revisado e a documentação de primeiro acesso/styleguide foi atualizada.
A regra anterior de cantos retos das abas no shell foi preservada, junto das
alterações de outros trabalhos. As verificações usam dados fictícios e rede
externa bloqueada; não constituem validação de sessão ou backend de produção.

Sem `npm run validate` integral, commit, push ou deploy.
