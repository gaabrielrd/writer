# Instruções do projeto

## Leia primeiro

1. README.md
2. docs/architecture.md
3. docs/development-process.md
4. docs/testing.md
5. docs/styleguide.md (antes de qualquer trabalho de interface)

## Processo obrigatório

1. Entenda a solicitação e os critérios de aceite.
2. Inspecione os arquivos relevantes e os testes existentes.
3. Apresente um plano para mudanças que afetam vários arquivos.
4. Mantenha as alterações dentro do escopo solicitado.
5. Adicione ou atualize testes para mudanças de comportamento.
6. Execute `npm run validate`.
7. Revise o diff final.
8. Atualize a documentação afetada.
9. Registre a evidência da entrega em `docs/entregas`.

## Arquitetura

- Organize as capacidades do produto em `src/features`.
- Não importe arquivos internos de outra feature.
- Use as exportações públicas das features (index.ts).
- Mantenha APIs externas e armazenamento do navegador atrás de serviços.
- Mantenha `shared` neutro em relação ao domínio.
- Não adicione abstrações sem necessidade demonstrada.

## Estilo e interface

- Siga `docs/styleguide.md`.
- Cor, espaçamento, tipografia, raio e transição vêm dos tokens de
  `@vitru/styleguide/tokens.css`. Não escreva cor literal em CSS de componente.
- Ícones somente de `lucide-react`, com a classe `icon`; acrescente
  `icon-sm` para o tamanho menor.
- Fontes oficiais: TheMix nos títulos (`--font-display`, só peso 700) e
  Archivo no texto (`--font-sans`). Não adicione fonte nem use CDN.
- Estilo de componente fica no CSS Module do próprio componente.
- Monte as telas com o kit de `@vitru/styleguide` (`PageHeader`, `Card`,
  `Input`, `Table`, `Alert`, `Dialog`, `LoadingState`, `EmptyState`,
  `ErrorState`...). Só crie componente novo se nenhum deles resolver.
- Campo de formulário sempre pelo `Input`/`Textarea`/`Select`.
- Toda tela que busca dados cobre carregando, vazio, erro e sucesso.
- Para mudar a identidade visual, altere os tokens, não os componentes.
- Mantenha a rota `/styleguide` funcionando e atualizada.

## Escopo

- Não expanda o escopo além do solicitado.
- Uma funcionalidade por vez.

## Dependências

- Não adicione dependências sem explicar a necessidade.
- Prefira APIs da plataforma e dependências existentes.

## Segurança

- Nunca faça commit de segredos.

## Armazenamento e APIs

- Chamadas HTTP em serviços/clientes.
- Acesso a localStorage em adaptadores/repositórios.
- Leitura de `import.meta.env` só em `shared/config/env.ts`.

## Rotas

- Importe de `react-router`, nunca de `react-router-dom`.
- Acrescente rotas em `app/routes`, mantendo a curinga `'*'` por último.
- Não envolva o `<Outlet />` em `ErrorBoundary`: o `errorElement` já cobre.

## Commits

- Primeira linha no formato `tipo: descrição`, até 72 caracteres, sem ponto final.
- Não use `--no-verify` para contornar os hooks.

## Testes

- Toda mudança de comportamento deve considerar testes.
- Teste o resultado observável.
- `npm run test` aplica limites de cobertura; não os reduza para fazer passar.

## Documentação

- Toda decisão relevante atualiza a documentação ou uma ADR.
- Toda entrega implementada gera um registro em `docs/entregas`, com
  funcionalidades, testes e o resultado real das validações.
- Mudança que cria ou revoga uma regra atualiza este `AGENTS.md`.

## Conclusão

Uma tarefa só está concluída quando todos os itens da definição de
concluído estiverem satisfeitos. A lista fica em
`docs/development-process.md` e é a única fonte da verdade.
