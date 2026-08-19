# web-project-template

Template de projeto front-end em React + TypeScript + Vite, pensado para pessoas que constroem interfaces com a ajuda de agentes de código. Vem com organização de pastas, padrões de qualidade e instruções para agentes já prontos.

## Objetivo

Dar um ponto de partida seguro e organizado para criar aplicações web simples. Você descreve o que quer, o agente implementa seguindo as regras deste template, e você valida com um único comando.

## Quando usar

Indicado para:

- Ferramentas internas simples
- Dashboards leves
- Formulários
- Protótipos
- Páginas de consulta
- CRUD com dados locais (no navegador)
- Demonstrações

## Quando NÃO usar (versão 1)

- Aplicativos móveis ou desktop nativos
- Backends complexos
- Microsserviços
- Sistemas financeiros ou com dados sensíveis
- Autenticação real de usuários
- Infraestrutura de produção crítica
- Qualquer sistema de alta criticidade

## Pré-requisitos

- Node.js 22 (o arquivo `.nvmrc` já indica a versão; com `nvm`, rode `nvm use`)
- npm 10.6.0 (a versão exata declarada em `packageManager`)
- git
- Um agente de código (ex.: Claude Code)

## Criar um novo projeto a partir do template

1. Crie o repositório a partir deste template (botão "Use this template" no GitHub) ou copie a pasta.
2. Entre na pasta do projeto.
3. Rode a instalação e o setup:

```bash
npm install
npm run setup
```

O `npm run setup` separa o identificador técnico do nome exibido, personaliza descrição, organização, licença e repositório, pode remover somente a demonstração canônica `notes` sem tocar em outras features e sincroniza as skills dos agentes. Ele também reinicia o `tasks.md` para que o projeto novo não herde o backlog do template — use `--keep-tasks` se quiser preservá-lo. Antes de aplicar, use `npm run setup -- --name="meu-app" --dry-run`; execuções repetidas com os mesmos valores são idempotentes e uma falha restaura o estado anterior.

## Prompts Iniciais (Copie, Preencha e Cole no Agente)

Escolha o cenário que se encaixa no seu momento e cole no seu agente de IA.

**Cenário A — "Tenho uma ideia mas não sei o escopo"** _(fluxo completo)_

```text
Estou começando um projeto novo. Faça o seguinte:
1. Rode `npm install` e depois `npm run setup -- --name="[meu-app]" --display-name="[Meu App]" --description="[descreva aqui]" --remove-example`.
2. Depois, use a skill plan-app para conduzir uma entrevista curta comigo e definirmos juntos o escopo do produto.
3. Por fim, use a skill update-readme para reescrever este README descrevendo o projeto, não o template.
```

**Cenário B — "Já sei o que quero, planeje a feature"**

```text
O produto já está definido em docs/prd.md. Use a skill plan-feature para planejar a funcionalidade: [descreva a funcionalidade aqui]. Quero revisar o plano antes da implementação.
```

**Cenário C — "O plano foi aprovado, implemente"**

```text
O plano foi aprovado. Use a skill implement-feature para executar. Garanta que `npm run validate` passe limpo ao concluir e registre a evidência com a skill document-delivery.
```

## Instalação

```bash
npm install --global npm@10.6.0
npm install
```

## Execução

```bash
npm run dev
```

O Vite mostra no terminal o endereço local (algo como `http://localhost:5173`).

## Validação

Antes de considerar qualquer alteração pronta, rode:

```bash
npm run validate
```

Esse comando executa, em sequência: verificação das skills, arquitetura e documentação, formatação, lint, checagem de tipos, testes com limites de cobertura, bundle de produção e um smoke test HTTP do artefato. Se todos passarem, a alteração está saudável.

## Verificação automática

Além da validação local, o repositório traz portões automáticos:

| Onde                | O que roda                                               |
| ------------------- | -------------------------------------------------------- |
| `pre-commit`        | `lint-staged` (ESLint e Prettier nos arquivos alterados) |
| `commit-msg`        | Convenção da mensagem de commit                          |
| `pre-push`          | `typecheck` e `test:unit` (Vitest sem cobertura)         |
| CI (GitHub Actions) | `validate` em Node 22/24, auditoria e E2E no Chromium    |

O CI está em `.github/workflows/ci.yml`. Configure a branch principal para
exigir os checks **Validate** e **E2E (Chromium)** antes do merge. As
atualizações de dependência chegam por Dependabot (`.github/dependabot.yml`).

Se um hook falhar, corrija a causa antes de prosseguir. O CI repete os portões
completos e continua sendo a fonte da verdade para integração.

## Comandos

