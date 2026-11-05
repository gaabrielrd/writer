# Criação: gênero ou estilo, largura e aviso de retomada

## Entregue

- Gênero ou estilo usa o dropdown compartilhado com onze sugestões, "Definir
  depois" e "Criar meu estilo". O campo próprio preserva o limite de 120
  caracteres e os valores de propostas e rascunhos, inclusive ao apagar o texto.
- A escolha continua no mesmo campo `proposal.genre`, nos fluxos manual e com IA
  para Livro, Aventura e Campanha. Definir depois preserva o fallback `Livre`.
- A página fixa localmente `--workspace-content-max: 760px`, impedindo que o layout
  autenticado estique seus formulários e a conversa. Outras telas mantêm a largura.
- O aviso de criação em andamento tem ícone Lucide de histórico, padding de 16 px,
  espaçamento e quebra de linha entre a mensagem e o botão de retomada.
- A edição pelo assistente continua disponível no campo de estilo próprio; o
  cenário visual foi atualizado para selecionar essa opção antes de pedir edição.

Sem dependências novas, mudanças em Functions, persistência ou cobrança.

## Verificações

- `npx vitest run src/features/project-creation/tests/NewProjectPage.test.tsx
--configLoader native`: 17 testes passaram, incluindo os três tipos de projeto,
  envio da sugestão, salvamento próprio, retorno à opção livre e retomada.
- `npx tsc -b`: passou. A primeira tentativa restrita falhou ao gravar caches;
  a repetição com acesso aos caches terminou com código zero.
- ESLint dirigido, Prettier, `check:architecture`, `check:styleguide` (incluindo
  anatomia de página), `check:docs` e `git diff --check`: passaram.
- Prévia em Chromium com rotas/componentes reais e serviços fictícios locais;
  seis jornadas dirigidas passaram: formulário/retomada e edição do estilo pelo
  assistente nos temas Claro, Escuro e Sépia. Capturas do formulário e aviso
  inspecionadas visualmente.

## Limites

A matriz ampliada das jornadas foi interrompida após identificar falhas em
cenários do assistente fora dos controles alterados: na criação manual, o painel
chega `expanded` em vez de `minimized`; no caminho até a primeira escrita, o teste
expirou aguardando "Expandir conversa". Esses achados foram mantidos separados,
sem alterar o assistente nem enfraquecer as asserções existentes.

Commit local autorizado pelo operador, dispensando `npm run validate`.
Sem push ou deploy. As alterações
preexistentes em outras funcionalidades foram preservadas.

## Verificação manual

Em `/studio/new`, avançar pelo fluxo manual, abrir Premissa e detalhes, escolher
uma sugestão e depois Criar meu estilo. Escrever, salvar o rascunho, voltar à rota
e retomar. Conferir o texto, o aviso com ícone/espaçamento e a coluna de até 760 px.
