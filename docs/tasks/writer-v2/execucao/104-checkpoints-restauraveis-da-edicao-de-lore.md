# P1 / M38c5f — Checkpoints restauráveis da edição de lore

## Objetivo e escopo

Transformar o coordenador manual em uma operação reconstruível, com contrato
explícito distinto do snapshot de status. Preservar intenção/CAS, progresso de
todos os jobs, cursores e pedidos exatos, inclusive produção e cleanup concorrentes.
Nenhuma chamada RPC ou aplicação acontece ao reconstruir.

Este incremento prepara o contrato e sua integração com a sessão autenticada.
Persistência automática dos checkpoints no journal e host visual serão a
composição seguinte; não anunciar retomada visual completa por este contrato.

## Requisitos, suposições e sequência

1. Exportar checkpoint versionado/fechado, imutável, com identidade/intenção,
   fase/cancelamento, contadores e cursores de inicialização/reserva/produção/
   cleanup, progresso da inspeção/edição e pedidos exatos dos três slots.
   Checkpoint contém bytes privados de pedidos: futura persistência deve cifrá-lo.
2. Controles de todos os uploads via páginas até 50; não serializar todas as
   relações/corpos no root nem depender apenas do upload atual do snapshot.
   Provider recebe offset/limite exatos; recusar páginas faltantes, extras,
   fora de ordem ou de outra intenção.
3. Reconstruir codecs a partir do rascunho original autorizado e conferir
   identidade/intentHash, IDs/hashes determinísticos, manifests e todos os
   progressos/cursor invariants. Não atualizar CAS com a revisão atual.
4. Reconstruir cada pedido congelado e suas ações locais de commit, com whitelist
   manual, ID/operação/CAS originais e bytes/provas de append conferidos pelo
   codec. Não trocar pendência incerta por pedido novo.
5. Preservar inicialização/reservas já aceitas e cancelamento monotônico,
   incluindo produção pendente concorrente, failedCancel/get de reconciliação,
   sucesso adotado e estados terminais. Restaurar não envia nem adota.
6. Sessão Auth aplica o mesmo guard/UID no restore, antes/depois de awaits.
   Limitar os exports aos contratos necessários e manter snapshot sem bytes.
7. Testes com serviços reais sobre double transacional: reconstruir entre
   unidades, perder cada tipo de resposta, cleanup/concorrência, corromper
   contratos/páginas/corpos e trocar conta/contexto. Chromium com recarga.
   Rodar somente checks afetados, revisar/docs/ADR/evidência, commit local.

## Arquivos, riscos e critérios de aceite

Coordenador e contratos puros de lore, validação wire compartilhada, sessão e
barrel; testes existentes/novos e documentação. Sem backend, dependências,
Rules ou interface. Reutilizar parsers de progresso, codec e whitelist.

Checkpoint não é autorização/recibo nativo. Provider é leitura local, não RPC
de produção. Páginas e root devem representar o mesmo estado; futura composição
de journal deve confirmá-los atomicamente e cifrar pedidos antes do envio.
Sem persistência desprotegida ou reconstrução silenciosa de snapshot legado.

Aceite: snapshot continua limitado e sem texto; checkpoint+controles refazem
operação observavelmente equivalente, sem RPC inicial, com replay/CAS/bytes
exatos e um único efeito nativo. Cancelamento/adopção preservam os recibos,
e entradas incoerentes são recusadas antes de enviar. Checkpoints/journal/
host/ciclo de vida integrados, P1/F2-09/V2 e fases seguintes continuam abertos
até suas próprias evidências; validate integral no fechamento de P1.

## Resultado do incremento

Checkpoint privado/fechado e controles paginados com digest, reconstrução de
cursores/pedidos/callbacks, invariantes e integração Auth implementados.
143 Vitest distintos e dois cenários Chromium positivos em rodadas;
lint/tipos/build/smoke/arquitetura e docs dirigidos. Veja
[ADR 0119](../../../decisions/0119-restorable-manual-lore-edit-checkpoints.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-checkpoints-restauraveis-da-edicao-de-lore.md).

Persistência automática cifrada/atômica e controles metadata para cleanup
sem chave continuam a composição obrigatória seguinte, com reserva/host.
Não anunciar retomada visual ou conclusão de P1/F2-09/V2. Validate no fim
de P1; somente commit local.
