# P1 / M38c4e A2c — Aplicação integral da análise preparada

## Objetivo e fronteira

Confirmar até 50 alvos locais/globais/novos, crédito e recibo reais juntos,
usando prontidão A2b2 e adoção A2a. Manter o contrato de applyLoreAnalysis:
com reserva ready usa o finalizador; preparando/cancelado bloqueia o legado.
Sem reserva mantém o caminho inline/global existente; payload exige preparo.
Não executar a preparação inteira em uma chamada longa nem expor UI/novo
callable antes dos demais gates de cliente/rollout.

## Requisitos e sequência

1. Reabrir análise/provedor, origens e contexto na transação final. Exigir
   todos os certificados/provas prontos, intenção/CAS e vínculos nativos.
2. Liberar capacidade de adoção somente para o lote completo autorizado.
   A API singular permanece bloqueada para filhos reservados, mesmo com
   capacidades de lote; produção de bytes não aceita capacidade de adoção.
3. Preparar A2a para todos os locais; gravar globais existentes por patch
   e novos privados, com relações/defaults preservados. Timestamp comum,
   um clock local e um global, uma invalidação de autorização global.
4. Conferir saldo nativo e debitar uma vez (plataforma: 1; BYOK: 0), junto
   das cabeças/gerações/criadores, globais, estado applied, ticket e recibo.
   Qualquer erro reverte tudo; sem leituras após writes.
5. Recibo/prova imutáveis fixam contexto, intenção, provedor, saldo/custo/
   resultado, versões e referência ao comprovante A2a. Nascimentos do grupo,
   recibo e evento final coincidem. Estado não confirma sucesso sem provas.
6. Replay metadata valida provas conjuntas originais, sem reautorizar prosa,
   debitar, reescrever ou ressuscitar fonte. Deve sobreviver a saldo posterior,
   revogação, retirada/reedição/coleta e exclusão de livro/ticket.
7. Cancelar após sucesso é recusado; exclusão reconhece applied e deixa a
   limpeza geral aposentar/coletar gerações, preservando os comprovantes.
8. O roteamento legado compartilha a mesma leitura de reserva/ticket na
   transação: não pode correr por fora da preparação. Recibos legados continuam
   metadata confirmável. Marca nova no ticket exige prova nova, sem fallback.
9. Node/SDK dirigidos: 1/50, locais inline/v1/v2/novos, globais e mistos,
   BYOK/saldo, concorrência/cancel, versões/privacidade/campos intocados,
   rollback nativo nos diferentes writes, recriados/perdas de prova e replay
   pós-limpeza. Conferir leitura real do lore ativado e débito atômico.
10. Revisão, docs/ADR/AGENTS/evidência, checks dirigidos e commit local.
    Validate integral no fechamento de P1; sem CI, push, PR, merge ou deploy.

## Arquivos e riscos

Finalizador/contratos/recibo histórico, capacidades de filhos e fronteira A2a,
estado da aplicação, roteamento em loreAnalysis, exclusão, fixtures/testes e
documentação. Não alterar preço, limites de patch/compêndio ou modelo comercial.

Cuidado com replay da adoção: prova histórica não pode preparar adoção nova.
Ticket mutável não substitui recibo novo. Cancelamento não apaga sucesso.
Prontidão não concede autorização; crédito e clocks não avançam por item.

Integração de preparo no cliente/endpoints, demais escritores/consumidores,
backup/rollout e certificação de P1/F2-09/V2 continuam obrigatórios.
Condições humanas/comerciais seguem abertas. QA demo/loopback com memória
limitada conforme o processo vigente.

## Estado verificado

Implementado internamente e validado em rodadas dirigidas: 47 casos novos
Node distintos, 201 regressões Node e cinco casos SDK positivos.
[Evidência](../../../entregas/2026-10-24-writer-v2-aplicacao-atomica-da-analise-preparada.md)
e [ADR 0113](../../../decisions/0113-atomic-prepared-lore-analysis-application.md)
registram as falhas iniciais corrigidas, provas nativas e limites reais.

Cliente/endpoints, outras integrações, rollout e validate integral de P1
permanecem pendentes. Sem concluir F2-09/V2, CI, push, PR, merge ou deploy.
