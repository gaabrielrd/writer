# ADR 0017: Biblioteca de imagens e referências de capa

- Data: 2026-10-10
- Status: Aceita

## Contexto

Capas aceitas eram vinculadas a um único livro ou expiravam depois de sete dias.
O usuário quer guardá-las permanentemente e reutilizá-las em qualquer obra,
com gerenciamento pessoal e sem novo débito.

## Decisão

Criar a feature `image-library`, com serviços de callables, página privada e
seletor público. No servidor, o aceite insere a imagem na mesma transação do
débito. Cada livro tem `coverImageId`, preservando `coverUrl` para compatibilidade
com URLs externas. Referências por livro e contador de usos são mantidos em
transações. Escritas de referências são exclusivas do servidor.

Exclusão só ocorre com zero referências. O estado `deleting` bloqueia novos
vínculos antes de remover o arquivo; um tombstone `deleted` impede ressurreição.
Excluir o livro libera sua referência sem apagar a imagem. Migrar arquivos
legados ainda disponíveis é idempotente, sem débito, em lotes com cursor
persistido. Sugestões descartadas seguem a expiração existente.

Primitivos locais de Dropdown e Tooltip usam Radix já instalado, tokens de tema
e são compartilhados pelo header e pelo catálogo `/styleguide`.

## Consequências

Storage guarda imagens aceitas por prazo indefinido até exclusão explícita. O
contador depende de todos os vínculos passarem pelo servidor, protegido por
regras e testes. A exclusão de livro libera o uso via trigger assíncrono.
Falhas de remoção no Storage exigem retentativa; a imagem em exclusão continua
indisponível para seleção. URLs com token preservam a semântica anterior:
posse do link permite acesso aos pixels, apesar de metadados privados.
