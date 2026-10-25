# P1 / M38c5u — Interface da retirada recuperável de lore

## Objetivo e requisitos

Oferecer confirmação visual e descoberta da retirada recuperável da ADR 0133,
sem iniciar exclusão ao abrir ou verificar recuperação. Manter escritores
legados fora do caminho nativo e preparar composição coordenada no compêndio.

1. Novo alvo recebe bookId/loreId/sourceToken da captura C1 e nome somente
   para apresentação, sem persistir nome/prosa. Conferir metadata da mesma
   origem antes de preparar/revisar; não buscar token atual como substituto.
2. Preparar dirige inspeção até ready. Revisar e confirmar são explícitos;
   apply só no clique destrutivo após aviso de irreversibilidade/privacidade.
   Pedido incerto oferece primeiro verificar resultado; reenvio requer GET
   sem confirmação e nova revisão da mesma origem.
3. Retomada confere conta/livro/ficha antes de operar. Abrir só lê metadata
   local; resultado concluído exige prova remota. Callback único por writeId
   depende de removed/verified e recuperação local confirmada.
4. Cancelar preparação funciona durante RPC pendente. Fence/prova própria
   resolvem corrida; nova sessão pode conferir metadata sem esperar a RPC
   antiga. Run antigo perde a UI e não inicia outra unidade após cancel.
   Salvar dívida é uma ação separada de produzir a próxima unidade.
5. Fechar é seguro: não há prosa em edição e pedidos já são duráveis antes
   da rede. Não pedir confirmação de saída para metadata já preservada.
6. Lista própria pagina até 50 por conta, filtra livro, cobre loading/erro/
   vazio/sucesso e não abre prosa nem produz. Conclusão local é registrada,
   não apresentada como nova prova remota.
7. Kit/temas/foco/teclado/mobile, testes dirigidos, Chromium com executor real,
   tipos/build/checks/revisão, ADR 0134/evidência e commit local.

## Arquivos previstos

BookLoreRemovalDialog/RemovalRecoveries, exports de lore e testes próprios.
Reusar useBookLoreActor, kit e CSS de manualEditor. Ajustar serviço somente
se a UI exigir leitura metadata fechada adicional. Docs/AGENTS/execução.

## Não escopo e próxima integração

Compêndio tem criação/edição/retirada e visibilidade/exclusão em lote.
Ações em lote precisam congelar a origem e revisar antes de aplicar pelos
escritores nativos; não usar captura do estado atual após aprovação como
substituta da origem escolhida. A composição final deve preservar essas ações.
Não ativar parcialmente writers nativos mantendo bulk legado incompatível.

Sem Rules/deps/env/backend/remoto/deploy. Host exportado precede composição
com criação/edição, operações em lote e recuperação. Lifecycle/consumidores/
backup/rollout/validate de P1 permanecem necessários. P1/F2-09/V2/fases 3–5 e
gates humanos/comerciais abertos. Testes dirigidos; validate no fim de P1.

## Resultado local

Host/lista exportados e validados, sem ativar escritores no compêndio.
67 Vitest distintos positivos (24 novos), quatro jornadas Chromium,
temas/mobile/foco e tipos/build/smoke/lint positivos. Mensagens distinguem
presença incerta, registro local e prova remota; nome literal longo é preservado.

[ADR 0134](../../../decisions/0134-recoverable-lore-removal-ui.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-retirada-recuperavel-de-lore.md).
Próximo: composição no compêndio, incluindo adaptação nativa das ações em lote.
Lifecycle/consumidores/backup/rollout/validate e demais fases/gates abertos.
Somente commit local; sem CI/envio remoto/deploy.
