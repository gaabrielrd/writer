# ADR 0084 — Instalação das personas restauradas

- Status: aceito para o instalador interno
- Data: 2026-10-23
- Contexto: P1 M36b, depois da ADR 0083

## Problema

Definições privadas já preservam as personas usadas no livro e a contribuição
exclusiva do rascunho. A cópia precisa entrar na biblioteca sem substituir
perfis existentes, sem um lote de gravações proporcional ao catálogo e sem
liberar seleção/edição/IA antes da ativação completa do livro.

## Decisão

Inventário de cancelamento v14 e progresso de preparação v11 são gravados na
mesma transação do primeiro lote/perfil global. Antes disso, conferir ausência
do lote reservado, de perfis do mesmo bookId e dos journals globais desse job.
Uma colisão impede a migração sem adotar, sobrescrever ou excluir o registro.

advanceBookRestorePersonaLibrary percorre preparedPersonas por ID, um perfil
por transação. Confere journal/recibos/nascimento/última alteração da definição
e sua projeção/hash canônicos. Copia o snapshot literal para
users/UID/aiPersonas/custom-hex64, acrescentando somente restoreOrigin M36a.
Arquivo, revisão, datas, espaços e BOM permanecem. Unicode malformado e revisão
fora dos inteiros seguros são recusados pelo projetor portátil, evitando
conversão nativa com perda; os limites válidos existentes não foram reduzidos.

Cada perfil global recebe journal tipado persona-library-profile. Cópia,
journal, cursor/contador, lote e recibo são atômicos. Repetição, concorrência e
retry usam o protocolo existente; o clone de progresso é local à tentativa.
Não reunir biblioteca/projeto inteiro em RAM nem limitar quantidade de perfis
pela capacidade de uma transação. Não instalar perfis presentes apenas no histórico.

personaLibrary contém schemaVersion 1, installed, after e revoked; campos são
fechados, inteiros seguros e cursor custom-hex64. Ao esgotar definições, exigir
igualdade com o total validado e avançar a resources-finalize, mantendo o cursor
do arquivo, raiz ausente e countReady false.

## Lote permanente e prova compartilhada

users/UID/aiPersonaRestoreBatches/bookId é controle permanente, separado dos
artefatos temporários e de artifactCount. Mantém identidade M36a, state preparing,
profileCount histórico e IDs dos recibos inicial/último.

readPersonaRestoreBatchProof compartilha provas nativas dos estados:

- Primeiro recibo sempre advanceBookRestorePersonaLibrary/content-verified,
  imutável e com nascimento igual ao lote.
- Último preparing: mesma ação/estado; cancelled:
  advanceBookRestoreCleanup/cancelling; active:
  activateBookRestore/activated.
- Última alteração do lote igual ao nascimento do último recibo imutável.
  Escopo, token, fingerprint e checkpoints válidos; instalador/limpeza ainda
  conferem contagem e que recibos não ultrapassam o checkpoint do job.

Recriação/ABA do lote ou recibos não herda autorização. Consumidores continuam
aceitando somente active; esta entrega nunca ativa um lote.

## Cancelamento e retenção

Cancelamento v14 começa em persona-library. A primeira unidade autentica o lote
preparing e o marca cancelled, com revoked true, antes de cover-storage e das
limpezas anteriores. Essa transição/recibo é atômica e não exclui os perfis ainda.

Limpeza genérica remove somente cópias globais com journal tipado, nascimento e
última alteração próprios. Não ler instruções para excluir; certificar ausência
de cópias/journals do bookId ao final. Biblioteca atual, outros jobs/UIDs e
encarnações recriadas são preservados. Conservar lote cancelled e seus recibos;
profileCount registra quantas cópias foram instaladas, sem decremento na limpeza.
Inventários v1–v13 e seus recibos continuam aceitos.

Lotes/recibos ativos continuarão após exclusão do livro. A futura limpeza
pós-ativação deverá aposentar journals sem excluir as personas globais; não
reutilizar cancelamento para esse fim.

## Sequência e limites

Instalador é interno, sem callable ou comando cliente novo. Implantar gates,
Rules e cliente M36a antes de habilitar produtores; nenhum deploy foi feito.

Faltam disponibilização da capa, campos grandes/consumidores, certificação e
ativação final, limpeza pós-ativação e host/UI/roundtrip/validate integral.
P1/F2-09 e Writer V2 permanecem abertos. Sem dependência, crédito, alteração
visual, subagentes ou CI/push/PR/deploy novos.
