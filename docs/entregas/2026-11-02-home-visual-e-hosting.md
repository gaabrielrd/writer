# Home visual e densidade do Estúdio

## Resultado

Home com destaque editorial e criação assistida, retomadas compactas em grade,
identidade gráfica por tipo e atalhos em linhas. Datas, títulos, reautorização e
destinos da retomada permanecem reais. A arte dos cartões é decorativa, sem nova
consulta de capa nem alteração do contrato metadata de retomada.

Projetos conserva a lista, com capas reais mais presentes. Importação e operações
mantêm ações e recuperação, com espaçamentos e tipografia mais discretos. Os
badges compartilhados passam a ocupar a largura intrínseca, e o shell reduz
descrições e botões de cabeçalho em ponteiros precisos. Toque mantém áreas maiores.

## Arquivos

- `src/features/studio/components/StudioPage.tsx` e CSS Module.
- `src/features/work-progress/components/ContinueWorkPanel.tsx` e `WorkProgress.module.css`.
- `src/shared/ui/variants.ts` e `src/app/components/AuthenticatedWorkspace.module.css`.
- `e2e/visual/studio-home.visual.ts` e `docs/styleguide.md`.

## Validação e revisão

- 39 testes de Home/retomada passaram.
- 13 testes de componentes compartilhados passaram.
- Chromium desktop/mobile escuro: dois cenários passaram, conferindo altura dos
  cartões, reautorização/retomada, teclado na criação assistida, Projetos,
  importação e operações sem transbordamento.
- Capturas desktop/mobile da Home inspecionadas visualmente.
- Rodada final: seis cenários Chromium passaram, desktop/mobile nos temas
  claro, escuro e sépia, cobrindo também Projetos, importação e operações.
- TypeScript, ESLint direcionado e styleguide passaram.
- Build de produção e smoke do bundle passaram.
- Arquitetura, documentação, Prettier e `git diff --check` passaram.
- Sem novas dependências, serviços ou alterações de dados.

## Publicação

Destino confirmado por CLI: site `writer-44cd5`, projeto `writer-44cd5`.
Os 16 setores e dois chats usados pelo frontend foram conferidos ACTIVE em Node 24.
Publicação autorizada somente de Hosting; Functions, Rules e índices não são
superfícies desta entrega.

Hosting publicado com sucesso em **https://writer-44cd5.web.app**, usando a
configuração congelada em `.firebase/hosting-home-20261102-visual/firebase.json`.
Os 16 arquivos servidos conferem integralmente com o inventário SHA-256 local;
seis rotas SPA retornaram HTTP 200 com o mesmo HTML. O Chromium anônimo aguardou
o fim da sessão e carregou a landing page, sem erros de execução.

SHA-256 de `index.html`:
`45ac2b07a4ee734437e3552d13c20a9851baeccfaddd5e62e21b122e5d8edcb7`.
Provas locais: `manifest.json`, `verification.json` e `live-anonymous.png` no
diretório congelado. CSS servido: `assets/index-DjAnO83Y.css`; entrada JavaScript:
`assets/index-saNTtm0x.js`. A CLI confirmou a versão finalizada e a publicação.

O checkout contém mudanças anteriores, incluindo layout do editor e criação
assistida desta conversa e o transporte por setor. Este último foi conferido
contra os endpoints ativos antes de preparar o frontend.
No momento da publicação não houve commit ou push; a entrega usou testes
direcionados e build de produção. No fechamento Git posterior, o mantenedor
dispensou `npm run validate`. A tentativa já iniciada foi interrompida durante
a checagem de formatação, antes de lint/testes/build; não constitui validação integral.
