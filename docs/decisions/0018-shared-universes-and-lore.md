# ADR 0018: Universos e lore compartilhado

- Status: Aceito
- Data: 2026-10-10

## Contexto

Autores precisam reutilizar fichas entre livros, mantendo detalhes específicos
em cada obra. Copiar entidades por livro tornaria alterações e revogação de
consentimento inconsistentes. O projeto já usa lore privado e publicações
explícitas com projeções limitadas.

## Decisão

Criar `src/features/universes` para cadastro e seleção. Manter formulários,
relações, reconhecimento e serviços de entidades em `src/features/lore`, com
escopo de livro ou universo. Usar interfaces públicas e manter shared neutro.

Persistir lore global na subcoleção do universo e preservar lore local onde está.
Cada livro tem vínculo opcional com um universo do mesmo autor. Identificadores
globais incluem o universo; referências locais antigas continuam válidas.

Manter universos, vínculos e mutações globais no servidor, com Auth e App Check.
Contagens e registros de uso acompanham criação, troca e exclusão de livros.
Bloquear novos vínculos antes de excluir recursivamente universos sem livros.

Usar quatro etapas para criar e editar lore. Relações são editadas uma por vez;
campos e ID de criação permanecem disponíveis nas retentativas.

Resolver termos locais antes dos globais, independentemente da visibilidade.
Projetar somente entidades consentidas e campos permitidos. Publicações com
universo capturam a versão de privacidade em um marcador público mínimo;
revogar lore global incrementa o marcador atomicamente. Regras e leitor público
validam a versão, evitando depender de revogar muitos livros em sequência.
Revalidar a versão de lore ao finalizar uma publicação preparada.

Preservar formatos de publicação e backup de livros sem universo. O backup de
livros vinculados inclui um snapshot privado separado do universo (versão 2).

## Consequências

- Alterações globais alcançam todos os livros vinculados sem duplicação.
- Uma revogação pode invalidar todas as publicações do universo, mesmo quando
  uma entidade não foi usada no texto; o autor precisa republicar.
- O status salvo de um livro pode continuar publicado após revogação global;
  a versão controla o acesso efetivo e o leitor remove conteúdo exibido.
- Exclusão de livro libera a contagem por trigger; o contador é eventualmente
  atualizado. A segurança de exclusão permanece no servidor.
- Relações globais não podem depender de fichas locais de uma obra.
- Nenhuma migração de lore, colaboração entre autores, restauração de universos
  ou geração adicional por IA é introduzida.
- Functions, regras e cliente precisam de liberação coordenada.

Detalhes em [universos e lore compartilhado](../shared-lore.md).
