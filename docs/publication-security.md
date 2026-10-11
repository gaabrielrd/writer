# Publicação e segurança dos manuscritos

## Modelo e limites de confiança

Os documentos originais em `books/{bookId}`, `chapters` e `lore` são privados,
mesmo quando a obra está publicada ou uma entidade tem `isPublic: true`. Apenas o
autor autenticado pode lê-los ou alterá-los. O campo `authorId` não pode ser
transferido pelo navegador. A interface pública não consulta esses documentos.

Publicar exige uma ação explícita e um nome público informado pelo autor. O
serviço não consulta perfil, e-mail, UID, foto ou chaves de IA para compor a
publicação. Isso permite usar um pseudônimo sem revelar a identidade da conta.

A publicação é um retrato dos dados salvos. Alterações posteriores permanecem no
rascunho até uma nova publicação. A exceção de privacidade é tornar uma entidade
pública privada ou excluí-la: isso retira a publicação inteira, atomicamente com
a mudança, para que nenhum resumo antigo continue disponível. As regras exigem
a mesma revogação mesmo quando a escrita não parte da interface do aplicativo.

Nenhum sistema pode apagar uma cópia que um leitor já baixou, fotografou ou
copiou. Retirar a publicação revoga novas leituras no servidor e encerra a
visualização ativa quando o cliente recebe a invalidação. Não é uma promessa de
remoção de cópias previamente obtidas por terceiros.

## Projeção pública permitida

- `publicBooks/{bookId}`: `schemaVersion`, `title`, `authorName`, `revisionId`,
  `publishedAt`.
- `publicBooks/{bookId}/revisions/{revisionId}`: `createdAt`, `chapterCount`,
  `loreCount`, `privacyVersion`.
- Cada documento da subcoleção `chapters`: `title`, `order`, `content`.
- Cada documento da subcoleção `lore`: `name`, `aliases`, `category`, `summary`.

A lista de campos é fechada nas regras, inclusive para autores. Detalhes,
relações, identificadores de conta, sinopse privada, configurações e chaves não
fazem parte do formato público. Só entidades com consentimento explícito
`isPublic === true` são copiadas; ausência do campo não significa consentimento.
O resumo de lore tem até 140 caracteres, os apelidos até 20 itens de 200
caracteres e o nome público do autor até 120 caracteres.

O conteúdo de capítulos é convertido e sanitizado por `renderRichText` antes de
ser gravado e sanitizado novamente na leitura. A proteção contra campos extras
é aplicada no servidor; a proteção de HTML depende também do renderizador
seguro, que não confia em HTML armazenado. Texto que o próprio autor escreveu no
manuscrito ou no resumo público continua sendo conteúdo que ele escolheu
publicar; a projeção não é um detector automático de segredos.

## Preparação, troca e revogação

1. O serviço lê os dados originais do servidor e valida todos os campos antes
   de começar a escrever.
2. Cria uma revisão nova em documentos separados. Lotes de dez escritas
   respeitam o orçamento de leituras das regras, incluindo a verificação do
   consentimento original de cada entidade.
3. Revisões em preparação permanecem invisíveis ao público. Revisões não podem
   ser alteradas no lugar; uma atualização gera outra revisão.
4. Uma transação verifica se a obra não mudou durante a preparação e troca o
   apontador público junto com o status privado para `published`.
5. Leituras anônimas exigem a revisão atualmente apontada e o livro ainda
   publicado. A revisão anterior deixa de ser acessível no mesmo instante.
6. Retirar a publicação remove o apontador e muda o status para `draft` em um
   único lote. URLs diretas de capítulos ou lore também deixam de funcionar.

Cada revogação de lore aumenta `publicationPrivacyVersion` do livro. A revisão
captura esse número como `privacyVersion`, e as regras só permitem ativar revisões
da versão de privacidade atual. O contador não pode retroceder. Assim, copiar
um apontador antigo não restaura lore tornado privado. Metadados de revisões não
podem ser removidos e recriados para contornar essa verificação: só são apagados
depois de iniciar a exclusão irreversível do livro, quando novas publicações e
escritas de conteúdo ficam bloqueadas.

Uma falha no upload nunca troca o apontador visível nem publica conteúdo pela
metade. Revisões incompletas ou antigas ficam inacessíveis e são removidas
quando o livro é excluído. A exclusão retira primeiro a publicação, limpa todas
as revisões públicas e os capítulos e entidades privados, e só então remove o
livro. Se a limpeza falhar, a obra continua indisponível ao público e a operação
pode ser repetida. A exclusão final deixa em `deletedBooks/{bookId}` apenas uma
marca de data do servidor, sem manuscrito ou identificação do autor. Esse ID
não pode ser reutilizado para reanexar revisões órfãs antigas. A marca não pode
ser lida, alterada ou apagada pelo cliente.

Cada capítulo é armazenado separadamente, permitindo livros com mais de 1 MiB
no total. Um capítulo cuja projeção serializada ultrapasse 900.000 bytes é
recusado com orientação para dividi-lo. Esse limite deixa margem para os
metadados do documento do Firestore. Não há documento único contendo o livro
inteiro, lista de capítulos ou lista de entidades.

