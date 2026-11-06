# Central de ajuda — implementação local

## Objetivo

Complementar o onboarding com explicações consultáveis sobre os conceitos,
processos e funcionalidades do Writer, cobrindo autores e mestres de forma
equilibrada, conforme a preferência confirmada pelo operador.

## Funcionalidades

- Rota `/help`, disponível sem login e integrada ao shell autenticado.
- Acesso **Ajuda** na lateral e no cabeçalho público.
- 56 artigos em 11 assuntos, com conceitos, exemplos, instruções, cuidados,
  leituras relacionadas e links para tarefas disponíveis.
- Jornadas iniciais para livro, aventura e campanha.
- Busca global em título, resumo, palavras-chave e corpo, sem distinção de
  caixa ou acentos, combinando todos os termos informados.
- URLs para busca, assunto e artigo; navegação de retorno e recarga.
- Estados recuperáveis para busca vazia e artigo inexistente.
- Foco no título do artigo e rolagem ao início da ajuda para conservar seu
  cabeçalho; componentes compartilhados e temas Claro, Escuro e Sépia.

O conteúdo distingue lore global/próprio/variantes, planejamento/prosa,
assistente/chat, geração/aceite, prévia/publicação e histórico/backup/exportação.
Também explica pedidos sem resposta, dados do dispositivo, privacidade e os
espaços ainda marcados Em breve. Não executa operações de projeto ou IA.

## Arquivos e documentação

- Nova feature `src/features/help`, com modelo de conteúdo, página e testes.
- Integração em rotas, navegação e cabeçalho da aplicação, com testes existentes
  ampliados.
- Jornada `e2e/visual/help.visual.ts`.
- [Plano e fontes](../tasks/central-de-ajuda.md), [documentação](../help.md),
  README, arquitetura e primeiro acesso atualizados.

## Verificação local

- Vitest dirigido: **41 testes em 4 arquivos aprovados** (conteúdo, página,
  navegação e composição real da aplicação).
- Chromium: **6 jornadas aprovadas**, cobrindo os três temas, acesso com conta
  fictícia e acesso anônimo, busca global, artigos, links relacionados, recarga,
  voltar, teclado e ausência de transbordamento em 1440, 1024 e 800 px.
- `npm run typecheck`: aprovado.
- ESLint dos arquivos afetados: aprovado.
- `npm run check:architecture` e `npm run check:styleguide`: aprovados.
- Verificação de documentação, Prettier dos arquivos afetados e
  `git diff --check`: aprovados.
- `npm run build:bundle`: aprovado, com avisos de tamanho de chunks e imports
  estáticos/dinâmicos do projeto.
- `npm run smoke:build`: aprovado.

As jornadas usam rotas/componentes reais, serviços fictícios e rede externa
bloqueada. Não comprovam login real nem operações de projeto contra produção.
As capturas locais ficam em `visual-test-results`, junto do relatório Playwright.

A primeira tentativa restrita de testes não iniciou o Vite por `spawn EPERM`.
O typecheck restrito também não pôde gravar seu cache. As execuções fora dessas
restrições passaram; não foi alterado código de produto para contornar o ambiente.

## Revisão de interface e documentação

O finish reviewer independente concluiu com disposição **ship**, sem achados
materiais, após conferir nove capturas válidas nos temas Claro, Escuro e Sépia.
A conferência documental comparou a página e seu CSS com `PRODUCT.md`,
`docs/styleguide.md` e `src/styles/globals.css`: a ajuda estende o modo de leitura
existente, reutiliza o kit compartilhado e tokens semânticos, mantém o índice
lateral e a lista de linhas e limita o artigo a 72ch. Não houve mudança de sistema
visual. A documentação da ajuda registra consulta, navegação, manutenção e limites
da evidência; o plano conserva as fontes e os critérios de aceite.

## Limites de publicação e validação

Não foram executados `npm run validate`, cobertura global, testes completos de
Functions/Rules ou uma jornada autenticada real. Conforme a instrução vigente
do AGENTS.md, o validate integral fica para antes de commit/merge ou solicitação
explícita. Esta entrega permanece sem commit, push, CI ou deploy.

Não há dependências novas, alterações de Functions/Rules ou dados de usuário.
O conteúdo descreve os recursos do checkout; precisa acompanhar mudanças futuras
nos fluxos, preços apresentados pelos controles e disponibilidade dos recursos.

## Como conferir

1. Abra `/help` pela navegação ou diretamente sem login.
2. Escolha uma das três jornadas ou um assunto na lateral.
3. Busque `PREVIA jogadores` e abra o artigo de prévias.
4. Abra um link de leitura relacionada; use voltar e recarregue o endereço.
5. Busque um termo inexistente e use Limpar busca.
6. Confira a leitura nos três temas; os links de tarefa devem conservar os
   gates originais dos destinos.
