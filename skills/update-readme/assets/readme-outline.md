# nome-do-projeto

Uma frase dizendo o que é, para quem e com qual stack.

## Objetivo

O que o projeto resolve, em duas ou três frases. Sem marketing.

## Quando usar

Indicado para:

- Caso de uso 1
- Caso de uso 2

## Quando NÃO usar

- Cenário fora do escopo 1
- Cenário fora do escopo 2

## Pré-requisitos

- Node.js 22 (a versão está em `.nvmrc`; com `nvm`, rode `nvm use`)
- npm 10.6.0 (a versão exata declarada em `packageManager`)
- git

## Instalação

```bash
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

Uma frase dizendo o que esse comando executa, em sequência.

## Verificação automática

| Onde                | O que roda                              |
| ------------------- | --------------------------------------- |
| `pre-commit`        | `lint-staged` nos arquivos alterados    |
| `commit-msg`        | Convenção da mensagem de commit         |
| `pre-push`          | `typecheck` e `test:unit`               |
| CI (GitHub Actions) | `validate`, auditoria e E2E no Chromium |

## Comandos

| Comando            | O que faz                          |
| ------------------ | ---------------------------------- |
| `npm run dev`      | Sobe o servidor de desenvolvimento |
| `npm run build`    | Gera a versão de produção          |
| `npm run test`     | Roda a suíte de testes             |
| `npm run validate` | Roda todos os portões de qualidade |

## Estrutura resumida

```
src/
├── app/          # composição geral (providers, rotas, layout)
├── features/     # cada capacidade do produto em sua pasta
├── shared/       # reutilizável e neutro
└── main.tsx
docs/             # esta documentação
```

Detalhes em [docs/architecture.md](docs/architecture.md).

## Como usar agentes

As regras que os agentes devem seguir ficam em dois arquivos na raiz:

- `AGENTS.md` — regras gerais válidas para qualquer agente
- `CLAUDE.md` — instruções específicas para o Claude Code

Veja [docs/agents.md](docs/agents.md) para a lista de skills.

## Como criar uma feature

1. Peça ao agente um plano: "Use a skill plan-feature para planejar...".
2. Revise o plano.
3. Peça a implementação: "Use a skill implement-feature...".
4. Rode `npm run validate`.
5. Peça a evidência da entrega: "Use a skill document-delivery...".

## Como registrar uma decisão

Decisões relevantes viram um ADR em `docs/decisions/`.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha os valores. Diga o que é
público e onde a leitura fica concentrada.

## Limitações conhecidas

- Limitação real 1
- Limitação real 2
