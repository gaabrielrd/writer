# Central de ajuda

A rota pública `/help` oferece ajuda em português com cobertura equilibrada de
livros, aventuras e campanhas. A lateral autenticada tem **Ajuda**, sempre
disponível no grupo Configurar; o cabeçalho público também oferece esse acesso.
O onboarding e o assistente permanecem com seus papéis existentes.

## Consulta

A entrada mostra três jornadas iniciais e a lista de guias. Os 11 assuntos cobrem
conceitos, projetos, escrita, aventuras, campanhas/sessões, lore, IA/personas,
imagens, importação/recuperação, exportação/publicação e preferências/dúvidas.

A busca lê título, resumo, palavras-chave e corpo, ignorando caixa e acentos.
Todos os termos devem ocorrer no artigo. Digitar inicia uma busca global, mesmo
quando a pessoa estava em um assunto. Não há chamadas de rede nem geração de IA
para consultar o conteúdo da ajuda.

- `/help?q=backup`: busca compartilhável.
- `/help?topic=campaigns`: lista por assunto.
- `/help?article=base-congelada`: artigo com explicação, exemplos e leituras
  relacionadas. O título recebe foco ao abrir para orientar a leitura por teclado.

Artigos não encontrados e buscas vazias oferecem retorno. Links de tarefas levam
a rotas reais e continuam sujeitos aos gates de acesso de cada destino.

## Apresentação

A ajuda estende o modo de leitura do Writer: índice lateral, lista de linhas e
artigo limitado a 72ch. Reutiliza `PageHeader`, `Toolbar`, `Input`, `EmptyState`
e `Alert`; cores, espaçamentos, tipografia e foco acompanham os tokens semânticos
do [styleguide](styleguide.md) e de `src/styles/globals.css` nos três temas.
Em janelas estreitas, o índice passa para links que quebram linhas. A entrega
preserva a identidade existente e o suporte inicial a desktop/laptop descrito
em `PRODUCT.md`.

## Manutenção

`src/features/help/model/helpContent.ts` guarda os assuntos e artigos tipados.
`HelpPage` renderiza o conteúdo, integra os parâmetros de URL e usa o kit
compartilhado. A feature depende somente de shared e bibliotecas de plataforma;
`app` compõe sua API pública nas rotas e na navegação.

Ao alterar um fluxo, confira sua explicação, os passos e destinos correspondentes.
Mantenha IDs estáveis para preservar os links. Os testes verificam integridade
das leituras relacionadas, busca, filtros, URLs e recuperação de estados vazios.
As jornadas Chromium usam componentes reais e serviços fictícios com rede externa
bloqueada. Veja o [plano e fontes](tasks/central-de-ajuda.md) e a
[evidência local](entregas/2026-11-06-central-de-ajuda.md).
