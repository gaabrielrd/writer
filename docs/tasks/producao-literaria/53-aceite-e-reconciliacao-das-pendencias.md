# Incremento 53 — aceite e reconciliação das pendências restauradas

## Critérios e escopo

Concluir o escritor que faltava à base de comparação do incremento 52. O autor
pode manter o estado atual, inclusive um plano removido, ou selecionar novamente
referências para um plano existente. As referências precisam ser reautorizadas
na transação; nenhum vínculo histórico é promovido por nome ou disponibilidade
antiga. A reconciliação não substitui campos, título, estado do plano ou prosa.

Os métodos reviewBookEditorialRestore e getBookEditorialRestoreReviewOperation
continuam internos na composição de bookRestoreUpload. Não foram registrados
como ações públicas, nem houve habilitação da restauração/interface v2.

## Escritor nativo compartilhado

A preparação transacional de saveLiteraryPlan foi extraída para
prepareLiteraryPlanSave em literaryPlanWrite. O fluxo normal mantém DTO,
fingerprint, recibo, CAS, autorização das fontes, no-op, índice e versões.
A extração permite compor os mesmos efeitos com o aceite na transação do caller,
sem chamar uma transação aninhada ou duplicar o escritor.

A reconciliação compõe exclusivamente references sobre a corrente lida, preserva
seus demais campos e reutiliza esse port. Referências possuem sourceToken/revisão
nativos atuais, não o formato portátil do arquivo. Alteração, remoção, recriação
ou perda de autorização de uma fonte impede todos os writes. A política vigente
de referências subject/source do escritor normal foi preservada.

## CAS e escolhas explícitas

O reviewToken inclui origem, revisão original, primeira versão nativa, corrente,
resolução existente e o literaryRevision protegido da raiz. Uma edição editorial
ou um aceite anterior invalida uma base antiga, mesmo quando o texto da corrente
não mudou. O port de leitura foi extraído para uma função transacional comum;
o mesmo estado é usado na leitura e no commit do escritor.

- keep-current: registra a revisão sem alterar contrato, plano ou prosa. Não
  restaura um recurso removido nem repõe política de colaboração/publicação antiga.
- reconcile-references: exige plano atual existente e lista explícita de até12
  referências. Grava plano/versão/índice pelo escritor normal quando há alteração.
  Uma seleção explicitamente vazia também é válida; no-op não cria versão inútil.

Corrente, fontes e recibos são lidos antes de qualquer write. Resolução,
operação e raiz são gravadas no mesmo commit; quando necessário, plano,
primeira versão nova e índice também participam dele. A raiz avança updatedAt e
literaryRevision uma única vez; literaryContextRevision avança quando o plano
muda. O arquivo histórico e a revisão original permanecem imutáveis.

O contrato mantém o modo atual: a restauração começou em orientação, mas uma
escolha posterior explícita do autor não é desfeita pelo aceite. Nenhuma escolha
de aceite cria publicação, job de IA, débito ou consentimento contínuo.

## Recibos e recuperação

Cada revisão original admite uma resolução imutável, em
literaryRestoreReviewResolutions. Os pedidos têm namespace próprio,
literaryRestoreReviewOperations. Ambos armazenam somente metadata: escolha,
IDs, hashes, vínculo nativo, revisão, resultado e data. Não guardam prosa,
conteúdo do plano, lista de referências, URLs, chaves ou credenciais.

O ID exato do pedido confirma o resultado histórico depois de edições ou
revogação de fontes, sem reexecutar o escritor e sem conceder acesso atual a
essas fontes. Intenção diferente com o mesmo ID é recusada. Uma segunda operação
não sobrescreve a resolução original. Consultar um pedido ausente retorna
unconfirmed; isso não autoriza reenvio automático.

Recibo e resolução precisam ser imutáveis, do mesmo nascimento e ligados à
origem/revisão original. Ausência de apenas um membro é inconsistência, não
pendência nova. O clock editorial também impede reaplicar o wire antigo se
ambos forem perdidos depois de um aceite. Toda consulta e repetição continua
exigindo autorização atual da raiz; exclusão ou perda de dono não vira fallback.

A leitura separa reviewState do estado atual da corrente. Um aceite continua
histórico após novas edições, e currentChangedSinceAcknowledgement sinaliza
mudanças de revisão/hash/nascimento. A pendência antiga não reaparece como um
rascunho automaticamente aplicável. A contagem reviewsRequired da revisão de
ativação é inicial; ela não representa o painel atual de pendências.

## Ciclo de vida antes do primeiro produtor

bookEditorialStorage e bookEditorialArchiveDeletion incluem os dois namespaces
novos. A exclusão normal do livro os retira em páginas limitadas e os confere
antes da raiz; deleting bloqueia novos aceites e replays. A limpeza da origem de
restauração preserva esses recursos do livro, assim como preserva seu arquivo.

Restaurações sem raiz exigem ausência dessas coleções antes da materialização e
novamente na revisão/ativação. Essa conferência é adicional e não altera o layout
nem o contexto do censo v15. Recursos inesperados não são adotados ou apagados.
As Rules explicitam a proibição de leitura/escrita SDK nas duas coleções; nenhuma
permissão foi aberta. Writers e Rules permanecem locais, sem implantação.

## Testes preparados, sem execução

Foram preparados **26 casos Node e 2 casos SDK**:

- Manter corrente sem alterar conteúdo e reconciliar fontes com commit conjunto.
- Preservar campos manuais, recusar base antiga, manter recurso removido ausente.
- Contrato em orientação e recusa de referências portáteis como grants.
- Fonte alterada/removida/recriada, inclusive revogação de outro volume.
- Recibo histórico depois de novas edições/revogação e leitura atual da fonte
  explicitamente indisponível pelo serviço normal.
- Pedido exato, intenção divergente, concorrência, rollback e retry.
- Dois pares de metadata recriados/ausentes, perda de ambos e clock avançado.
- No-op explícito, dono/deleting, cleanup da origem e exclusão das novas coleções.
- Dois namespaces estranhos bloqueiam ativação sem adotá-los; pedidos fechados.
- SDK nativo confere timestamps do plano/raiz/resolução/recibo no mesmo commit,
  privacidade, fonte revogada, CAS e concorrência, com exclusão final.

As fixtures percorrem o protocolo v2 até ativação, sem semear raiz ou grant.
Uma ficha de ato própria é criada com nascimento nativo e selecionada pelo leitor
normal de referências. O SDK usa emulador demo; não é validação HTTP
Auth/AppCheck nem jornada pública de interface.

Nenhum teste, syntax/type/lint/formatter/build/browser/coverage/validate ou
diff-check foi executado neste incremento. A extração do escritor normal exige
regressão da suíte literaryPlanning no próximo gate. Os resultados anteriores
5.898/5.480 não validam os incrementos 51–53.

## Continuação do plano integral

Integrar painel e seleção de referências com revisão explícita, pedido congelado,
recuperação pelo namespace próprio e tratamento de conflito sem descarte de
rascunho. Completar recaptura agrupada, incluindo a decisão de revisão como
histórico sem grants, preservando JSON de até8MiB sem expandir IDs ou duplicar
correntes. Só então abrir a fronteira pública/clientes e admitir novas cópias.
Auditar E1–E5 e executar os gates antes da integração, reconferindo a principal;
resolver cobertura90% e Rules completas. Não houve commit, mergeback, push,
deploy, servidor ou runner iniciado. Objetivo ativo, cinco etapas abertas.
