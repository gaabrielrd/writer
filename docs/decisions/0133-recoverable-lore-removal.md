# ADR 0133 — Retirada recuperável de lore

- Estado: aceita; host acrescentado pela ADR 0134; compêndio pendente.
- Data: 2026-10-24.
- Plano: [118 / M38c5t](../tasks/writer-v2/execucao/118-retirada-recuperavel-de-lore.md).

## Journal metadata separado

writer.book-lore-removals v1 guarda somente identidades, tokens, intenção,
progresso, wire original, flags de cancelamento e stamp. DTO fechado e IDs
derivados da conta/tentativa/origem; sem nome, prosa, rascunho ou chave.
Não alterar a base cifrada writer.book-lore-journal v3 nem seus cinco stores.

IndexedDB usa chave conta/writeId, CAS integral, Web Locks curtos e oncomplete
antes de RPC. Descoberta pagina até 50 por conta. Estados/tokens/flags são
monotônicos; nenhuma resposta local tardia pode reabrir produção cancelada.
Antes do envio, conferir novamente se o wire durável ainda é o atual.
Falha antes/depois de RPC conserva dívida em RAM: retry só grava a dívida,
sem iniciar outra unidade. Após recarga, o wire original continua disponível.

## Execução e prova própria

createRemoval/resumeRemoval não enviam RPC. Advance prepara a inspeção até
ready e para; apply explícito grava intenção/wire antes de retirar.
Start incerto em advance consulta getBookLoreRemoval original e nunca reenvia.
Se ausente, permanece incerto; somente apply explícito pode reenviar o mesmo
wire, sem trocar origem/ID. Resposta inválida mantém o pedido para resolução.

Limpeza usa CAS/recibo da unidade nativa. Handoff passa a consultar metadata,
sem reutilizar cursor individual. Recuperação local já concluída inicia
verifying/verified false; somente consulta servidor original confirma conclusão
na nova sessão. Snapshot local não é prova de sucesso remoto.

## Cancelamento independente

Cancel não espera RPC nem ocupa o lock de produção. Persiste intenção e fecha
a inspeção original por cancelamento/fence nativo, inclusive antes do start.
Depois consulta retirada original: se já aceita, mantém retirada e limpeza;
se ausente após o fence, confirma cancelamento. A transação servidor resolve
a corrida; não há restauração da cabeça nem reutilização do ID retirado.

ACK local ou resposta RPC atrasados conservam o estado mais recente. Antes
de novo envio, o executor lê o journal e interrompe wire já superado.
Actor/host são capturados pela sessão, conferidos antes/depois do I/O.
Resume confere conta/livro antes de compor a operação.

## Evidência e fronteira

43 Vitest positivos (30 novos), três jornadas Chromium distintas repetidas
após a correção final e build/tipos/smoke/lint positivos. Browser usa IndexedDB/
Web Locks reais e reinício de perfil; Functions nativas usam banco/identidade
de fixture. Sem comprovar rede Functions/Auth/App Check em produção.

O host e a lista foram acrescentados na [ADR 0134](0134-recoverable-lore-removal-ui.md).
Composição no compêndio e ações em lote continuam pendentes. Lifecycle/chaves, consumidores/backup/rollout e validate
de P1 continuam necessários. P1/F2-09/V2/fases 3–5 e gates humanos/comerciais
abertos. Sem Rules/deps/env, CI, envio remoto ou deploy.
