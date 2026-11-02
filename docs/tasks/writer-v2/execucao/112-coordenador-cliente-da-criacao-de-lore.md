# P1 / M38c5n — Coordenador cliente da criação nativa de lore

## Objetivo

Executar a criação literal por unidades no cliente: reserva permanente,
uploads limitados, composição/adoção explícita, reconciliação de respostas
incertas e cancelamento pela reserva. Preparar checkpoint privado restaurável
e controles paginados para a próxima integração durável, sem alterar journals
de edição existentes ou ativar UI sem recuperação.

## Requisitos e desenho

- Congelar dados/conta/livro/writeId antes de await; validar o domínio existente,
  sem trims/caps e sem aceitar datas autoritativas do cliente.
- Derivar IDs e manifesto antes de RPC. Campos presentes são uploads integrais,
  inclusive nome vazio/categoria padrão; ausente não equivale a vazio. Relações
  em páginas de 64, partes de 64 KiB, sem teto total menor que o contrato portátil.
- Uma unidade por avanço, pedido/CAS/bytes/operação imutáveis enquanto incertos.
  Não adotar até clique apply. Snapshot limitado sem prosa; controles até 50.
- Checkpoint contém wire privado, nunca persistir em claro. Restaurar confere
  escopo/manifesta/hash/cursores/progressos/páginas e reconstrói wire exato antes
  de qualquer RPC; abertura não envia pedido nem adota corpo atual.
- Cancel não espera produtor e usa somente controle da reserva/limpeza nativa.
  Replay/GET reconcilia adoção vencedora; sucesso deve corresponder à edição
  própria, sem cancelar cabeça ativa. Resposta tardia não reabre produção.
- Expor preparação pela sessão Auth com guarda de actor antes/depois de I/O.
  API pura permanece separada do host e armazenamento.

## Sequência e arquivos

1. Novo plano/contrato de criação e parser da metadata nativa; reutilizar
   validação de campos, codec e progressos do lore existente.
2. Novo coordenador de produção/cleanup e checkpoint/controles por criação,
   sem estender a allowlist/formato dos journals de edição.
3. Sessão Auth e exports; testes puros/integrados com serviços nativos reais
   sobre double, literais, multipart, relações, falhas, escopo e concorrência.
4. Testes dirigidos, tipos/lint/build quando necessário, revisão, ADR/docs/
   evidência/commit local. Validate integral no fechamento de P1.

## Aceite e limites deste incremento

Criação percorre reserva até ready sem cabeça, aplica por ação explícita uma
única vez e cancela/coleta sem alterar original ou livro alheio. Pedido perdido
é repetido exatamente; adoção própria pode ser confirmada por metadata. Estado
de conflito preserva texto/controles e nunca é anunciado como sucesso próprio.

Não declarar recuperação durável antes do ticket/cópia cifrada/checkpoint
integrados ao armazenamento. Essa integração e o host de criação/exclusão são
os próximos passos obrigatórios, junto de lifecycle de chaves, demais writers/
consumidores/backup/rollout. Sem UI ativa, nova dependência, CI ou envio remoto.
P1/F2-09/V2 e fases restantes permanecem abertos.

## Resultado

Coordenador, parser/planejamento, checkpoint/controles e sessão Auth
implementados. 209 Vitest distintos positivos (50 novos), incluindo >8 MiB/
128 partes, 54 uploads e cancel/adoção/CAS/reautorização. Revisão corrigiu
contador após resposta tardia, coerência do checkpoint e guards de leitura.
Tipos/build/bundle/smoke e lint dirigidos passaram. Ver
[ADR 0127](../../../decisions/0127-client-native-lore-creation-coordinator.md) e
[entrega](../../../entregas/2026-10-24-writer-v2-coordenador-cliente-da-criacao-de-lore.md).

Ticket/cópia cifrada/checkpoint persistido, confirmação de reserva incerta,
cancel/descarte e host permanecem próximos passos obrigatórios. Nenhuma
recuperação durável ou entrada do compêndio declarada concluída.
P1/F2-09/V2, demais fases/gates abertos; sem CI/push/PR/deploy.
