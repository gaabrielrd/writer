# P3 — Revisão de origens persistida e retomável

- Data: 2026-10-29.
- Base: ab8598b; semântica derivada do plano 231 validada.
- Estado: núcleo implementado e validado; sem materialização/ativação/UI.

## Objetivo e requisitos

Revisar autorização atual em chamadas limitadas, preservar a dupla passagem do
revisor existente e recusar mistura de revisões quando clock/provas mudarem.
Usar os readers atuais de metadata/nascimento, sem prosa e sem inferir origem
pela assinatura. Preservar o resultado/digest anterior para a mesma revisão.

## Reuso e fronteiras

derivedRows já guarda w:base/w:item/w:anchor autenticados na ordem global.
A testemunha project pode ser reconstruída somente do estado own validado,
que conserva a referência de universo original. Expor getter exclusivamente
interno para isso. Não duplicar índice nem produzir coleção de decisões quando
o contrato atual retorna resumo/prova: cada recurso materializado ainda deverá
ser reautorizado em sua transação própria.

originReview opcional no job guarda estado cifrado de captura/rechecagem,
cursores, clock, SHA e resumo capturado. Nenhuma origem/decisão completa vai
para recibos/progresso. Antes do produtor, limpar estado no cancelamento com a
chave; não há nova família física. Restart explícito limpa somente essa revisão,
com CAS/recibo, sem exigir que o clock antigo ainda esteja válido.

## Proposta e execução

1. Guardar oracle anterior. Compartilhar preparo/aplicação/fechamento das
   decisões entre revisor completo e coordenador persistente.
2. Getter privado da testemunha project, contrato do estado e cancel/restart
   antes da persistência.
3. Capture/recheck percorrem até 25 eventos por chamada: project e linhas do
   índice (ignorando as não witness), com clock esperado em cada acesso e na
   transação de checkpoint. Página autenticada antes de ler origens.
4. Fechar somente quando ambas as passagens coincidirem; prova reconfere clock,
   assinatura e encarnação. Mudança falha sem avanço e exige restart explícito.
5. Testar fontes reais atuais/retiradas/recriadas, mudanças entre passos/passes,
   legado/omissões, CAS/rollback/cancel/restart/isolamento e SDK dirigido.
6. Comparar oracle, rodar validação completa do bloco 227–232 após os checks
   dirigidos, revisar/documentar e registrar commit local.

## Aceite e limites

Sem recomeçar o arquivo inteiro para retomar; sem índice do tamanho do projeto
em memória; nenhum corpo originário lido. Dupla passagem + digest iguais ao
contrato existente. Não dar acesso temporário com clock antigo nem aceitar
clock/cursor do cliente. Restart não reabre fonte revogada; revisa o estado atual.
História de operações permanece mínima e idempotente.

Prova é campaign-origin-review-only, não grant por recurso nem campanha ativa.
Depois vêm remapeamento/materialização/mídia com revalidação por recurso,
integração C4 dos temporários antes de ativação e Estúdio/ciclos. Layouts1–4
preservados. Macro8/35 e P3/D/F2-09 abertos. Sem agentes/CI/push/PR/merge/deploy;
preservar master e servidor manual.

## Resultado local

Núcleo implementado e validado: 17 casos novos dirigidos, 56 regressões de
origens e uma jornada SDK/Rules positivos; cinco perfis assinados produziram
provas/digests idênticos ao algoritmo anterior, completo novo e persistido.
Mudança de clock após leitura bloqueou o checkpoint sem avanço/recibo.

Validate integral do bloco 227–232 verde: 9.871 testes (4.978 frontend,
94 scripts, 4.799 Functions), cobertura preservada, sintaxe de 472 módulos,
lint/typecheck/build/smoke positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-revisao-retomavel-das-origens.md)
registra tempos, correção da fixture e avisos preexistentes de build.

Próximo: materialização/remapeamento/mídia com autorização atual por recurso,
integração C4 dos temporários antes da ativação e Estúdio/ciclos.
Macro 8/35 e P3/D/F2-09 continuam abertos; somente commit local.
