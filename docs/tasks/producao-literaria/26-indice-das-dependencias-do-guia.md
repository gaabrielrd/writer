# 26 — Índice nativo das dependências do guia

Implementação local, ainda sem execução de testes ou gates. O incremento 25 foi
progresso: preparou verificações metadata e cenários de origem. Este passo fecha
o produtor do índice e a recuperação interna, com a exposição pública ainda pendente.

## Escrita e armazenamento

A versão nova do guia e `literaryPublicationGuideDependencies/{versionId}` são
criadas atomicamente com a entrada, seu recibo e o clock já existentes. O normalizador
foi extraído sem mudança de contrato para `literaryReaderGuideProtocol.mjs`; o
reexport de `literaryPublicationGuide.mjs` permanece.

O índice contém edição, ID, revisão, hashes e listas de IDs de capítulos/alvos.
Não contém guia, nomes, quotes, fatos ou descrições. Preserva todas as referências
permitidas pelo esquema existente: até 57 capítulos distintos e 12 alvos por versão.
Isso limita um registro do guia, sem limitar capítulos ou entradas do livro.

A coleção está nas Rules fechadas ao SDK, no inventário de limpeza do livro e da
publicação e nas isenções de indexação automática. Não há callable nova ou dependência.
Sua adoção em produção requer o rollout coordenado descrito na ADR 0275.

## Verificação metadata

Versão nova: marcador do header e índice coincidem; versão e índice têm nascimento
nativo conjunto e permanecem sem alterações. A prova do índice inclui os stamps
nativos, invalidando ponteiros após recriação. O comportamento dos timestamps reais
é critério obrigatório dos testes SDK preparados, ainda não executados.

As coleções de entrada/versão/prova/índice entram no mapa sem abrir citações. O nó
readerGuide inclui edição e ID, preservando homônimos e componentes longos. As partes
físicas continuam distintas. Relações explícitas usam IDs, nunca detecção por nome.
Até 128 arestas preservam o registro completo; append do motor continua em lotes de 32.

A captura guide-dependency confirma a associação indexada. Ela não inventa uma
encarnação ou revisão histórica do capítulo citado: identityMatches/versionMatches
continuam null. manuscriptRead, wholeUnitRead, editorialReview e byteIntegrityChecked
não são promovidos. Falta de índice continua uma lacuna explícita de cobertura.

## Backfill interno explícito

1. Autorizar livro, edição e versão e devolver preflight metadata, sem abrir o guia.
2. Fixar token, nascimento, stamp e hash da versão original.
3. Por ação autorizada de preparação, conferir o mesmo token e ler uma versão
   limitada pelo schema. Conferir hash e canonicidade, preservando strings.
4. Criar índice, marcador do header e clock na mesma transação. O nascimento do
   índice corresponde à atualização do header; a origem anterior fica no índice.
5. Confirmar replay pelo token original salvo, sem outra escrita ou recobrança.

Consultar ou reproduzir um recibo antigo de save não faz backfill. Índice nativo
marcado que desapareceu não é recriado. Mudança/recriação da versão ou índice impede
usar a prova antiga. O helper é interno; falta o controlador público que registre a
intenção, faça essas etapas paginadas e só depois congele o fence do mapa.

## Testes preparados

- Onze casos em literaryGuideDependencies.test.mjs: masks/privacidade, recriações,
  edição, backfill/replay, preflight obsoleto, índice nativo ausente, versão retirada,
  associação sem prova da fonte, homônimos/IDs longos, revogação e censo acima de64.
- Um caso do produtor na suíte de publicação: criação junto à versão, hash,
  ausência de prosa, clock único e replay sem escrita.
- Três casos novos com Admin/SDK no emulador: timestamps nativos conjuntos e
  privacidade, backfill/replay e invalidação, recriação do índice.
- Os cenários existentes de Rules e exclusão incluem a coleção nova.

A revisão por leitura ajustou também uma expectativa de erro do teste 24 à resposta
not-found já usada pelo gate de projeto. Não houve execução para confirmar os casos.
Duas âncoras de edição do arquivo de Rules de teste não existiam; o conteúdo foi lido
e a alteração aplicada na âncora real, preservando as alterações anteriores.

Nenhum teste, lint, typecheck, formatação, build, navegador, cobertura ou validate
foi executado. Novas fontes exigem formatação e gates antes de integrar. A rodada
antiga (5.422 testes/86,24% e Rules timeout) não valida os incrementos 24–26.

## Continuação

Implementar controlador público de preparação/censo/verificação/propagação, fence e
cobertura integrais, resolução justificada e interface do mapa. Portabilidade editorial
em nova cópia privada, auditoria dos aceites restantes e cobertura mínima90 continuam
no objetivo. As cinco etapas permanecem abertas. Sem commit, merge de volta, push ou deploy.
