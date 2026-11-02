# ADR 0070 — Coleta e exclusão física dos corpos de capítulo

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M26](../tasks/writer-v2/execucao/59-coleta-e-exclusao-dos-corpos.md).

## Decisão

bookChapterCleanup oferece um planejador de limpeza, serviço e handler internos.
O planejador confere contexto, manifesto, pins/estado e metadados nativos de até
50 partes por transação. Usa máscaras sem bytes/prosa. Parte deve ter índice/
identidade/tamanho/hash bem formados, nascer com o corpo e permanecer imutável.
Isso confere pertencimento; não recalcula o hash dos bytes durante a limpeza.

Remover partes antes do cabeçalho. Página vazia é necessária para remover o pai.
Alteração, recriação de parte, contexto inválido ou revisão inválida interrompem
a página inteira. Gerações schema 1 conhecem somente a subcoleção chunks; não é
coleta forense de órfãos arbitrários produzidos fora do protocolo.

## Worker e continuidade

collectUnusedBookChapterText é onDocumentUpdated privado para
books/{bookId}/bookTextBodies/{bodyId}, configurado com retry, até três instâncias,
concorrência um por instância e 256 MiB. O handler verifica escopo do evento e
fixa o createTime recebido; o serviço relê raiz e corpo nativos na transação.
Evento antigo não apaga outra encarnação. Evento repetido continua outra página
ou encerra se o corpo já saiu; não recria documento.

Coleta normal só remove unreferenced/pins zero de livro ativo próprio. Corpo
referenciado é preservado; raiz ausente ou em exclusão é adiada para o protocolo
de exclusão integral. Cada lote de filhos atualiza gcRevision junto dos deletes,
produzindo o próximo evento. O lote final remove cabeçalho, sem novo evento de
update. Não depende do navegador nem expira versões.

A prova local invoca o handler com snapshots reais; a entrega Eventarc produtiva
continua dependendo da implantação e de verificação operacional, não executadas.

## Inventário de exclusão do livro

deleteSceneBook registra cleanupVersion 2 e acrescenta text-bodies após os recursos
planos, incluindo versões. Com raiz revogada, drena os corpos mesmo quando pins
ainda representam referências removidas pela exclusão integral. Continua conferindo
dono/contexto/nascimento das partes, sem apagar outro livro ou universo.

Jobs sem versão/v1 preservam operação/cursor/contagem e passam para v2. Finish
antigo também confere corpos: se restar cabeçalho, volta para text-bodies antes de
remover raiz, vínculo e gravar tombstone. Finalização confere esse namespace
novamente. Versão/fase desconhecida e contagem inválida falham sem exclusão.
Compatibilidade de receipts/checkpoints e replay existente permanece.

## Implantação e pendências

Implantar leitores, exclusão v2 e coletor antes dos escritores que passam a criar
corpos externos. Confirmar revisão ativa e drenar invocações antigas de exclusão;
só então habilitar produtores e clientes compatíveis. Atualização de inventário
não torna um binário antigo compatível. Nenhum deploy foi feito.

100 testes Node dirigidos e três SDK distintos passaram; o arquivo/caso afetado
por limite explícito nos loops de teste foi repetido. Faltam conversão e chat
aplicador, demais recursos/campos grandes, personas/mídia, autorização/ativação e
host/UI/roundtrip/validate integral. P1/F2-09 continuam abertos. Somente commits
locais, CI ignorada.
