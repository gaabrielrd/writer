# P2 — validação retomável e índice de unidades da aventura

Base: 96c6864, validate integral verde em 167. Este incremento prepara o núcleo
por etapas que o transporte remoto usará; não reserva, publica ou ativa projetos.

## Descoberta e requisitos

Grafo writer-v2 consultado, sem resultado suficiente. Conferidos
readAdventurePackageStep/portableBackupContainer, adventureContentMachine,
bookRestoreValidationStep/Store e fixtures nativas atuais. Preservar o domínio
próprio de aventura e o leitor contínuo de 167.

Cada chamada deve reabrir checkpoint do host, aceitar um frame de até 64 KiB,
finalizar uma unidade JSON de até 8 MiB/128 spans, ou resolver até 64 relações.
Estado até 64 KiB, sem prosa/payload; índice até 16 KiB por item. Hash e UTF-8
devem sobreviver a engines novas e serialização entre todas as chamadas.

JSON será relido por posições após reconhecer o fim da unidade. O hash dos
bytes recebidos nos frames deve acompanhar o checkpoint e ser comparado na
releitura, antes do uso semântico. Só offsets ou tamanho não certificam a origem.
O lookahead não é confirmado ao finalizar JSON; o passo seguinte relê esse frame.

## Implementação sequencial

1. initial/read snapshot fechados, limites, fases frames/semantic/done e
   coerência de fonte, parser, máquina, JSON pendente, itens e envelope.
   Checkpoints e índices são estado confiável do host, nunca do arquivo/cliente.
2. Fonte/read/signal/port fixados antes do primeiro await. Conferir tamanho e
   retorno exato; guard/abort em cada I/O e antes de retornar estado.
3. advance com estado clonado: um frame, uma unidade ou um lote de relações.
   Host fornece índice/addItem com buffer transacional, descartável em erro.
   Não fazer persistência parcial utilizável nem retry automático de buffer sujo.
4. Ponteiro por JSON: record, spans, bytes/SHA e, quando houver texto/PNG,
   manifesto/layout/cursor de início raw. Não copiar prosa no índice/checkpoint.
   Registrar ponteiro uma vez; raw permanece validado incrementalmente.
5. Reabertura limitada de JSON verifica spans/tamanho/hash antes de decodificar.
   Resultado stepped-content-only só após EOF/envelope e fechamento semântico,
   sem conceder acesso, propriedade ou autorização remota.
6. Testes com arquivo real: comparação com leitor contínuo, importação, vazio,
   arquivo, Unicode/corte e PNG/draft; nova engine/serialização por chamada;
   limites/duplicação/tamper com framing válido, fonte alterada na releitura,
   short-read, abort, rollback/retry do buffer e snapshot inválido.
7. Checks dirigidos, revisão, ADR/docs/evidência e commit local. Não repetir a
   suíte integral recém-verde sem novo risco; próximo fechamento no bloco remoto.

## Limites e continuidade

Sem endpoint/Rules/UI/restauração neste núcleo. A futura coordenação remota
precisa autenticar job/operação/birth/checkpoint e os bytes em cada transação,
reconferir fonte completa e limpar staging. O arquivo e este relatório não dão
grant. O transporte e restauração seguem como blocos seguintes, sem omitir
remap/mídia/draft em versão separada/ativação privada/roundtrip/consumidores.

Histórico nativo requer raiz nascida antes das versões. Resolver invisibilidade
e nascimento ao planejar o stager, auditando leitores/Rules, sem fabricar tokens
ou timestamps. Não presumir que a ativação de livros atende à aventura.
P2/P3/D/F2-09, gates e contagem 8/35 permanecem abertos.

## Aceites

- [x] Retomada limitada com estado/engine novos e comparação independente.
- [x] JSON relido e ponteiros conferidos por bytes/SHA, sem prosa no estado.
- [x] EOF e relações antes de qualquer relatório positivo; erros/abort sem avanço.
- [x] Testes dirigidos e revisão/checks/docs/commit local, sem declarar restore.
