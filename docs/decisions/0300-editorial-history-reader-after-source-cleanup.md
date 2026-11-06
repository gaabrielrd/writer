# ADR 0300 — arquivo editorial legível após a limpeza da origem

- Estado: implementação local; testes preparados sem execução.
- Data: 2026-11-04.

## Contexto

O arquivo editorial permanece no livro após ativação. O cleanup normal da origem
remove journals e validação; usá-los como dependência permanente quebraria a
leitura posterior. Confirmações históricas não podem autorizar conteúdo atual.

## Decisão

Preservar o testemunho metadata do censo e vinculá-lo ao certificado nativo do
recibo de ativação. Reconfirmá-lo em unidades do archive v15, sem alterar o layout
v14. Separar essa prova histórica da autorização da raiz atual: dono, deleting,
restoreOrigin e nascimento nativo precisam ser conferidos em cada leitura.

Ler headers imutáveis anteriores ao selo, identidades vinculadas ao job e corpos
com nascimento próprio/commit do header. Ler partes limitadas e imutáveis antes
do header, conferindo bytes/SHA. Entregar port interno com reautorização de
consumo transacional; o consumidor confirma o SHA integral e a cadeia completa.
Não depender de journals retirados e não resolver origens externas automaticamente.

Ler pendências pela revisão imutável, primeira versão nativa e corrente atual.
Expor base/token de comparação e impedir adoção automática após edição ou
recriação. O aceite persistido com CAS permanece um escritor separado a concluir.

## Consequências

Histórico pode continuar disponível após cleanup sem manter cópias temporárias
ou conceder acesso por recibo antigo. O testemunho metadata não é um grant e
pode permanecer após a exclusão do projeto. A interface, o aceite/reconciliação,
a recaptura e a abertura pública permanecem pendentes. Testes preparados sem
execução, com cenários nativos de cleanup, timestamps, privacidade e revogação.
