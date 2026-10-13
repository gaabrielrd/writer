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
- Centralize capacidades de raciocínio no contrato puro `functions/src/chatGeneration.mjs`, sem I/O ou credenciais.
- Não adicione abstrações sem necessidade demonstrada.

## Estilo e interface

- Siga `docs/styleguide.md`.
- Use finais de linha LF, definidos por `.gitattributes` e `.editorconfig`.
- Cores, superfícies e estados visuais vêm das variáveis de tema semânticas em `src/styles/globals.css` (`--background`, `--foreground`, `--primary`, `--secondary`, `--card`, `--border`, etc.).
- Suporte a temas dinâmicos via `src/shared/theme` (`ThemeProvider`, `useTheme`, `ThemeToggle`): Claro (`light`), Escuro (`dark`) e Sépia (`sepia`).
- Ícones somente de `lucide-react`, com a classe `icon`; acrescente `icon-sm` para o tamanho menor.
- Monte as telas com os componentes modulares de `@/shared/ui` (`Button`, `Input`, `Textarea`, `Dropdown`, `Slider`, `Badge`, `Card`, `Dialog`, `Alert`, `LoadingState`, `EmptyState`, `ErrorState`, `PageHeader`, `Table`).
- Campo de formulário sempre pelo `Input`/`Textarea`/`Dropdown mode="select"` de `@/shared/ui`; use `Slider` para atributos de 0 a 100.
- Use `Dropdown mode="action"` para menus de ação; siga a API de `docs/dropdown.md`.
- Toda tela que busca dados cobre carregando, vazio, erro e sucesso.
- Mantenha a rota `/styleguide` funcionando e atualizada com os temas.

## Escopo

- Não expanda o escopo além do solicitado.
- Uma funcionalidade por vez.
- Siga os contratos e portões por incremento em `docs/tasks/writer-v2/execucao/06-contratos-e-replanejamento.md`; confira o estado no registro de execução.

## Dependências

- Não adicione dependências sem explicar a necessidade.
- Prefira APIs da plataforma e dependências existentes.

## Segurança

- Nunca faça commit de segredos.

## Armazenamento e APIs

- Chamadas HTTP em serviços/clientes.
- Acesso a localStorage em adaptadores/repositórios.
- Leitura de `import.meta.env` só em `shared/config/env.ts`.
- Mantenha geração de livros e débitos de créditos em `functions`; configure segredos somente no servidor.
- Mantenha conversas de capítulo privadas e sem débito; aplique sugestões com manuscrito, crédito e recibo atômicos em `functions`.
- Congele provedor, modelo e raciocínio dos pedidos de chat; nunca inclua chaves em snapshots, histórico ou recuperação.
- Na criação assistida, mantenha sessões, entrevista, validação e confirmação do livro/lore/capa com débito atômico em `functions`.
- Mantenha vínculos e exclusão de imagens da biblioteca no servidor; todo seletor de imagem deve oferecer `ImageLibraryPicker` pela interface pública da feature.
- Mantenha universos, vínculos de livros e mutações de lore global em `functions`.
- Preserve a revogação do lore global por versão nas regras e no leitor público.

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
- Instale as dependências de `functions` com `npm ci --prefix functions` antes de validar.
- Use `WRITER_VISUAL_PORT` distinto por checkout nas execuções visuais paralelas.
- Mantenha protótipos demonstrativos em `e2e/visual`; não registre fixtures como evidência de autorização, pagamento ou piloto reais.

## Documentação

- Toda decisão relevante atualiza a documentação ou uma ADR.
- Toda entrega implementada gera um registro em `docs/entregas`, com
  funcionalidades, testes e o resultado real das validações.
- Mudança que cria ou revoga uma regra atualiza este `AGENTS.md`.

## Conclusão

Uma tarefa só está concluída quando todos os itens da definição de
concluído estiverem satisfeitos. A lista fica em
`docs/development-process.md` e é a única fonte da verdade.
