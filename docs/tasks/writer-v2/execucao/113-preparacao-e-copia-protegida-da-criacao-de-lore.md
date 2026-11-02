# P1 / M38c5o — Preparação e cópia protegida da criação de lore

## Objetivo

Registrar preparação metadata antes da primeira RPC, reconciliar reserva de
criação/chave e confirmar cópia cifrada imutável do draft. Implementar base
persistente própria da criação sem mudar formatos de journals de edição.
O coordenador de produção/checkpoint do plano 112 será composto na sequência;
não liberar produtores antes de write-ahead durável integrado.

## Requisitos e sequência

1. Banco local v3 com stores aditivos de tickets/frames de criação. Preservar
   registros v1/v2 e recusar downgrade. Reusar acesso transacional/CAS/Web Locks
   curtos; nenhuma chave/crypto/rede dentro da transação.
2. Ticket fechado por UID/writeId/livro/creationId/loreId/intentHash, descoberto
   por paginação até 50. Stamp de posse fenceia outras abas; estados/identidades
   não regridem. Metadados antes de start/reserve/revoke/cleanup.
3. Bootstrap conecta reserva nativa e chave pelo hash/escopo originais, antes de
   qualquer corpo autoral. Falha conserva pedido exato e torna a preparação
   descobrível. Actor/contexto conferidos antes/depois do I/O.
4. Draft em partes AES-GCM de 64 KiB, nonce/AAD por identidade/seção/geração/
   índice. Digest cifrado, sem prosa/chave em metadata. Confirmar oncomplete.
   Prefixo existente precisa ser conferido antes de retomar; leitor exige chave
   fresca e autorização também ao final, SHA/UTF-8/schema/intenção completos.
5. Cancel/release/discard por lanes metadata independentes, com fechamento
   nativo antes da chave e purga limitada própria. Cancel conserva cópia/chave;
   liberar é explícito. Nunca tratar adoção estrangeira como jobs próprios
   fechados ou inventar draft ausente após recarga.
6. Reusar provider HTTP de chave com Auth/App Check; testar compatibilidade do
   journal antigo, falhas/CAS/escopo/tomada de posse, prefixos/cifra/recarga,
   reserva incerta e cancel concorrente. Testes direcionados e Chromium de
   armazenamento quando necessário, revisão, ADR/evidência e commit local.

## Aceite e fronteira

Ticket existe antes das RPCs e a reserva é retomável sem criar outra intenção.
Cópia confirmada reabre com os mesmos literais após nova instância e grant
fresco; falhas não sobrescrevem corpo/dados de outra conta/operação.
Ato de cancelar não apaga cópia, descarte exige prova e não permite renascimento.

Checkpoint write-ahead/controle de produção ainda exige integração própria
antes de chamar advance/apply pela UI. A cópia inicial não certifica esse
coordenador persistido, UI, CRUD completo ou rollout. P1/F2-09/V2, exclusão/
lifecycle de chaves, consumidores/backup e fases restantes continuam abertos.
Validate integral no fim de P1; sem CI/push/PR/deploy ou dependências novas.

## Resultado local

Preparação e cópia inicial implementadas; 221 Vitest distintos em dez arquivos,
38 novos, e quatro jornadas Chromium positivas. IDB nativo migra v2→v3
preservando edição e preparação; cópia >9 MiB reabre após reinício e purge
remove 146 frames em lotes até 50. Tipos/build/smoke e lint/arquitetura passaram.
Guarda do host foi acrescentada ao port manual após falha do teste de sessão.
Formatação/docs/diff conferidos no fechamento. Validate integral fica em P1.

Ver [ADR 0128](../../../decisions/0128-protected-lore-creation-preparation.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-preparacao-protegida-da-criacao-de-lore.md).
Próximo: persistir checkpoint privado/controles/resultado do coordenador antes
de advance/apply; host, exclusão e demais portões permanecem abertos.
