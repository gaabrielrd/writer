# Writer V2 — Gestão de campanhas independentes

**Estado:** subincremento A concluído tecnicamente em 624c912; CI e regras verdes.
**Escopo:** subincremento A de [F2-07](../tasks/writer-v2/execucao/14-campanhas-e-variantes.md).
Isso não conclui captura, variantes, atualização ou exclusão integral de F2-07.

## Resultado entregue

Campanha independente permite editar título/descrição, escolher estado e trocar
ou retirar seu universo organizacional próprio. Arquivar e sair do arquivo são
escolhas explícitas de estado; descrição, checklist, identidade, criação e
procedência permanecem preservados. O vínculo não altera lore global.

O servidor compara revisão e grava metadados, usos/contadores de universo e recibo
atomicamente. Contador inconsistente falha sem correção inventada. Legado sem
contador aceita primeiro vínculo somente após consulta limitada provar ausência
de usos. Universo removido pode ser desvinculado sem ser recriado.

O controlador conserva ID/payload antes da rede e isola UID/campanha. Resposta
perdida mantém campos bloqueados após fechar ou recarregar; confirmação repete o
mesmo pedido. Conflito conserva campos e exige descarte explícito antes de GET da
versão atual. Respostas tardias de outra conta/alvo não alteram a página. A própria
confirmação válida atualiza a página sem GET que adote outra revisão silenciosamente.

## Correção do foco e histórico

A CI de a3150a3 encontrou refazer inoperante após restaurar/desfazer no histórico
desktop/sépia. Os traces mantinham Refazer habilitado, mas o editor perdia foco.
Um teste negativo com Dialog/Radix reais reproduziu o retorno diferido roubando o
foco já retomado no manuscrito. O ajuste respeita o novo foco externo e conserva o
retorno normal ao acionador. Callback customizado e guarda de elemento conectado
continuam respeitados. Commit isolado: `7070a0ce189b144399c86ada064da19d06e7829d`.

Não houve alteração no roteiro funcional original, timeout, retry ou assertion.
Revisão independente não encontrou P0/P1/P2 no ajuste. O cenário original passou
após a correção; os seis projetos foram verificados novamente na integração abaixo.

## Arquivos e revisão

- functions/src/campaigns.mjs, integração de universes/index e testes unitários/SDK.
- features/campaigns: modelo, transporte, serviço, recuperação, controlador, diálogo e página.
- Fixtures e spec nativo; alias exato somente do novo transporte de mutação.
- Dialog compartilhado e teste real de retorno de foco; regressão controlada do RichEditor.
- Contratos, arquitetura, testes, README e regra do AGENTS atualizados.

Revisão independente do frontend não encontrou P0/P1/P2 de produção. Um P2 da
fixture foi comprovado por teste negativo: replay não reautorizava universo removido.
Helper compartilhado corrigiu novo pedido/replay e o controle voltou a passar.
Revisão do servidor cobriu transação, autorização, recibo, datas e contadores.

## Validação executada

- Backend dirigido campanhas/Estúdio/universos: **30/30**, sete novos casos.
- SDK Firestore real novo: **4/4**, zero skips, 12.486,5685 ms; emulador encerrado.
- Frontend dirigido: **22/22**; três afetados repetidos após ajuste do controlador.
- Dialog/RichEditor no checkout isolado: **26/26**, incluindo negativo corrigido.
- Fixtures externas: **4/4**, incluindo CAS, reload, replay, legado e isolamento de UID.
- Chromium campanhas: **36/36**, 58,304 s, três temas, desktop/celular, teclado e 320 px.
- Após integrar o fix de foco: **12/12**, 44,085 s, histórico autor/undo/redo e gestão
  por teclado nos seis projetos. Zero retries, skips, falhas ou flaky nas duas matrizes.
- Capturas de formulário/confirmada em 320 px inspecionadas nos três temas.

`npm run validate` final: **exit 0**, 1.494 testes frontend/161 arquivos, 114,14 s;
cobertura 91,44% instruções, 84,89% ramos, 90,59% funções e 93,83% linhas.
77 scripts (7.625,9348 ms), 265 Functions (1.723,0137 ms), arquitetura, documentação,
styleguide, formato, lint, tipos, sintaxe, build e smoke verdes. Build 1,25 s;
mantém avisos preexistentes de chunk grande e importação mista de DOCX.
Dependências de functions já instaladas com npm ci antes da validação.
Documentação acrescentada após esse comando recebe verificação dirigida própria.

Artefatos externos: writer-v2-campaigns-validate.log, writer-v2-campaigns-qa
(final e post-focus-fix), writer-v2-campaigns-management-sdk.log e
writer-v2-history-ci. Logs do primeiro diagnóstico isolado foram transcritos dos
resultados observados, sem nova execução; as matrizes integradas preservam stdout
e JSON originais. Fixtures não comprovam credenciais/ativação em produção.

## Limites e sequência

O [head anterior](https://github.com/gaabrielrd/writer/actions/runs/38715097202)
passou validate Node 22/24, auditoria, produção 7/7, regras 99/99 e sete shards;
o oitavo/gate agregado falharam no foco descrito. Não declarar essa CI verde.
A nova CI será acompanhada em paralelo conforme a autorização do operador.

Captura completa e lore apenas referenciado estão aprovados e têm
[plano B](../tasks/writer-v2/execucao/15-captura-de-aventura.md), ainda sem código
neste checkpoint. Variantes, atualização, exclusão integral, sessões, portal,
comércio, backup integral e pilotos humanos conservam seus aceites próprios.
Sem merge, deploy ou mudança no checkout original/master.

## Verificação manual

1. Abra campanha independente, edite dados e estado; cancele e confira que nada foi gravado.
2. Salve, arquive e escolha explicitamente o estado de retorno; confira checklist/descrição.
3. Vincule/troque/desvincule universo próprio e recarregue.
4. Em resposta incerta, reabra e confirme o mesmo pedido; em conflito, descarte explicitamente.
5. Restaure versão de capítulo, feche o diálogo, retome escrita e desfaça/refaça.

## Registro e envio — 2026-10-15

Gestão, testes e contratos registrados em
`624c9126236387cb600b71dcefe1fed4a27f5115`, sobre a correção isolada `7070a0c`.
O envio da branch codex/writer-v2 ao [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21)
foi confirmado por ls-remote. Hooks mantidos: pre-push confirmou tipos e 1.494 testes
em 161 arquivos, 104,33 s. [CI](https://github.com/gaabrielrd/writer/actions/runs/38719991146)
e [regras](https://github.com/gaabrielrd/writer/actions/runs/38719990928) observadas
na fila, sem presumir resultado. Captura B inicia sob a sequência autorizada.

## Confirmação remota — 2026-10-15

Os runs de 624c912 terminaram verdes: validate Node 22/24, auditoria, navegador de
produção, oito shards visuais, gate agregado e regras. Logs de produção confirmam
7/7 (17,6 s) e Firestore 103/103, zero falhas. A correção de foco de F2-05 e o gate
de F2-06 estão confirmados remotamente neste head. Não inferir ausência de retries
dos shards apenas pelo estado success. F2-07 completo continua em implementação;
essa conclusão se refere somente à gestão independente A.
