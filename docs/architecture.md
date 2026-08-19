# Arquitetura

Este documento descreve como o código do `web-project-template` é organizado e as regras que mantêm o projeto simples e sustentável.

## Princípios

- Organização por funcionalidades (features), não por camadas técnicas.
- Cada parte tem uma responsabilidade clara.
- Simplicidade primeiro: só adicione abstração quando houver necessidade real.
- Regra de negócio fica nas features; a base (`app` e `shared`) permanece neutra.

## Documentos de produto e arquitetura

Ao iniciar um aplicativo a partir do template, use a skill `plan-app` para conduzir a descoberta antes de implementar. Ela cria `docs/prd.md` com o problema, os usuários, o escopo, o não escopo, os requisitos e os critérios de aceite aprovados.

Este arquivo continua sendo a fonte das decisões técnicas. A `plan-app` deve preservar as regras do template e acrescentar uma seção `Decisões do produto` com o limite do sistema, o mapa de features, o fluxo de dados, a persistência, as integrações e os trade-offs definidos para o aplicativo. O PRD explica **o que e por que** construir; a arquitetura explica **como o sistema será organizado**.

## Árvore de pastas

```
src/
├── app/          # composição geral: providers, rotas, layout — sem regra de negócio
│   ├── components/  # telas de erro e não encontrado usadas pelas rotas
│   ├── routes/      # definição das rotas e o router
│   └── tests/       # smoke test da composição
├── features/     # cada capacidade do produto em sua própria pasta
│   └── notes/    # demonstração canônica; removida por --remove-example
├── shared/       # reutilizável e neutro: config, hooks, lib, types
├── test/         # setup.ts e render.tsx (utilidades de teste)
└── main.tsx      # ponto de entrada da aplicação
```

Uma feature típica:

```
features/minha-feature/
├── components/   # componentes de tela desta feature
├── model/        # tipos e lógica de negócio
├── services/     # acesso a APIs e persistência
├── tests/        # testes desta feature
└── index.ts      # interface pública da feature
```

## Responsabilidades

