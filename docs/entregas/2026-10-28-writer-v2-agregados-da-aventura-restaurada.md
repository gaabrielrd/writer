# Writer V2 — agregados da aventura restaurada

Data: 2026-10-28. Base: 10708fd.
[Plano 183](../tasks/writer-v2/execucao/183-agregados-da-aventura-restaurada.md)
e [ADR 0205](../decisions/0205-adventure-restored-aggregate-reconciliation.md).

## Implementado

O serviço interno reconstrói agregados de blocos/cenas/partes e os registros do
ledger antes da futura ativação. O primeiro salvar, arquivar e restaurar pode
usar os escritores atuais sem somar novamente as palavras já copiadas.
Blocos arquivados reservam ordem; cenas arquivadas, sem parte e órfãs preservam
seu texto, com contribuição zero ao manuscrito. Não são criados pais artificiais.

Três passagens limitadas sobre o índice autenticado recompõem blocos, cenas/
controles narrativos e links. referenceCount soma o source direto. Alvos,
journals, checkpoint e recibo confirmam juntos, com provas nativas e replay antes
da leitura. O ledger existente é reutilizado por proxy, sem writes fora do journal.
Cancelamento conserva revogação de personas/fences de imagens antes da limpeza.

counts-ready não ativa o projeto. Raiz reservada continua privada, personas
preparing e controle countReady false. Não há callable ou UI novos.

## Testes e validações

Sete testes Node novos distintos passaram em seleções: cópia sem parte e links
diretos, arquivo vazio, replay/CAS, ACK perdido, rollback, corpo alterado/recriado
e cancelamento em todas as quatro fases. A primeira execução conjunta teve
seis positivos e um reprovado: a injeção de rollback observava apenas update,
mas o journal usa set. A injeção passou a observar ambos; o caso passou em
824,953 ms, 1.083,635 ms totais, sem alterar o serviço ou enfraquecer a assertiva.

Dois testes Vitest com arquivo real do Writer passaram em 4,05 s totais/
1,60 s de testes. Cobrem partes, cenas/blocos arquivados, ordem reservada, texto
órfão e primeiro salvar/arquivar/restaurar sem duplicar o ledger. A simulação
explícita do gate existe somente para exercitar escritores atuais, e não prova
ativação produtiva. A primeira execução encontrou a revisão estrutural derivada
dos blocos na comparação com a projeção inicial; esse campo passou a ser tratado
como agregado reconstruído, mantendo validação do estado, hash e provas nativas.

Quatro regressões selecionadas da materialização de imagens passaram em
2.299,609 ms: intenção anterior ao I/O, vínculos nulos, revogação/fence antes da
limpeza e cursor/contadores privados.

Um teste com SDK real do Firestore passou em 175.897,237 ms totais no emulador
demo 1.22.0, porta loopback dedicada. Comprovou concorrência idempotente, rollback
do commit após os writes planejados, retomada sem duplicação, nascimento conjunto
de source/journal/recibo, Rules privadas, contagem direta de marco e limpeza
dos namespaces do ledger. JVM dedicada encerrada no finally; processos ausentes
na conferência posterior.

Formatação, ESLint/sintaxe dos arquivos alterados, docs, arquitetura, styleguide
e diff dirigidos positivos. Revisão final verifica provas de ausência e alvos
lidos pelo ledger, limite de oito artefatos por unidade e compatibilidade de
metadados/cleanup das fases anteriores.

A suíte integral não foi repetida após este incremento: o último validate
completo é de 10708fd (fechamento de 180–182), não é atribuído ao código novo.
O próximo grande bloco conserva seu gate integral, conforme orientação de
testes dirigidos por ajuste. Nenhuma cobertura, teste ou limite reduzido.
Sem CI remota, push/PR/merge/deploy ou subagentes.

## Limites

Este incremento não certifica todos os artefatos para ativação nem disponibiliza
biblioteca/usos/URLs. Auditoria/ativação, aceitação/URL, recuperação/UI/roundtrip,
P2/P3/D/F2-09, fases 3–5 e gates humanos/comerciais permanecem pendentes.
Macro 8/35 inalterada. Não houve teste em bucket ou banco de produção.