| Comando                                         | O que faz                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                                   | Sobe o servidor de desenvolvimento com recarga automática           |
| `npm run build`                                 | Gera a versão de produção                                           |
| `npm run lint`                                  | Verifica problemas de código com ESLint                             |
| `npm run check:architecture`                    | Impede imports que atravessam as fronteiras das features            |
| `npm run check:docs`                            | Valida links, comandos e referências da documentação                |
| `npm run check:toolchain`                       | Confere a versão do npm declarada pelo projeto                      |
| `npm run format`                                | Formata os arquivos com Prettier                                    |
| `npm run format:check`                          | Confere se os arquivos estão formatados                             |
| `npm run typecheck`                             | Verifica os tipos do TypeScript                                     |
| `npm run test`                                  | Roda testes de unidade, componente, arquitetura e setup             |
| `npm run test:unit`                             | Roda apenas os testes Vitest, sem cobertura                         |
| `npm run test:coverage`                         | Roda os testes Vitest aplicando os limites de cobertura             |
| `npm run test:setup`                            | Roda os testes black-box do setup e da arquitetura                  |
| `npm run test:e2e`                              | Executa o fluxo crítico no Chromium com Playwright                  |
| `npm run test:e2e:update`                       | Regera as imagens de referência do styleguide                       |
| `npm run test:watch`                            | Roda os testes em modo contínuo                                     |
| `npm run setup`                                 | Personaliza identificadores, apresentação e demonstração do projeto |
| `npm run update:template`                       | Aplica migrações locais conhecidas do template                      |
| `npm run generate:feature -- --name="clientes"` | Gera a estrutura inicial de uma feature                             |
| `npm run smoke:build`                           | Serve e verifica o conteúdo gerado em `dist/`                       |
| `npm run sync:skills`                           | Gera as cópias das skills em `.claude/skills` e `.agents/skills`    |
| `npm run check:skills`                          | Verifica se as cópias das skills estão sincronizadas                |
| `npm run check:styleguide`                      | Avisa sobre cor literal, token ausente ou ícone fora do padrão      |
| `npm run validate`                              | Roda skills, arquitetura, formato, lint, tipos, testes e bundle     |

## Estrutura resumida

```
src/
├── app/          # composição geral (providers, rotas, layout) — sem regra de negócio
├── features/     # cada capacidade do produto em sua pasta
│   ├── notes/    # demonstração canônica; removida por --remove-example
├── shared/       # reutilizável e neutro (config, hooks, lib, types)
├── test/         # setup.ts e render.tsx
└── main.tsx
docs/             # esta documentação
```

Detalhes em [docs/architecture.md](docs/architecture.md).

## Styleguide

O template consome `@vitru/styleguide`, pacote que concentra tokens, tema
`vitru`, Archivo, componentes e a referência visual. TheMix permanece local ao
projeto consumidor em `public/fonts`, sem ser redistribuída pelo pacote. Rode
`npm run dev` e abra `/styleguide` para ver a referência viva.

Essas regras continuam valendo depois do `npm run setup`. Leia
[docs/styleguide.md](docs/styleguide.md) antes de criar telas; `npm run check:styleguide`
avisa quando algo sai do padrão.

## Como usar agentes

As regras que os agentes devem seguir ficam em dois arquivos na raiz:

- `AGENTS.md` — regras gerais válidas para qualquer agente
- `CLAUDE.md` — instruções específicas para o Claude Code

Além disso, há skills que guiam tarefas comuns. Veja [docs/agents.md](docs/agents.md) para a lista e para exemplos de como acioná-las.

## Como criar uma feature

Se a ideia do aplicativo ainda não tem escopo fechado, comece com: "Use a skill plan-app para me ajudar a definir este produto". A skill conduz a conversa em linguagem simples, cria `docs/prd.md` após sua aprovação e registra as decisões em `docs/architecture.md`.

Depois que o produto estiver definido:

1. Peça ao agente um plano: "Use a skill plan-feature para planejar..."
2. Revise o plano.
3. Peça a implementação: "Use a skill implement-feature...".
4. Gere a base com `npm run generate:feature -- --name="minha-feature"`; use `--dry-run` para apenas listar os arquivos. O gerador cria `components` (com CSS Module já baseado nos tokens), `model`, `services`, `tests` e o `index.ts` público, mas não registra a feature na composição da aplicação.
5. Rode `npm run validate`.
6. Peça a evidência da entrega: "Use a skill document-delivery...". O resumo do que foi entregue, dos testes e das validações fica em [docs/entregas](docs/entregas/README.md).

Regras de arquitetura em [docs/architecture.md](docs/architecture.md); regras visuais em [docs/styleguide.md](docs/styleguide.md).

## Como registrar uma decisão

Decisões relevantes de arquitetura ou tecnologia viram um ADR (Architecture Decision Record) em `docs/decisions/`. Use o formato do primeiro registro, [0001-initial-architecture.md](docs/decisions/0001-initial-architecture.md), como modelo.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha os valores. Só variáveis com o prefixo `VITE_` chegam ao front-end, e **tudo que chega ao front-end é público** — nunca coloque segredos ali.

A leitura fica concentrada em [src/shared/config/env.ts](src/shared/config/env.ts): declare a variável em `ImportMetaEnv` (`src/vite-env.d.ts`) e, se ela for obrigatória, acrescente a chave em `REQUIRED_KEYS`. Assim uma configuração ausente ou malformada falha no boot, com mensagem dizendo qual variável corrigir, em vez de virar `undefined` em algum ponto distante do código.

## Limitações conhecidas

- Sem backend: os dados vivem no navegador ou vêm de APIs externas.
- Sem autenticação real nem armazenamento seguro de segredos — tudo no front-end é público.
- Sem gerenciador global de estado por padrão.
- Voltado a aplicações simples; não substitui projetos de alta criticidade.