- **app/**: monta a aplicação. Providers, rotas e layout. Não contém regra de negócio.
- **features/**: cada capacidade do produto (ex.: "cadastro de clientes"). Reúne tudo que aquela funcionalidade precisa.
- **shared/**: peças reutilizáveis e neutras (botões, hooks genéricos, utilitários, estilos, tipos). Não conhece nenhuma feature específica.
- **test/**: configuração e utilitários compartilhados de teste.

## Regras de dependência

1. Cada funcionalidade tem sua própria pasta em `features/`.
2. Uma feature não importa arquivos internos de outra feature.
3. Uma feature expõe sua interface pública pelo `index.ts`.
4. Chamadas HTTP ficam em serviços/clientes, não nos componentes.
5. Acesso a `localStorage` fica em adaptadores/repositórios.
6. Componentes de apresentação não conhecem detalhes de persistência.
7. `shared` é neutro: não depende de nenhuma feature.
8. Não crie abstrações sem necessidade concreta.
9. Sem gerenciador global de estado por padrão.
10. Sem biblioteca de requisições se `fetch` já resolve.
11. Nenhuma credencial no código.
12. Estados de tela explícitos: carregando, vazio, sucesso e erro.
13. Toda mudança de comportamento considera os testes.
14. Toda decisão relevante atualiza a documentação ou gera um ADR.
15. Imports externos usam apenas o `index.ts` da feature; `npm run check:architecture` verifica essa fronteira.
16. `fetch` e armazenamento do navegador só aparecem em `services/`,
    `adapters/` ou `repositories/`, dentro de uma feature ou de `shared`.
17. `import.meta.env` só aparece em `shared/config/env.ts`.

## Acesso a APIs

Todo acesso a APIs passa por `services/`, `adapters/` ou `repositories/` dentro
da feature. Uma infraestrutura neutra e realmente compartilhada pode usar as
mesmas pastas dentro de `shared`. Os componentes chamam essa fronteira; nunca
fazem `fetch` diretamente. Isso concentra o tratamento de erros e facilita
substituir a fonte por dados fake nos testes. Veja [integrations.md](integrations.md).

## Armazenamento

Persistência local (ex.: `localStorage`) fica isolada em `services/`,
`adapters/` ou `repositories/`. Dados lidos na fronteira são validados antes de
entrar no modelo. O exemplo de notas grava um envelope versionado com revisão
monotônica, migra automaticamente o array legado, preserva dados inválidos em
uma chave de backup e rejeita gravações feitas sobre uma revisão antiga. Eventos
de `storage` sincronizam abas abertas. Falhas de leitura, conflito e escrita têm
códigos estáveis e são apresentadas pela interface; uma operação nunca confirma
sucesso antes da persistência terminar.

A orquestração da lista demonstrativa fica em um hook interno da feature. O
componente `NoteList` cuida da composição visual e semântica, enquanto o hook
coordena validação, revisões e sincronização sem expor detalhes pela interface
pública da feature.

Novas versões do formato persistido devem ter migração explícita e teste do formato anterior. Nunca apague silenciosamente dados que não puderem ser interpretados.

## Rotas e falhas

As rotas ficam em `app/routes`, que exporta `routes` (a árvore, montável com `createMemoryRouter` nos testes) e `router` (o router de produção). Importe sempre de `react-router`.

A rota raiz registra um `errorElement`, então um erro de renderização no layout ou em qualquer rota filha vira uma tela de falha, nunca tela branca. Uma rota curinga (`path: '*'`) atende endereços desconhecidos dentro do layout — mantenha-a como último filho ao acrescentar rotas.

O `ErrorBoundary` de `@vitru/styleguide` não envolve o `<Outlet />`, para não sombrear o `errorElement`. Use-o para isolar um widget arriscado dentro de uma página.

## Configuração de ambiente

Toda leitura de `import.meta.env` passa por `shared/config/env.ts`. As variáveis são declaradas em `ImportMetaEnv` (`src/vite-env.d.ts`) e validadas no boot: ausência ou formato inválido falha imediatamente, nomeando a variável. Nada que chegue ao browser é secreto.

## Estilo e identidade visual

Estilização por CSS Modules ([ADR 0005](decisions/0005-css-modules.md)), com os
valores fornecidos por `@vitru/styleguide/tokens.css`
([ADR 0011](decisions/0011-design-tokens-and-styleguide.md)). Cor, tipografia,
espaçamento, raio, sombra e movimento vêm de tokens; nenhum CSS de componente
declara cor literal. Archivo vem do pacote; os arquivos licenciados da TheMix
ficam apenas no projeto consumidor, em `public/fonts/`
([ADR 0013](decisions/0013-official-fonts.md)). O tema padrão é `vitru`, aplicado pelo atributo
`data-theme` no `index.html`.

As telas são montadas com o kit de `@vitru/styleguide` (cabeçalho, blocos,
campos, tabela, avisos, modal e os estados de carregando, vazio e erro), que já
consome os tokens e traz a semântica de acessibilidade esperada
([ADR 0012](decisions/0012-component-kit-and-visual-guardrails.md)). O subpath
`@vitru/styleguide/showcase` renderiza tokens e kit em `/styleguide` e serve de
referência viva para pessoas e agentes. Ícones vêm de `lucide-react`. As regras
completas estão em [styleguide.md](styleguide.md) e `npm run check:styleguide`
avisa quando são quebradas.

## Estado

O estado é local aos componentes ou às features. Não usamos gerenciador global de estado por padrão. Se, no futuro, a complexidade justificar, a decisão deve ser registrada em um ADR.

## Testes

Os testes ficam colocalizados dentro da feature, na pasta `tests/`. Testam o
comportamento observável da funcionalidade. Os scripts de arquitetura usam a AST
do TypeScript para cobrir imports estáticos, reexports, imports dinâmicos e o uso
de `fetch`, `localStorage` e `import.meta.env` fora das fronteiras permitidas.
Detalhes em [testing.md](testing.md).

## Evolução incremental

O template começa simples de propósito. Adicione estrutura, bibliotecas ou camadas apenas quando um problema real aparecer, e registre a mudança em um ADR (`docs/decisions/`).
