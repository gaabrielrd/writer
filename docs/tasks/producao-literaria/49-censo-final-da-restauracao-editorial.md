# Incremento 49 — censo final da restauração editorial

## Estado e escopo

Implementação interna de E5.5 após o [preparo editável](48-contrato-e-planos-restaurados.md).
O plano integral permanece ativo, com cinco etapas formalmente abertas. O censo
não habilita a interface, a admissão pública de v2 ou a ativação do livro.
Nenhum teste ou check foi executado neste incremento.

## Contribuição editorial separada da base

A revisão manual identificou um conflito nos incrementos 47–48: o verificador do
preparo schema13 exige que a auditoria concluída da base tenha contagem exata,
enquanto os escritores editoriais aumentavam artifactCount depois dela. Esses
incrementos ainda não tinham sido executados. Não se relaxou essa igualdade.

`editorialAddedArtifacts` registra, na mesma transação dos escritores, somente os
novos recursos editoriais. O campo é permitido no preparo schema13 e obrigatório
no job v15/fonte v2; não aparece nos formatos antigos. O controle nativo confere
que o campo equivale ao total criado depois de baseArtifacts. Replay também
preserva a monotonicidade desse contador.

A auditoria original continua certificando exatamente artifactCount menos retirados
e contribuição editorial. O novo censo confere o total físico integral. O contador
não é decrementado durante cleanup: limpezas usam cleanedArtifacts, como antes.
Arquivos v1/JSON e inventários 1–14 conservam o cálculo anterior, sem campo adicional.

## Origem da auditoria e imutabilidade

Antes da primeira reserva editorial, o recibo de auditoria da base deve ser
imutável e ter o mesmo commit nativo do job observado. Sua preparação deve ser
idêntica à base, sem o contador posterior. No censo, esse recibo continua conferido
e deve anteceder o nascimento do controle editorial. Recriar o recibo após começar
a cópia não produz uma origem válida.

O contexto do censo fixa UID, reserva/job, livro, validação, SHA da fonte, provas
da cópia histórica e das cópias editáveis, contadores, recibo da base e layout.
Somente um controle materialized com heads prepared pode iniciar o censo. Os
produtores já estão fechados nesses estados; a raiz permanece ausente e o SDK
não pode inserir ou editar esses recursos. O protocolo não concede um caminho
para alterar conteúdo congelado durante a varredura.

## Varredura física

`advanceBookRestoreEditorialAudit` usa a paginação do auditor existente:

1. Percorre journals em páginas de até oito registros, conferindo endereço,
   contexto, alvo e nascimento nativo. O total deve coincidir com o ledger vivo.
2. Percorre as coleções físicas da base e dos recursos editoriais, inclusive
   partes, corpos, registros, correntes, versões e revisões. Preserva cursores de
   pais para namespaces aninhados e revalida a última âncora congelada.
3. Exige vazias as outras coleções editoriais do catálogo e literaryPlanLinks.
   Histórico de workflows, redação, análise ou publicação não vira um job nativo
   restaurado. Recurso inesperado bloqueia o selo e fica preservado.
4. Confirma igualdade entre alvos físicos e journals antes de concluir.

O layout da base v14 continua intacto. O v15 acrescenta os tipos editoriais e
famílias proibidas. O controle do censo é contado, mas não é usado como âncora
congelada: ele muda a cada passo e é autenticado pelo próprio commit corrente do
job e seu recibo. Nenhum corpo de prosa é necessário nessa varredura de metadata.

## Selo e consumo transacional

A última unidade grava controle, journal, job e recibo juntos. O verificador
`verifyBookRestoreEditorialAudit` confere contexto, contagens, layout completo,
âncora, preparação, recibo imutável e igualdade do commit nativo entre job,
controle e selo. Nenhum contador recebido do cliente autoriza esse resultado.

`openVerifiedBookRestoreEditorialAudit` é um port interno com verify(tx). Ele
confere de novo job, controle e selo dentro da transação consumidora, recusando
uma observação antiga ou cancelada antes dos writes. Não é um grant de ativação.
Ambos os métodos continuam fora de BOOK_RESTORE_METHODS e do catálogo público;
o getter editorial devolve apenas fase e contagens do censo.

A ativação v15 continua recusada. É necessário integrar a prova à revisão e à
ativação atômica, com os demais gates do livro e do processo editorial.

## Testes preparados

Foram preparados **13 casos Node e uma jornada SDK**, sem execução:

- Igualdade da base, contribuição editorial e ledger integral.
- Paginação limitada, censo de todas as famílias e raiz ausente.
- Controle mutável sem invalidar a própria âncora.
- Alvo físico órfão e alvo de journal ausente.
- Recriação do alvo e do journal da âncora física.
- Recriação do recibo de auditoria da base.
- Rollback de cursor/controle/job/recibo e replay de resposta perdida.
- Consumo transacional, cancelamento, conta distinta e input fechado.
- Coleção operacional inesperada preservada e sem certificado.

A fixture compartilhada das cópias editáveis agora aceita Admin Firestore real.
A jornada SDK preparada percorre upload v2, integridade, validação, preparo da base,
materialização histórica, cópias editáveis e censo. Confere timestamps nativos,
privacidade por Rules, invalidação após cancelamento e limpeza dos recursos.
Não habilita endpoint v2, não testa a fronteira HTTP Auth/AppCheck nem ativa raiz.

Nenhum syntax/typecheck/lint/formatter/build/browser/coverage/validate/diff-check
foi executado. Os testes dos incrementos 47–49 aguardam o próximo gate antes da
integração, com a principal reconferida primeiro. Os resultados anteriores de
5.480 frontend, 5.843 Functions, 85,85% de functions e timeout de Rules continuam
históricos; não validam o código novo.

## Continuação

Integrar revisão e ativação com o censo e flags/clocks nativos, preservar pendências
contra edição concorrente, expor leitura/reconciliação privadas e concluir recaptura
com identidades explícitas para histórico e correntes novos. Integrar inventário
de exclusão antes de admitir livros ativos. Depois auditar E1–E5 e executar os
gates integrais, mantendo functions90% e Rules completas. Sem commit, merge de
volta, push, deploy, servidor ou runner iniciado neste incremento.
