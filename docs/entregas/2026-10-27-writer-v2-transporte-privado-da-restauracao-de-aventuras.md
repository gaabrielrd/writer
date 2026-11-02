# Writer V2 — transporte privado da restauração de aventuras

Data: 2026-10-27. Implementação interna, com validação dirigida.
Base f3704a0; [plano 169](../tasks/writer-v2/execucao/169-transporte-privado-da-restauracao-de-aventuras.md)
e [ADR 0191](../decisions/0191-adventure-private-restore-transfer.md).

## Implementado

Serviço de início/resolução de início, consulta/paginação, append, integridade,
resolução de operação, cancelamento e limpeza. Inputs/saídas fechados,
fingerprints/target/token próprios, fonte v1/tamanho/SHA/revisão fixados.
Não importar serviço de livro por cast, expor prosa ou conceder grants.

Job/reserva/raiz mínima/start-op nascem no mesmo commit. A raiz não tem ownerId,
título, status ou texto; Studio, SDK, editor e backup recusam seu uso. Nasce
antes do histórico futuro, mantendo compatibilidade nativa. Ao cancelar, conserva
marcador mínimo privado e reserva, impedindo reuso/replay do ID aposentado.

Append de até 64 KiB por checkpoint, com SHA/base64/cadeia conferidos. Integridade
independente em lotes até 16, SHA retomável, manifesto de membership e provas
fixadas no nascimento/versão nativos de chunks. Estado SHA é privado e imutável
por operação; não aparece no metadata. Pode conter cauda limitada do arquivo.

Artefatos conferem contexto, recibo criador, birth e hash antes de uso/remoção.
Estado atual exige recibo exato do checkpoint atual e hash do job; replay retorna
recibo histórico separado do progresso recente. Limpeza em páginas até 50 remove
arquivo/provas/estados, recusa órfãos/recriações/faltas e reconfere namespaces.
Não apaga raiz alheia ou autoria inesperada sob a reserva.

## Testes dirigidos

22 Node distintos positivos em seleções. Incluem início/replay/fences, colisão e
invisibilidade, SHA real/mismatch, base64/posição/formato/limites, UID/token,
paginação, concorrência, rollback e retry automático, ABA em raiz/reserva/op/job/
chunk, corrupção de estado SHA, cancelamento tardio, fonte órfã/mudada, recibo
fechado e limpeza com falta/reaparecimento/autoria inesperada.

Arquivo de 54 chunks passou em lotes de 16 e limpeza em páginas de 50, com
digest integral idêntico e 54 chunks/54 provas/três estados removidos (177,897 ms
de teste; 483,988 ms total). A prova nativa destinada ao leitor semântico passou
em 25,659 ms/325,013 ms total. Medidas são locais, não benchmark de produção.

Seis SDK distintos positivos em seleções, Firestore 1.22.0 demo em 127.0.0.1,
JVMs próprias encerradas no finally. Primeiros cinco passaram em 18.870,050 ms:
nascimento atômico, permissões/invisibilidade com filhos preparados, nenhuma
permissão SDK de jobs/chunks/SHA/recibos/fences/reservas, corrida real,
SHA retomável, cleanup e ABA em commits separados.

Seleção final de três passou em 13.920,167 ms: concorrência/replay e limpeza
repetidos por causa da correção de checkpoint, mais caso negativo novo de job
adulterado. São seis SDK distintos, não oito novos casos ou suíte global.

## Falhas encontradas e corrigidas

Lint encontrou import ausente de chunkChain, corrigido antes dos contratos.
O primeiro arquivo Node usava nome incorreto de factory de cenas; corrigido para
a exportação real, sem alterar comportamento ou asserções de produção.

A revisão encontrou falha real de integridade do estado: lastOperationId podia
apontar para recibo antigo, e o loader só comparava hash/data quando checkpoints
já eram iguais. Um teste RED demonstrou get aceitando checkpoint adulterado.
Agora o loader exige igualdade exata com o recibo atual; a proteção de hash e
updateTime/birth se aplica obrigatoriamente. Cinco Node dirigidos passaram após
a correção, incluindo replay/cancelamento; SDK reproduziu a rejeição real.

## Checks e limites

Lint/formatação dirigidos e sintaxe de 329 módulos positivos. Checks finais de
docs/arquitetura/styleguide/diff acompanham o commit. Rules só acrescentam deny
explícito dos quatro namespaces privados; testes SDK validam as regras reais.
Nenhum TypeScript de produto/UI, endpoint ou composição de Functions alterado.
Sem build, navegador ou validate global novos; o verde de 167 é base anterior,
não evidência deste código. Nova rodada integral no fechamento maior remoto.

O serviço ainda não deve ser exposto a cliente real: faltam recuperação cifrada,
coordenação semântica persistente e fonte com revalidação das provas em cada I/O,
revisão/remap/estrutura/mídia, contadores/ativação privada, UI e roundtrip.
bytes-verified não aprova arquivo autoral nem certifica acesso externo.
Raiz reservada ainda não é projeto utilizável, e sua futura ativação precisa
das provas próprias. Hash state é sensível apesar do tamanho limitado.

P2/P3/D/F2-09 e gates humanos/comerciais permanecem abertos; 8/35 inalterado.
Somente commit local e hooks normais, sem CI/push/PR/merge/deploy/subagentes.
Nenhum processo ou rascunho do servidor Vite do usuário foi encerrado.

O auxiliar de fechamento tentou passar firestore.rules ao Prettier, que não tem
parser dessa linguagem. Corrigida somente a seleção de arquivos desse auxiliar;
Rules permanece coberta pela compilação/testes SDK e pelo diff/LF. O fechamento
seguinte de docs/arquitetura/styleguide/formatação/diff passou, sem alterar
configuração global ou repetir testes de código por mudança documental.
