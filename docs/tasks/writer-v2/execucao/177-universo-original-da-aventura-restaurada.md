# P2 — universo original da aventura restaurada

Base: cd2050d. Incremento posterior a draft-ready; sem ativação do projeto.

## Objetivo, requisitos e suposições

Religar apenas ao universo original, próprio e ainda disponível, sem duplicar
universo ou copiar lore global. A origem portátil autenticada possui identidade
de criação; origem none não consulta universo, unavailable nunca vira referência
por coincidência de ID. Acesso atual exige authorId e ausência de deleting.
Uma observação preparatória não concede acesso nem substitui a rechecagem final.

## Sequência e arquivos

1. Extrair a inspeção neutra existente de bookRestoreUniverse para
   portableUniverseRestore, preservando o contrato público do livro e os testes.
2. Criar adventureRestoreUniverse e serviço interno advanceAdventureRestoreUniverse.
   Reabrir unidade original pelo historyStartIndex e conferir prova, candidato
   privado e definição preparados. Transação confirma universo observado,
   candidato atualizado, universeId privado e recibo/checkpoint juntos.
3. Evoluir metadata para universe-ready, preservando campos de draft e recibos
   anteriores; expor somente resultado none/available/unavailable, sem IDs/tokens.
   Integrar ações no store/contracts/artifacts/transfer e cleanup existente.
4. Preparar helper transacional para a futura ativação: reler job e artefatos,
   verificar unidade original e reautorizar o universo por identidade e acesso.
   Retornar plano nativo strict de vínculo/contador somente para commit conjunto
   com a raiz ativa; a preparação não executa esse efeito.
5. Testes dirigidos Node e SDK demo: none/referência/indisponível, proprietário,
   ausência/deleting/recriação, mudança legítima do universo, revogação entre
   preparação e ativação, rollback/retry/replay/cancelamento e adulteração.
6. Revisar, atualizar arquitetura/ADR/progresso/evidência e commit local com hooks.
   Validate integral de 176 é base anterior; próxima suíte integral no fim do
   novo bloco, conforme a orientação do operador. Sem CI ou envio remoto.

## Não escopo e riscos

Personas, mídia, agregados/auditoria/ativação, recuperação cifrada/UI/roundtrip
continuam obrigatórios em P2; P3/D/F2-09 e fases seguintes continuam abertos.
Não criar grants, vínculos/contadores prematuros, universo novo ou lore global.
Falha de autorização produz seleção sem vínculo; inconsistência de contador
nativo impede ativação. Replay devolve o recibo original sem conferir um grant:
a ativação reautoriza novamente, mesmo quando a seleção anterior foi disponível.
Nenhuma decisão nova de produto ou dependência é necessária.

## Aceites

- [x] Origem autenticada, identidade original e acesso atual comprovados.
- [x] Seleção/raiz/recibo privados atômicos, sem universo ou contadores alterados.
- [x] Plano final reautoriza e usa vínculo nativo strict sem autorização congelada.
- [x] Testes dirigidos, revisão/docs/evidência e commit local.

54 Node dirigidos e três SDK distintos positivos em seleções. Resultados,
correções e pendência de validate integral do novo bloco estão na
[evidência](../../../entregas/2026-10-27-writer-v2-universo-original-de-aventuras.md).
