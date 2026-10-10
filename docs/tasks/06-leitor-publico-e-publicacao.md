# Tarefa 06 — Leitor Público e Publicação Online

## Contexto

Autores desejam compartilhar suas histórias com leitores beta e público na web de forma interativa, valorizando o universo narrativo por meio de tooltips de lore ativos apenas para entidades públicas (sem spoilers).

## Objetivo

Implementar a rota e os componentes do **Leitor Público** (`/read/:bookId`), permitindo que qualquer leitor acesse livros publicados sem autenticação, navegue pelos capítulos com tipografia otimizada e visualize tooltips informativos de personagens, locais e conceitos autorizados pelo autor.

## Escopo

- Implementação na feature `src/features/books`:
  - `components/ReaderView.tsx`: Página pública de leitura contendo sumário lateral com navegação de capítulos, alternador de modo de leitura (claro/escuro) e área de texto estilizada.
  - `components/ReaderHeader.tsx`: Cabeçalho limpo com título do livro, nome do autor, capítulo atual e botão de compartilhar link.
  - `components/ReaderLoreTooltip.tsx`: Balão de informação otimizado para o leitor, filtrando estritamente entidades marcadas com `isPublic: true`.
  - `services/publicBookService.ts`: Serviço de consulta de livros, capítulos e lore com status publicado sem exigir autenticação.
  - `tests/`: Testes de componentes cobrindo acesso anônimo, navegação entre capítulos, bloqueio de livros privados e exibição correta apenas de lore público.
- Registro da rota pública `/read/:bookId` em `src/app/routes/index.tsx`.

## Não escopo

- Edição de texto ou lore nesta tela.
- Sistema de comentários ou paywall para capítulos.

## Critérios de aceite

- [x] Qualquer visitante sem login pode acessar `/read/:bookId` para um livro com status "Publicado" e ler seus capítulos.
- [x] Se o livro estiver com status "Rascunho", um visitante deslogado visualiza uma mensagem amigável informando que a obra é privada.
- [x] O leitor pode navegar facilmente entre os capítulos através do sumário lateral ou botões "Anterior" / "Próximo".
- [x] Entidades com `isPublic: true` exibem balões de informação (categoria e resumo) ao passar o mouse ou tocar na palavra.
- [x] Entidades privadas (segredos/spoilers do autor) não são destacadas nem expostas no leitor público.
- [x] Testes cobrem a renderização pública, o bloqueio de rascunhos e a filtragem de lore sensível.

## Tarefas

- [x] 1. Implementar o serviço de consulta pública `publicBookService.ts` na feature `books`.
- [x] 2. Criar os componentes `ReaderView`, `ReaderHeader` e `ReaderLoreTooltip` com os padrões de tipografia e tokens de `@/shared/ui` e tokens semânticos.
- [x] 3. Implementar a navegação de capítulos (sumário lateral e botões de avanço).
- [x] 4. Registrar a rota `/read/:bookId` em `src/app/routes/index.tsx`.
- [x] 5. Escrever testes de integração e componentes em `src/features/books/tests/`.
- [x] 6. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Exposição acidental de lore privado: garantir filtragem tanto no serviço quanto na renderização do leitor público.

## Evidência da implementação

Ver a [revisão de aceite 01–08](roadmap-acceptance.md) e a
[entrega integrada](../entregas/2026-10-10-roadmap-writer.md). A validação local
está concluída; a evidência de navegador e o estado do CI são acompanhados no PR.
