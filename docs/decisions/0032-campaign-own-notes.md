# ADR 0032 — Notas autorais próprias da campanha

**Estado:** aceita e implementada; C1 validado localmente, CI pendente.
**Data:** 2026-10-15.

## Contexto

Uma base ou variante conserva autorização da origem. Notas autorais da mesa devem
continuar disponíveis ao seu dono quando a aventura/universo original deixa de
estar disponível. Misturar ambos no mesmo documento tornaria a revogação ambígua.
Uma resposta perdida também não pode recriar uma nota excluída ou aplicar texto a
outra encarnação de campanha que reutilize o ID.

## Decisão

Guardar notas em campaigns/{id}/notes, com título e texto simples escritos
explicitamente pelo usuário. Criação começa vazia e não copia base, lore ou
descrição da aventura. Autorizar pela campanha própria atual, sem consultar a
origem. Não adicionar audiência pública, editor rico, anexos ou histórico nesta etapa.

Cada nota tem revisão contínua, datas do servidor e schemaVersion 1. Lista tem
controle de revisão próprio; mutações de notas não alteram metadados da campanha,
checklist, metas, lore ou a base. Corpo e controle/recibo são atômicos. Páginas
contêm somente resumos e vinculam revisão da lista, dono e campanha no cursor.

Identificar a campanha pelo token opaco de UID, ID e createTime preciso do
snapshot Firestore, com segundos/nanos. Esse token não muda ao editar metadados
ou trocar universo e muda quando o root é recriado. Notas, controle e recibos
conservam o token; não adotar filhos órfãos de uma encarnação anterior.

Exclusão remove título/corpo e mantém tombstone mínimo. ID não é reutilizado.
Replay reautoriza e compara somente o estado confirmado da nota/tombstone;
alteração de outra nota não invalida seu recibo. Devolver revisão atual da lista.
Nova edição da mesma nota impede confirmação antiga como estado atual.

Guardar o pedido pendente integral em adaptador privado UID/campanha antes da
rede. Esse conteúdo é texto autoral próprio, não um cache derivado de base/lore;
a exceção não autoriza o mesmo journal para variantes futuras. Recuperação parte
do pedido, inclusive quando criação já ocorreu ou a nota excluída saiu da lista.

Usar Web Locks no adaptador para reservar/gravar/limpar o journal entre abas,
sem manter lock durante HTTP. Comparar operationId ao limpar e observar storage;
callback antigo não apaga pedido posterior. Sem reserva segura, preservar campos
e impedir envio. Troca de UID/alvo descarta respostas tardias. Conflito exige
descarte explícito; não buscar revisão nova para reaplicar texto automaticamente.

Preservar UTF-8 válido, espaços e quebras de linha. Rejeitar tamanho incompatível
ou string não representável sem substituição, sem truncamento. SDK direto nega
nota, controle e recibo, inclusive ao dono; acesso é pelas funções autorizadas.

## Consequências

O mestre tem um espaço autoral separado, que pode permanecer disponível quando o
leitor da base falha por origem indisponível. Privacidade derivada continua sendo
um gate próprio e uma renomeação não transforma variante em nota.

Tombstone não oferece histórico nem restauração. Exclusão integral futura da
campanha deverá limpar notas/controle/recibos. Índices são declarados no código,
sem presumir implantação. Regras/SDK locais e testes de navegador têm evidências
separadas; a fixture não comprova autorização de produção.

Ver [contrato C1](../tasks/writer-v2/execucao/16-notas-proprias-da-campanha.md) e
[base congelada](0031-campaign-frozen-bases.md).
