# Capa gerada na criação manual de livro

## Entregue

- A seção Capa opcional também oferece Gerar capa no fluxo manual de livros.
- Campos opcionais vazios recebem os mesmos valores de confirmação (`Livre` e
  título como premissa) antes de gerar, mantendo o contexto da capa coerente.
- O total final inclui somente a capa gerada selecionada. Texto manual continua
  gratuito; escolher Sem capa ou a biblioteca retira esse custo.
- O servidor permite somente a ação de capa de livro no modo manual, além de
  salvar rascunho. Geração de texto permanece bloqueada nesse modo.
- Capas manuais consomem a cota de IA existente. Não exigem proposta textual
  gerada; preservam autorização, revisão, validade/contexto da capa, vínculo na
  biblioteca, recibos e débito atômico somente na confirmação final.

## Verificações

- Serviço: 40 testes passaram com
  `node --test --test-isolation=none functions/test/assistedBook.test.mjs`.
  Incluem cobrança de 5 créditos sem pacote textual, geração/replay únicos,
  confirmação idempotente, quota, tipos sem capa, contexto alterado, expiração,
  saldo insuficiente e descarte sem cobrança.
- Tela: 19 testes passaram com
  `npx vitest run src/features/project-creation/tests/NewProjectPage.test.tsx --configLoader native`.
  Incluem envio da proposta completa, prévia sem confirmação, total da capa e
  remoção do custo ao escolher Sem capa.
- Chromium: três jornadas passaram (Claro, Escuro e Sépia), com componentes e
  rotas reais e geração fictícia local. Prévia, custo e opção Sem capa foram
  conferidos; captura do tema escuro inspecionada visualmente.
- ESLint dirigido, Prettier, sintaxe da Function, arquitetura, styleguide,
  anatomia de página, documentação e `git diff --check`: passaram.
- `npx tsc -b`: passou após corrigir uma opção inválida do helper no novo teste.

## Limites de publicação

Commit local autorizado pelo operador, dispensando `npm run validate`.
Sem push, deploy de Hosting ou deploy de Functions.
A produção precisa receber tanto o cliente quanto as Functions atualizadas para
disponibilizar a opção. `npm run validate` não executado.
