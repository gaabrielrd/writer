# P1 / M38c5m — Transporte e origem da recuperação na criação de lore

## Objetivo e requisitos

Preparar a dependência de servidor para criação manual nativa com recuperação
protegida antes de existir ficha. Reutilizar bookLoreEdit e a reserva permanente
de criação; aceitar somente IDs manuais lore-creation e referências manuais de
uploads/edição. Não expor dispatcher genérico nem jobs filhos da análise.

A chave de recuperação deve pertencer à mesma conta, livro original e reserva
nativa original. Intenção inclui creation com creationId/startHash/jobToken;
sourceToken continua congelado no token dessa reserva. Hashes/envelopes antigos
sem creation permanecem idênticos. Guardar somente metadata e chave no servidor.

Nova chave exige reserva viva sem cancelamento/adoção e cabeça ausente. Chave
já criada pode recuperar o draft após cancelamento explícito, mantendo o livro
e a reserva originais autorizados. Após adoção, exigir a cabeça original pelo
nascimento nativo do comprovante. Ficha retirada/recriada, tombstone, livro
apagado/recriado/deleting/novo dono ou reserva/prova recriada negam a chave.
Metadata histórica e revogação explícita continuam disponíveis sem grant da
origem; revogar nunca recria chave nem cancela jobs implicitamente.

## Sequência e arquivos

1. bookLoreEditTransportMethods/Transport e testes: quatro métodos de
   start/get/cancel/cleanup da criação, prefixo próprio e refs fechadas.
   Upload e composição aceitam creation manual validada; inspeção não aceita.
2. bookLoreWriteRecoveryContracts/Recovery e novo helper Creation: intenção
   aditiva e autorização por reserva/cabeça nativas, sem prosa ou grant cliente.
3. Testes Node de transporte/chave e regressões de criação/edição; fixture
   reutilizável para SDK com transações/crypto reais e escopo demo/loopback.
4. Teste SDK do ciclo antes da cabeça, cancel, adoção, revogação e recriação.
   Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

## Aceite, suposições e riscos

Transporte só delega métodos próprios com autenticação e prefixos corretos.
Mesmo pedido incerto confirma reserva/recibo original; cancel antes de start
fenceia permanentemente. Referências de análise, campos extras e identidade
estranha não chegam ao I/O do serviço. Nova chave não altera lore, clock,
publicação ou crédito; original e provas/chave nascem atomicamente.

Recuperação após adoção confirma a origem nativa, não adota texto atual nem
autoriza uma nova escrita. Após cancel, devolver chave já existente não libera
a reserva para upload. Fonte ausente nunca é interpretada como permissão.

Sem coordenador/produtor visual ainda: conectar cliente durável e criação/
exclusão ao compêndio continua necessário. Sem ativar UI, deploy, novo endpoint,
migração, dependência ou CI. Não substitui a entrega completa do plano 81.
Validate integral no fim de P1; P1/F2-09/V2 e demais fases/gates abertos.

## Resultado e revisão

Implementados transporte da criação e origem nativa de recuperação, com hashes
legados preservados e listas separadas: 22 métodos manuais no servidor, 18
anteriores no journal de edição. A separação corrigiu acoplamento identificado
na revisão antes do commit; não ampliar persistência sem coordenador próprio.

143 testes distintos positivos (32 novos): 82 Node, 56 Vitest e cinco SDK.
Tipo/lint/sintaxe dirigidos passaram. Veja a
[ADR 0126](../../../decisions/0126-manual-lore-creation-recovery-origin.md) e a
[entrega](../../../entregas/2026-10-24-writer-v2-transporte-e-recuperacao-da-criacao-de-lore.md).
Próximo: compor ticket/reserva incerta e criação durável no cliente, recuperação
cifrada e os demais caminhos antes de ativar o compêndio. P1/F2-09/V2 e
demais fases/gates permanecem abertos; sem CI/push/PR/deploy.
