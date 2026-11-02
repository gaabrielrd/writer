# ADR 0208 — Ativação atômica da aventura restaurada

- Data: 2026-10-28.
- Estado: implementado internamente; validação dirigida, sem endpoint/UI.
- Plano: [186](../tasks/writer-v2/execucao/186-ativacao-atomica-da-aventura-restaurada.md).
- Antecedentes: [0206](0206-adventure-private-native-audit.md) e
  [0207](0207-adventure-image-library-preparation.md).

## Decisão

A revisão final exige conteúdo verificado, biblioteca instalada e auditoria física
posterior à instalação, mesmo sem imagens. Confere selo/anchor nativos, definição,
contagens, índice narrativo, lote de personas e metadata/universo originais pelo
reader verificado. O resumo privado contém título limitado e contagens; seu token
fixa contexto/provas e disponibilidade observada do universo. Não transmite corpos
do manuscrito nem publica ou compartilha material.

activateAdventureRestore exige revisão e checkpoint exatos. Revalida tudo na
transação final, inclusive acesso à mesma encarnação do universo. Mudança de
disponibilidade exige nova revisão explícita. Em cinco writes, ou sete com universo,
substitui a raiz reservada, libera countReady, ativa o lote e confirma job/recibo.
Universo entra no mesmo commit. Não percorre todos os perfis/imagens na ativação.

A raiz nasceu com o início do job: set preserva createTime; updateTime deve coincidir
com o nascimento do recibo de ativação. Preserva createdAt autoral preparado e avança
updatedAt monotonicamente. Não aplicar a regra de livros cuja raiz nascia somente na
ativação. Prosa, arquivo, histórico e pares da biblioteca não são regravados.

O estado activated exige DTO fechado vinculado ao checkpoint final e ao fingerprint
original. O job fica congelado para manter as provas de personas. Finalização de mídia
e coleta da fonte devem usar controles posteriores separados. Imagens permanecem
preparing/URL null; ativar a aventura não declara mídia publicada ou concluída.

## Recuperação e autorização

Após ativar, get/replay validam job, reserva e recibos nativos sem ler a raiz atual.
Editar, excluir ou recriar o projeto não apaga a confirmação nem concede acesso ao
substituto. Personas instaladas pertencem à biblioteca da conta e preservam a prova
de seu lote mesmo após excluir a aventura. Cancelamento e cleanup pré-ativação
recusam activated, sem reaproveitar o protocolo para apagar projeto ativo.

retireAdventureRestoreActivation usa o mesmo ID e fingerprint do pedido de ativação
incerto. Confirma o resultado se já houve commit; caso contrário avança checkpoint/selo
e grava encerramento, sem ativar. Um pedido atrasado retorna esse encerramento.
Nova tentativa usa nova revisão e ID. Override de fingerprint é privado e restrito a
essa transição; o cliente não escolhe a ação usada no hash.

## Validação e limites

Testes dirigidos cobrem atomicidade/rollback de todos os writes, CAS/replay, resposta
perdida, encerramento e atraso, provas nativas alteradas/recriadas, revisão e universo,
histórico sem raiz, personas e ajustes do editor usando ativação real.
Resultados executados ficam na
[evidência](../entregas/2026-10-28-writer-v2-ativacao-atomica-da-aventura-restaurada.md).

Sem dependências, índices, Rules ou endpoints novos. Finalização de mídia, coleta da
fonte, recuperação/transportes/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e gates humanos/
comerciais permanecem abertos. Macro 8/35 inalterada; validate integral no fechamento
do próximo grande bloco, conforme orientação do operador.
