# ADR 0064 — Leitura interna do conteúdo validado para restauração

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M20](../tasks/writer-v2/execucao/53-leitura-autenticada-dos-itens-validados.md).

## Decisão

O materializador consumirá somente itens produzidos pela validação servidor,
por openVerifiedBookRestoreContent, interno à fábrica. O método não integra
BOOK_RESTORE_METHODS, exports HTTP/callable ou regras SDK. Não recebe DTO, spans,
cursor ou prova vindos do cliente. Não grava recursos.

A abertura exige content-verified, reserva/marcador com nascimento válido e raiz
de destino ausente. Reutiliza a autenticação do snapshot pelo primeiro recibo,
checkpoint e hash; reconstrói relatório e resumo para conferir o resultado final.
Fixa tokens nativos de controle, snapshot e recibo inicial. A cada leitura e
verificação esses documentos continuam na mesma geração/atualização.

Ponteiros de validationItems usam a mesma proteção imutável de validationIndex:
contexto, index, operação criadora, nascimento simultâneo ao próprio recibo de
validação e createTime igual a updateTime. Nenhum efeito é adicionado ao store.

## Leitura e uso transacional

JSON do contêiner vem dos spans nativos, até 128 partes/8 MiB por item, com
tamanho e representação canônica conferidos. Legado reproduz um item por catálogo
e cursor privados M18; record, hash, tamanho e localização precisam coincidir.
Índices usados na reprodução também conservam a origem nativa.

Cada item oferece verify(tx). O futuro escritor deve executá-lo antes das
escritas, na mesma transação. São reconferidos controle/reserva/marcador/destino,
snapshot/recibo inicial, ponteiro/recibo criador, índices observados e as provas
dos chunks lidos. Observações anteriores não são substituídas por um cache atual.
Cancelamento ou recriação durante a preparação impede seu uso.

Histórico, rascunho e PNG são sequências raw por quadros, com identidade/ordem,
UTF-8 completo ou assinatura PNG, contagem/tamanho e hash incremental. Cada parte
oferece sua própria verify(tx), incluindo o item de origem. As provas raw não
crescem com a extensão do texto/mídia; a sequência não acumula o corpo completo.
O materializador ainda precisa vincular seus checkpoints/recibos e limpeza; esta
API interna de leitura não constitui protocolo de escrita ou retomada pública.

Uma prova de integridade recriada após a preparação invalida aquela observação.
Uma leitura nova pode confirmar a mesma prova de conteúdo do chunk original
inalterado: M14 liga sua identidade nativa ao payload da prova. Não confundir esse
caso com recriação de chunk, ponteiro, índice, controle ou recibo de origem.
No Firestore real, set do payload idêntico pode ser no-op; testes de ABA usam
exclusão/recriação efetiva, sem presumir alteração de updateTime.

## Texto salvo e rascunho

O operador confirmou em 2026-10-22: ao restaurar, manter texto salvo no
manuscrito e recuperar rascunho diferente como versão separada. Não aplicar
autosave do rascunho sobre o texto salvo. Ambos devem ser preservados, inclusive
rascunho vazio ou de recurso removido, sem recriar silenciosamente recurso atual.
A escrita dessa versão pertence ao materializador seguinte.

## Limites desta etapa

Nenhuma coleção, dependência, Rule, callable ou efeito de Storage novo. Cleanup
v3 permanece suficiente para o inventário atual. Antes de novos writers, ampliar
inventário e compatibilidade; faltam remapeamento, documentos nativos/ledger,
personas, mídia, reautorização/ativação, host/UI/roundtrip e validate integral P1.
Não conceder acesso de universo por conteúdo validado ou procedência do arquivo.
