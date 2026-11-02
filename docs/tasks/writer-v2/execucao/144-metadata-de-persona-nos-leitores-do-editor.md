# P1 — metadata de persona nos leitores do editor

## Objetivo e descoberta

Após c4476c0, getChapter/listChapters montam DTO explicitamente e omitem
personaAvailability. Rascunho aberto pelo editor perde a marca antes de chegar
ao produtor dos planos 141/143. getBook/listBooksByAuthor também não projetam
essa metadata. Corrigir a fronteira, sem mudar escrita ou buscar perfis.

Grafo não disponível após falha fast já registrada; fontes reais bookService,
Book/Chapter, bookDraftBackupRecords e testes de leitores conferidos.

## Contrato antes do código

1. Tipos Book/Chapter recebem propriedade opcional com tipo puro compartilhado
   de functions/bookPersonaAvailability. Sem dependência na feature portabilidade.
   Inputs de criação/edição não passam a autorizar gravação da metadata.
2. Leitores de livro/capítulo projetam somente marca fechada ligada ao ID atual,
   pelo mesmo validador puro da ADR 0163. Capítulo preserva complemento/valores;
   livro aceita somente razão profile-not-recorded, como o schema portátil.
3. Marca de outro vínculo é omitida. Marca malformada/extra/scope inválido falha,
   sem adoção de biblioteca, inferência de ausência ou conteúdo fabricado.
   Dados sem marca mantêm DTO anterior, sem campos vazios novos.
4. Projeção não consulta perfil ou grava qualquer dado, não altera texto/datas
   nem muta snapshot. Composição/hidratação do texto existente permanece.
5. Rascunho portátil usa a propriedade do tipo público Chapter, eliminando
   interseção redundante. DTO real do leitor deve chegar ao produtor e conservar
   ausência/overrides e texto vazio sem lookup de persona.
6. subscribeWritingBindings continua emitindo somente os vínculos atuais;
   não copiar prosa/metadados arbitrários pelo listener. Se vínculo muda,
   marca antiga será omitida pelo produtor como já definido.

## Sequência e arquivos

- [x] Book/Chapter, projeções get/list e contrato do rascunho.
- [x] Testes dirigidos de livro/capítulo, marca velha/inválida e DTO real → backup.
- [x] Checks de tipos/lint/formato/arquitetura/docs/diff, revisão/evidência/commit.

Arquivos previstos: books/model/book.ts e chapter.ts, services/bookService.ts,
tests/bookService.test.ts e book-portability/services/bookDraftBackupRecords.ts;
docs/ADR/AGENTS correspondentes.

Sem UI, endpoint, namespace, Rules, dependência, inferência/migração automática,
CI, push, deploy ou subagentes. Inventário geral, fontes v1, exclusão/coleta,
certificação/rollout e validate de P1 continuam pendentes; fases/gates mantidos.