O leitor usa consultas ao servidor e não considera uma cópia offline como prova
de autorização atual. A consequência é que a leitura pública exige conexão;
um erro de rede não deve exibir silenciosamente uma publicação antiga em cache.

## Regras de créditos

Perfis novos têm exatamente 100 créditos e plano gratuito. UID, plano e data de
criação são imutáveis pelo cliente, e a exclusão do perfil é proibida para evitar
recriar o benefício inicial. Débitos permitidos são de uma unidade, sem saldo
negativo. A promoção a premium depende de uma operação administrativa confiável. Como o
plano do perfil era alterável nas regras legadas, ele não é suficiente para
autorizar renovação: é obrigatória também uma concessão administrativa
`creditEntitlements/{uid}` com `tier: premium` e `active: true`. Essa coleção
permite leitura apenas ao titular e não permite nenhuma escrita pelo cliente.

Perfis premium podem receber exatamente mais 2.000 créditos uma vez por mês UTC,
com `creditsRenewedAt` igual ao horário do servidor. O saldo existente é
preservado. O navegador não determina o mês autorizado nem pode reescrever,
remover ou retroceder a marca de renovação. Perfis premium sem marca de renovação só recebem o primeiro benefício se já
possuírem a concessão administrativa confiável; não há migração automática nem
renovação baseada somente no valor legado de `users.tier`. Os testes cobrem tentativas de
emissão arbitrária, repetição e concorrência.

## Testes e entrada em produção

Execute `npm run test:rules` com Node/npm nas versões do projeto e Java 21. O
comando usa `scripts/run-firestore-rules.mjs`, sem o pacote completo do Firebase
CLI. Ele baixa exclusivamente o JAR oficial Google do Firestore 1.22.0,
verifica o SHA-256 fixado antes de executar, inicia o Java em uma porta efêmera
no loopback e roda as suítes com projetos `demo-`. O arquivo verificado fica em
`.firebase/emulators`, permitindo execuções posteriores sem novo download;
`WRITER_FIRESTORE_CACHE` pode selecionar outro diretório. Um cache adulterado
falha sem execução. Não há autenticação Firebase nem comando de deploy nesse
runner. As suítes carregam `firestore.rules` pelo ambiente de testes local,
com timeout e encerramento dos processos filhos, inclusive em erro ou sinal. O workflow
`Firestore Rules` aplica esse mesmo teste em pull requests; `npm run validate`
continua responsável pelos testes da aplicação e demais verificações.

As suítes verificam acesso anônimo, rascunhos, autores diferentes, autoria
imutável, campos extras e tipos inválidos, revisão em preparação, troca atômica,
revogação por URL direta, revogação de lore e limites reais de lotes. Os testes de
serviço cobrem sanitização, consentimento explícito, falha no upload, conflitos,
retirada da publicação e limpeza das revisões.

A implementação não executa deploy de regras, migração nem publicação de obras
reais. O rollout exige autorização separada e revisão das regras junto com a
versão do aplicativo e provisionamento revisado das concessões de premium.
Perfis premium legados sem concessão mantêm o saldo persistido, mas não recebem
renovação automática. Livros previamente marcados como publicados não são
migrados automaticamente: seu autor deve revisar e publicar novamente,
informando o nome público. Livros legados com status publicado continuam editáveis pelo autor mesmo sem
projeção; essa compatibilidade não torna seus originais públicos.
Não se deve manter o antigo acesso público aos
originais como compatibilidade temporária.

## Consentimento de lore compartilhado

Livros vinculados publicam uma projeção de lore local e global com metadados de
versão 2. Os originais do universo continuam privados. `sourceEntityId` em uma
projeção global permite verificar consentimento sem publicar fichas ou notas.

A revisão e o apontador capturam `universeId` e `universePrivacyVersion`. O
marcador `publicUniversePrivacy/{universeId}` contém apenas versão e estado ativo.
Excluir lore público global ou torná-lo privado incrementa a versão na transação
da mutação. Regras recusam apontadores/revisões antigos e o leitor observa o
marcador para retirar conteúdo exibido. Restaurar um apontador antigo não
reativa acesso. O status salvo dos livros pode continuar publicado até uma ação
explícita do autor; a versão decide a disponibilidade real.

Trocar ou remover o universo retira a publicação do livro na própria transação
do vínculo. A publicação revalida vínculo e versões para evitar preparar uma
revisão sobre lore alterado em paralelo. Termos locais privados vencem conflitos
antes da projeção, impedindo tooltips globais alternativos para esses termos.
Veja [universos](shared-lore.md) e [ADR 0018](decisions/0018-shared-universes-and-lore.md).

## Atos na revisão

O apontador pode incluir hasActs e a revisão actCount. Cada documento de acts
contém somente name e order; capítulos podem incluir actId. Apenas atos com
capítulos são projetados. Regras validam vínculo à mesma revisão, origem privada
do ato e ausência de campos extras. Atos publicados são imutáveis e ficam
inacessíveis para leitores após troca ou revogação da revisão.
A preparação segue a ordem de atos/capítulos; capítulos públicos recebem uma
ordem global. A exclusão de livro limpa também as coleções de atos.
Veja [atos](book-acts.md).
