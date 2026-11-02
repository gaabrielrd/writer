# P1 / M38c5x — Seleção durável para retirada de lore

## Objetivo e requisitos

Coordenar retirada da seleção completa, com origens independentes capturadas
explicitamente em v2 (ADR 0136), sem limitar autoria a uma unidade de 50.
Compor executores/recibos individuais existentes, sem alegar grupo atômico.

1. Antes de RPC, gravar manifesto metadata completo em páginas até 50 e
   cabeçalho/estado na mesma transação IndexedDB. IDs/tokens/writeIds
   determinísticos; sem nomes, prosa ou chaves. Abort não deixa seleção parcial.
2. Banco próprio aditivo, separado dos journals atuais. Página fixa hash,
   conta/livro/seleção/posição; CAS por estado, Web Lock curto e oncomplete.
   Resultado por membro é imutável e avanço/contadores são atômicos.
3. Abrir/retomar/listar não envia RPC. Uma unidade compõe um filho original.
   advance prepara/verifica sem iniciar retirada; apply inicia somente ready.
   Pedido destrutivo incerto só consulta; reenvio exige retry explícito.
4. Origens não são recapturadas ou promovidas. Falha definida de precondição
   antes/no apply, sem retirada comprovada, entra em fence; só avançar como
   conflito após
   inspeção original cancelada e ausência conferida de retirada aceita.
5. Cancelar persiste intenção do pai sem aguardar produtor, depois fecha
   todos os filhos originais por unidades, inclusive nunca iniciados.
   Reconciliar retiradas aceitas sem restaurar cabeça. Fresh handle não
   espera RPC antiga; resposta tardia não avança outro membro.
6. Resultado gravado não é prova fresca. Ao retomar, verificar cada evento/
   fence original antes de anunciar completo/partial/cancelled confirmado.
   Dívida de persistência bloqueia próxima produção; ação seguinte só salva.
7. Falhas de rede/controles/revogação não viram conflito concluído nem sucesso.
   Fichas retiradas continuam com cleanup individual descobrível.
8. Sessão Auth captura actor/host e impõe UID/livro ao criar/retomar/listar.
   Testes dirigidos, Chromium real de IDB/reinício/concorrência e build/tipos.

## Sequência e arquivos

- RemovalSelectionContracts: manifesto/páginas, IDs, estado e resultados.
- RemovalSelectionDb: banco próprio, CAS/paginação/contadores/descoberta.
- RemovalSelectionOperation: composição dos filhos, dívida/cancel/reconciliação.
- RemovalSelectionService e exports públicos: sessão Auth.
- Harness/testes de contratos, banco, operação/sessão e Chromium.
- ADR 0137, AGENTS, arquitetura/testes/execução/81 e evidência.
- Revisão, checks dirigidos e commit local. Validate integral no fim de P1.

## Suposições, riscos e aceite

O host recebe seleção revisada da captura v2 e chama apply por ação explícita.
Coordenador não adivinha versão pelo hash nem troca fonte v1 antiga. UI
posterior deve apresentar origens/efeitos e nova confirmação após conflito.
Semântica preserva sucessos individuais e membros que falham selecionados.
Receber metadata não concede grant, prosa ou autorização de leitura atual.

Aceite exige seleção de 53 membros, CAS entre abas, oncomplete/abort, perda
de resposta antes/depois de aceite, cancel independente e fence sobre filhos
não iniciados, confirmação histórica sem replay e conta/livro corretos.
Conflito real não abandona produtor incerto e não adota texto posterior.

Este incremento entrega coordenador de retirada, não UI nem visibilidade.
Ações de visibilidade, seleção/retomada visual e composição final continuam
obrigatórias; nenhum recurso existente é removido para ativar o compêndio.
Banco local não certifica latência/volume ilimitado; erro de quota preserva
journals e não autoriza RPC. Sem alteração de formatos cifrados/Rules/deps/
env/backend/transportes existentes. Lifecycle/consumidores/backup/rollout/
validate de P1 e demais fases/gates da V2 abertos. Somente commit local.

## Resultado local

Manifesto paginado, banco próprio, executor recuperável e sessão Auth
implementados. 70 Vitest positivos (31 novos), quatro jornadas Chromium com
persistência/reinício/duas abas e tipos/build/smoke/lint positivos.

[ADR 0137](../../../decisions/0137-durable-book-lore-removal-selection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-selecao-duravel-de-retirada-de-lore.md).
Sem montagem visual/compêndio: retirada de seleção na UI, visibilidade e
composição final permanecem. Demais fases/gates e validate de P1 abertos.
Somente commit local; sem CI/envio remoto/deploy.
