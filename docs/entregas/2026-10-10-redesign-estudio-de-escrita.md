# Redesign do estúdio de escrita — em revisão

## Objetivo e escopo

Atualizar a interface antes de novas funcionalidades, a partir da referência
visual solicitada: transparência, blur e superfícies arredondadas. O Writer usa
carvão quente, papel e bronze/âmbar, com tipografia editorial no manuscrito.

Implementados shell, apresentação, autenticação visual, biblioteca, obra,
compêndio e editor. Autenticação, créditos, serviços, regras de acesso e rotas
permanecem com o comportamento existente. Nenhuma dependência adicionada pelo
redesign. A atualização de dependências da base é independente desta proposta.

## Critérios de aceite

- [x] Três temas e preferência do sistema preservados com provider único.
- [x] Vidro com fallback e redução de transparência/movimento; texto opaco.
- [x] Foco visível e retorno ao acionador após fechar diálogo.
- [x] Capturas reais desktop/mobile rotuladas como dados fictícios.
- [x] Primeira proposta passou os gates padrão no CI.
- [ ] Revisão das capturas finais após polimento responsivo e atualização da base.
- [ ] Aprovação visual pelo usuário antes de merge ou deploy.

## Evidência verificada da primeira proposta

Commit `20a25dcba365e0cc4f6ce2a1abafe4e332582958`,
[CI 38062745662](https://github.com/gaabrielrd/writer/actions/runs/38062745662),
[PR em rascunho 16](https://github.com/gaabrielrd/writer/pull/16).

- `npm run validate`: passou em Node 22 e 24 com os limites normais.
- Vitest: **49 arquivos, 223 testes aprovados**.
- Cobertura: **91,35% instruções, 77,2% ramos, 90,35% funções, 93,16% linhas**.
- Testes de setup/contrato: **45 aprovados, zero falhas**.
- Build de produção e smoke: aprovados.
- Auditoria no limiar high: aprovada; auditoria local reportou 0 high/critical
  e 6 moderate preexistentes.
- E2E de produção: **5 aprovados, 1 pulado** por ausência prévia de baseline Linux.
- Prévia visual isolada: **30 testes aprovados**, desktop/mobile nos três temas,
  com 66 capturas revisáveis e dados fictícios claramente identificados.

A captura local do Chromium foi bloqueada por restrição de sockets. Os testes
locais de formulário excederam o timeout padrão de 5 s neste ambiente; a execução
diagnóstica dos três arquivos com 15 s aprovou todos os 7 testes. Nenhum timeout,
assertion ou limite de cobertura do repositório foi relaxado. O CI acima aprovou
os limites padrão.

## Revisão visual e polimento

As imagens reais identificaram oportunidades de melhoria: títulos longos tornavam
os cartões desproporcionais, o cabeçalho móvel ocupava espaço excessivo e chips
de lore quebravam em várias linhas. O polimento mantém títulos completos no DOM
(com descrição nativa no hover), equaliza cartões, evita crédito duplicado no
editor e mantém os chips numa faixa horizontal. A revisão do sépia também
identificou um filtro global acidental, causado pela classe de tema coincidir
com uma utility do Tailwind; os tokens agora são renderizados sem recoloração
de toda a página, com regressão coberta no E2E.

A suíte complementar inclui biblioteca vazia, falha simulada com retry,
preferência por menos transparência e largura de 320 px. Os fixtures são
resolvidos exclusivamente por `vite.visual.config.ts`, que recusa build de
produção. Firebase, chamadas de IA e SDK externo são inertes; CSP e bloqueio de
rede impedem comunicação com serviços reais durante as capturas.

## Arquivos e decisões

- Tokens: `src/styles/globals.css` e [styleguide](../styleguide.md).
- Shell: `src/app/App.tsx` e estilos.
- Componentes e estilos das jornadas em `src/features` e kit `src/shared/ui`.
- Testes visuais e instruções: `e2e/visual/README.md`.
- Plano: [redesign](../tasks/08-redesign-estudio-de-escrita.md).

## Limites e verificação manual

O PR permanece em rascunho. Não houve integração nem deploy. As capturas usam
conteúdo de teste, não a biblioteca real de qualquer pessoa. A camada visual
foi validada no Chromium; Safari e Firefox não foram executados. O baseline
macOS anterior representa o layout substituído e deve ser regenerado no macOS.
Uma referência Linux é capturada no CI quando ainda inexistente, para inspeção
e commit explícitos; baselines existentes nunca são atualizados automaticamente.

Para revisar: abrir os artefatos `writer-visual-preview`, comparar os três temas,
percorrer biblioteca → obra → editor, abrir/fechar modais pelo teclado, testar
textos longos, 320 px, preferência de transparência reduzida e histórico do navegador.

## Ajuste de cor solicitado após a primeira prévia

A direção visual foi aprovada, com pedido de trocar o âmbar por caramelo/café.
O tema escuro passa a usar caramelo tostado com texto café; os temas claro e
sépia usam café mais profundo com texto claro. Hover recebe token próprio,
sem baixar a opacidade do texto. O E2E verifica contraste mínimo de 4,5:1 na
ação primária normal e em hover nos três temas. Layout e comportamento aprovados
permanecem iguais; novas capturas e CI confirmam o ajuste antes de integração.

O polimento anterior e a base `5d810719f99bedcf8407f6e8cd370c8a2650f5cb`
aprovaram os quatro jobs do [CI 38063400397](https://github.com/gaabrielrd/writer/actions/runs/38063400397).
