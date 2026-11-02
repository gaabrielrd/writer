# Writer V2 — preparação do cliente por unidades

## Resultado e aceites

Sequenciador executa uma unidade por chamada, com identidade e progresso
validados. Ação pendente é preservada antes do envio e repetida com o mesmo
operationId/checkpoint; confirmação própria é necessária para limpar a intenção.
Concorrência, erro, confirmação inválida e invalidação de conta não iniciam outro
passo. Revisão exige ação posterior explícita: não há ativação automática.

Adaptador encaminha 17 comandos preparatórios e consulta com inicialização
Firebase adiada. Projeção omite prosa/catálogos. Port de journal exige CAS
estrutural completo; adaptador durável/cifrado ainda não foi implementado.

## Arquivos

Tipos/contratos, seleção de fases, driver e adaptador em book-portability;
exportações públicas e três arquivos de teste. Nenhuma dependência ou UI nova.
[Plano 137](../tasks/writer-v2/execucao/137-preparacao-retomavel-no-cliente.md),
[ADR 0158](../decisions/0158-single-unit-restore-preparation-client.md).

## Testes — 75 casos distintos positivos em seleções

52 casos de driver/contratos, 21 de adaptador e duas integrações com serviço
real, sem rodada global única.

Primeiro lote: 69 positivos e duas integrações falharam, 28.65 s. Diagnóstico
isolado dessas duas, 2.28 s, revelou seleção incorreta depois de terminar índices:
resources-finalize permanece até a primeira unidade de auditoria. Corrigido o
cliente para ler sourceIndexes.complete e selecionar auditoria; servidor não
foi alterado para aceitar a operação indevida.

Seleção afetada: oito positivos, duas falhas e 42 casos não selecionados, 2.78 s.
As duas integrações já alcançavam revisão, mas a asserção contava transações de
leitura vazias do double como gravação. Corrigido somente o esperado para conferir
ausência de writes reais. Repetidas só as duas integrações: 2/2, 2.64 s.

Dois novos casos de identidade inválida e invalidação após limpeza de confirmação
passaram, 487 ms; 50 casos não selecionados. Não contar seleções/exclusões por
nome como skips funcionais ou testes executados. Não aumentar total por repetição.

## Comportamentos verificados

Fases/schemas conhecidos, estados de pausa, limite 16, reserva/materialização de
capa e transição de índices para auditoria; prosa omitida; conta/job/livro/token/
schema/checkpoint/ação/recibo inválidos recusados. Perda de resposta conserva
exatamente o pedido; driver novo confirma antes de escolher outra unidade.
Replay pode trazer progresso atual posterior. CAS perdido não envia nem apaga
intenção de outra aba. Uma instância recusa concorrência; duas usam CAS.
Falhas de leitura/conta e erro de checkpoint conservam dívida sem retry automático.

Integrações usam cliente TypeScript e serviço real via fronteira fechada,
serializando respostas como HTTP, banco em memória com timestamps nativos e
backups atual/JSON v6. Partem de uploaded, passam por integridade/validação e
toda preparação até auditoria, recuperam resposta perdida após commit de lore,
obtêm revisão privada válida e param com raiz ainda ausente. Chamada extra de
step não grava ou cria operação. Padrão de corpos indexados permanece false.

## Checks e limites

Formato, lint dirigido, typecheck, arquitetura, documentação e diff verificados
no fechamento. Lint inicialmente recusou a faixa de caracteres de controle no
regex de IDs; trocada por comparação explícita dos códigos, sem mudar o contrato.
Lint do arquivo corrigido passou; só cinco casos afetados foram repetidos,
5/5 positivos, 5.06 s (49 não selecionados). Revisão conferiu fronteiras, dados
usados na decisão, intenção completa, checks após waits e confirmação/CAS.

Não é Auth/App Check/Firestore/Storage de produção nem prova de IndexedDB/
Web Locks real. Não há adaptador concreto do journal, UI ou recuperação após
recarga implementados nesta etapa. Nenhum novo contrato transacional do servidor
ou Rules alterado; SDK Firestore não repetido.

Upload inicial, persistência cifrada, revisão/ativação/mídia/limpeza na interface,
roundtrip integral, inventários/writers/exclusão/legados/rollout/validate de P1,
fases 3–5 e gates humanos/comerciais permanecem. Browser/build/validate global
não repetidos; validate integral no fechamento do grande bloco P1.
Só commit local; sem CI, push, PR, merge, deploy ou subagentes.
