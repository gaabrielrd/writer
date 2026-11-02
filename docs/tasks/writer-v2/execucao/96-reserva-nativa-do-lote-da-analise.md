# P1 / M38c4c A2b1 — Reserva nativa do lote da análise

## Objetivo e sequência

Registrar de forma durável os 1..50 alvos e todos os IDs de preparação antes
de habilitar o primeiro produtor de bytes. A2a já adota gerações juntas.
A2b1 entrega a reserva e seu cancelamento sem filhos; A2b2 deve ligar cada
unidade de inspeção/criação/upload/composição ao pai na mesma transação,
incluindo bindings nativos e cleanup dos filhos. A2c continua responsável
por aplicar locais/globais/novos com crédito/recibo reais uma única vez.

## Requisitos e critérios

1. Reutilizar o contexto lógico reautorizado de A1 e a validação vigente de
   patches, nomes, destinos, duplicatas e alterações reais, sem reduzir 50.
2. Reserva interna parte de análise ready original e livro/capítulo autorizados,
   dentro da mesma transação. Fixar nascimento de análise/livro/capítulo,
   fingerprint, revisão, hashes de texto/pedido e expiração.
3. Manifesto fechado mantém apenas metadata/hash dos patches e origem nativa
   dos alvos existentes. IDs de criação/inspeção/edição/uploads derivados no
   servidor, com plano completo para todos os filhos antes de qualquer byte.
   Não guardar prosa do compêndio nem segredos.
4. Contexto imutável, estado e evento/prova nativos compartilham nascimento.
   Get/retry são metadata; mudança de intenção ou recriação quebra o token.
   Replay depois de revogação/expiração não autoriza produzir ou ler prosa.
5. Cancel-before-start cria fence permanente. Cancelamento de reserva sem
   filhos é atômico e retomável após revogação, sem crédito/clock/cabeça.
   Presença de filho é bloqueio de reconciliação neste passo, nunca sucesso
   presumido: A2b2 deve coordenar filhos antes de habilitar seus produtores.
6. Exclusão do livro descobre a nova reserva antes de limpar edições/campos,
   valida cutoff/nascimento e fecha reservas sem filhos na mesma transação
   do checkpoint. Preservar jobs/fences metadata e checkpoints legados.
7. Node/SDK: 1/50 alvos locais/globais/novos, validações, retries/concorrência,
   recriações, revogação, rollback, cancel-before-start, filho desconhecido e
   exclusão com reserva, sem bytes ou débitos. Regressões dirigidas da análise
   e exclusão, sintaxe/lint/arquitetura/docs/formato, revisão e commit local.

## Arquivos, pressupostos e limites

Extrair o leitor de contexto e validadores puros atuais sem mudar revisão ou
limites da análise. Novo plano/contrato/store/serviço da reserva e hook interno
em createLoreAnalysisService; não acrescentar callable ou UI. Integrar
atividade/fase de exclusão e acrescentar fixtures/testes e documentação/ADR.

Somente código servidor confiável pode iniciar a reserva. O cliente atual
continua usando o contrato existente; applyLoreAnalysis ainda recusa payload.
A reserva não é certificado de conteúdo pronto nem grant de origem.
A2b2/A2c, demais writers/consumidores/backup/cliente/rollout e certificação de
P1/F2-09/V2 continuam obrigatórios. Validate integral no fim do bloco P1.
Sem dependências, CI remota, push, PR, merge ou deploy.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-reserva-nativa-do-lote-da-analise.md)
e [ADR 0111](../../../decisions/0111-native-lore-analysis-application-reservation.md):
220 Node distintos e três SDK positivos em rodadas dirigidas. Corrigido hash
de texto JSON histórico. Rodada final SDK interrompida por OOM nativo; somente
o caso interrompido foi retomado com recursos limitados, positivo.

A2b1 implementado internamente como reserva metadata sem produtores.
A2b2/A2c, demais integrações e validate integral de P1 permanecem pendentes.
Somente commit local; sem CI/push/deploy.
