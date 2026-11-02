# Writer V2 — Materialização das variantes de lore

- Data: 2026-10-29.
- Branch: codex/writer-v2; base f1c52bb.
- Plano: [235](../tasks/writer-v2/execucao/235-materializacao-das-variantes-de-lore.md).
- Decisão: [ADR 0265](../decisions/0265-campaign-variant-materialization.md).
- Estado: incremento interno validado com checks dirigidos; sem ativação/UI.

## Objetivo e funcionalidades

Preparar as adaptações da mesa em uma nova geração de lore da campanha
restaurada, preservando texto literal, base/override/removed, previousMode,
participação, retainedLegacy e relações opacas, inclusive unresolved v3.
Vínculos de corpo, revisões e identidades pertencem à nova campanha.

Autorizações atuais da base, âncora e alvos precedem o DTO e são repetidas
na escrita. Descritores de alvos negados antes da cópia viram opacos.
Digest da decisão impede continuar corpo parcial ou auditoria após mudança.
Corpos usam o codec nativo portátil; nenhuma chave ou assinatura vale grant.

Âncoras da mesma base/item são remapeadas à base nova; históricas têm ID
próprio. Seu produtor ainda será implementado. Geração permanece preparing,
campanha pending; controle global e ponte ativa aguardam a futura ativação.

## Critérios atendidos e arquivos

- [x] Geração/variantes/corpos nos formatos ordinários, com texto e estados.
- [x] Checkpoint cifrado até 8 KiB sem texto crescente; um DTO por chamada,
      até três corpos mais overlay, publicação de overlay após seus corpos.
- [x] CAS/replay/rollback, autorização antes/depois de I/O e na escrita.
- [x] Inventário/journal/cancel/coleta antes do produtor, sem grant ou prosa;
      geração preservada com filho estrangeiro.
- [x] Auditoria registrada limitada a um journal por chamada, sem multiplicar
      até 50 verificações de alvos pelo limite de varredura.
- [x] Leitura ordinária exercitada com liberação exclusiva de fixture.

Novos módulos campaignRestoreVariantFormat/Origin/Writes/Materialization;
contratos/store/cleanup/transfer integram estado opcional e coleta antes de
base/own/índices/chunks. Teste Node/helper e jornada SDK/Rules próximos;
AGENTS/arquitetura/ADR/plano/inventário/progresso documentam limites.

## Testes e validações observados

296 testes Node distintos positivos em rodadas, sem somar reexecuções:
276 regressões e 20 novos. m158-directed.log registrou 295/295, zero falhas/
skips/cancelamentos, em 199.077,2721 ms, antes do limite final da auditoria.
Depois desse ajuste, somente a família alterada foi reexecutada:
m158-variants-final.log, 20/20, zero falhas/skips/cancelamentos,
em 91.416,3727 ms. Um caso novo comprova exatamente um journal por checkpoint.

Casos: texto UTF-8 longo/retomada em novo serviço, leitor ordinário e revogação,
estados/participação, âncora histórica por adoção real, unresolved, alvo negado,
rollback em três pontos, CAS/replay, origem negada antes de bytes, mudança
durante I/O, corpo parcial, alteração de corpo detectada na auditoria,
cancelamento durante leitura e pai preservado até retirar filho estrangeiro.

SDK/Rules: 1/1 positivo em 403.602,0041 ms (m158-sdk.log; runner total
404.763,8301 ms). Aventura, cena, lore, captura e variante original foram
criadas pelos serviços nativos. Arquivo real assinado foi enviado, revisado
e materializado. Ownership alterado durante bytes impediu checkpoint/escrita;
reautorização da mesma origem permitiu retry. Geração/journal têm mesmo birth,
corpo/binding/codec foram conferidos e Rules negam geração/overlay/corpo
pendentes. Cancelamento após revogação retirou chave; pai com filho estranho
foi preservado. Retirar somente o dado injetado permitiu coleta completa,
mantendo campanha original e recibo histórico. Emulador demo local e encerrado
pelo próprio runner. Essa jornada precedeu o limite final de um journal;
o ajuste de lote foi validado pelos 20 testes Node finais, sem repetir o SDK.

Arquitetura, sintaxe de 484 módulos Functions, ESLint dos onze arquivos de
código e novamente dos dois ajustados, formato/documentação/diff e scan
de segredos positivos. Nenhuma dependência adicionada. Frontend não mudou:
typecheck/build/visual não foram repetidos. Não houve CI/push/PR/merge/deploy.

## Correções e revisão

O primeiro teste alinhou a chave de w:anchor ao sourceKey da variante,
conferindo anchorKey dentro da testemunha; lookup ausente de variant usa
a prova autenticada de ausência existente. IDs de posicionamento respeitam
o limite de 80 caracteres. A fixture histórica remove referências antes da
adoção para produzir uma ficha legada real, e a fixture SDK encerra a operação
com intent confirm. Limites, autorização e quotas não foram reduzidos.

## Limitações e próximos passos

Não há ativação de restauração nem liberação no Estúdio neste incremento.
Ainda faltam bases históricas/âncoras, mídia/pins, vínculo organizacional
autorizado, C4 apropriado para temporários, auditoria física e ativação/
aposentadoria dos journals, além de ciclos ricos pela interface.
Layout C4 1–4 permanece. Prova de variantes é parcial e não concede acesso.

Validate integral no fechamento do bloco de materialização/ativação, conforme
orientação do operador. O baseline 3c1cefa de 9.871 testes valida 227–232;
não é validação integral deste incremento. Macro 8/35 (22,9%), P3/D/F2-09
e condições humanas/comerciais continuam abertos. Somente commit local.

## Verificação manual

Não existe entrada nova no Estúdio ainda. Para verificar o núcleo, executar
o teste campaignRestoreVariantMaterialization de Functions e a família
SDK/Rules homônima em emulador demo. As liberações de raízes/controle presentes
no teste são exclusivas da fixture, sem caminho equivalente em produção.
