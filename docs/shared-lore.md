# Universos e lore compartilhado

O dropdown do header oferece **Lore compartilhado** (`/universes`). Cada autor
pode criar universos com nome e descrição e gerenciar suas entidades em
`/universes/:universeId/lore`. Os dados originais são privados do autor.

## Livros e escopos

Um livro pertence a zero ou um universo. O seletor aparece na primeira etapa
**Livro**, quando existem universos, mantendo as três etapas de criação.
**Sem universo** mantém o fluxo independente. As configurações permitem
vincular, trocar ou desvincular universos em livros existentes.

Alterar o vínculo preserva capítulos, capas e lore local e retira a publicação
atual. Referências ao universo anterior continuam armazenadas, mas aparecem
como indisponíveis. Não há cópia nem conversão automática de entidades.

O compêndio e a sidebar separam **Lore local** e **Lore global**. Editar uma ficha
global altera o original usado pelos outros livros. O editor acompanha mudanças
nos dois escopos quando existe universo. Menções, reconhecimento e contexto da
IA recebem as entidades locais e globais; o menu de menções identifica o escopo.

O reconhecimento dá prioridade ao termo local sobre um global idêntico,
inclusive quando o local é privado. Empates no mesmo escopo usam o ID para uma
ordem determinística. Termos mais longos continuam seguindo o matcher existente.
Relações globais apontam somente para entidades do mesmo universo; relações
locais podem apontar para o lore local ou para o universo vinculado.

## Fichas por etapas

Criação e edição compartilham quatro etapas em todos os pontos de entrada:

1. Identificação: nome, categoria, apelidos e resumo de até 140 caracteres.
2. Características: aparência e personalidade.
3. História e notas: ficha detalhada, histórico e notas privadas.
4. Relações e visibilidade: edição de uma relação por vez e consentimento público.

Voltar preserva os campos. Somente a etapa final grava dados. Falhas preservam
valores e permitem retentativa; criações usam IDs estáveis. O diálogo mantém
progresso e ações acessíveis, com rolagem somente no conteúdo da etapa quando
necessária. A edição global avisa que a ficha é compartilhada com outros livros.

## Persistência e operações

- `universes/{universeId}`: autor, nome, descrição, contagem de livros, versões
  de lore e privacidade, datas e bloqueio de exclusão.
- `universes/{universeId}/lore/{entityId}`: fichas globais privadas.
- `universes/{universeId}/books/{bookId}`: vínculos mantidos exclusivamente no servidor.
- `books/{bookId}.universeId`: vínculo opcional; ausência mantém livros legados.
- `books/{bookId}/lore/{entityId}`: fichas locais existentes, preservadas.
- `publicUniversePrivacy/{universeId}`: somente versão e estado ativo, para revogação.

IDs globais usados pelo cliente e pelas relações seguem
`universe:<universeId>:<entityId>`. IDs locais antigos permanecem inalterados.
A feature `lore` aceita escopo explícito ou o ID de livro legado. `universes`
expõe telas, seletor, tipos e serviços pela interface pública.

As callables `createUniverse`, `updateUniverse`, `deleteUniverse`,
`saveUniverseLore` e `deleteUniverseLore` exigem Auth e App Check. O servidor
valida autoria e referências globais. A criação com universo usa o mesmo serviço
transacional de livros que mantém referências de capas, inclusive sem capa.
Trocar vínculo ajusta contagens e revoga a publicação na mesma transação.

Excluir um livro libera seu vínculo por trigger; a contagem pode levar alguns
instantes para atualizar. Excluir um universo exige zero livros vinculados.
A operação bloqueia novos vínculos antes da limpeza recursiva e mantém um
marcador de revogação. Falhas de limpeza podem ser retomadas; IDs removidos
não podem ser recriados para reativar publicações antigas.

## Publicação e backups

Publicações com universo usam metadados de versão 2 e uma projeção das entidades
públicas dos dois escopos. Apenas nome, apelidos, categoria e resumo são conteúdo
público; a procedência global contém somente o ID da entidade original.
Fichas detalhadas, notas, relações e identidade da conta permanecem privadas.

A prioridade de termos é resolvida antes do filtro de visibilidade. Uma entidade
cujo nome conflita com o termo preferido é omitida da projeção; apelidos
conflitantes também são omitidos. Assim, uma entidade global pública não vira
um tooltip alternativo para um termo local privado.

Excluir lore global público ou torná-lo privado incrementa a versão de
privacidade atomicamente. Regras bloqueiam imediatamente publicações antigas
de livros desse universo, inclusive URLs diretas de capítulos e lore. O leitor
observa o marcador e retira conteúdo já exibido. Não há atualização em lote de
cada livro: seu status salvo pode continuar publicado, mas a leitura fica
indisponível até republicar. Mudanças comuns permanecem no rascunho.

A preparação da publicação verifica também a versão de lore do universo antes
de tornar a revisão visível, recusando mudanças concorrentes. Livros sem
universo mantêm a projeção e os backups de versão 1.

O backup JSON privado de versão 2 guarda separadamente o lore local e uma cópia
do universo e seu lore global. Falhas de leitura do universo interrompem o backup
para evitar uma cópia incompleta. Não há restauração/importação de universos.

## Validação e implantação

Execute `npm ci --prefix functions`, `npm run validate`, `npm run test:rules`
e `npm run test:e2e`. O emulador usa somente projetos fictícios `demo`.
A suíte visual isolada cobre os fluxos em desktop e celular nos três temas:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/universes.visual.ts
```

As fixtures pertencem apenas ao servidor de testes visuais e bloqueiam rede
externa; nunca entram no build de produção.
A liberação real exige implantação coordenada de functions, regras e frontend.
Esta implementação não executa deploy, migração nem republicação automática.

Veja [ADR 0018](decisions/0018-shared-universes-and-lore.md) e
[segurança da publicação](publication-security.md).
