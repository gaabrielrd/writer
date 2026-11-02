# P1 / M38c4b A2a — Adoção conjunta das gerações de lore

## Objetivo

Compor a adoção de 1 a 50 fichas preparadas numa transação com o futuro débito/
recibo da análise, sem aplicar itens parcialmente ou reduzir o limite vigente.
A1 já lê contexto lógico; A2b ainda precisa preparar o lote de análise e seu
cancelamento antes de expor essa aplicação.

## Contratos e sequência

1. Separar leitura/validação da adoção e seus writes em plano commit, preservando
   a API singular, os hashes/recibos e as provas atuais. Plano permite ao caller
   ler/verificar saldo e recibo antes de gravar qualquer alteração.
2. Lote interno fechado batchId/requests, 1..50 pedidos CAS canônicos,
   IDs/tentativas/fichas distintos e mesmo UID/livro/nascimento. Revalidar
   todas as origens/compilações prontas antes dos writes.
3. Calcular timestamp comum monotônico, um avanço localLoreVersion e uma
   revogação/versão de privacidade por lote se algum item retirar consentimento.
   Criar/trocar cabeças, ativar/aposentar gerações, leases lógicas e recibos
   originais de cada edição na mesma transação. Criadores ganham sucesso nativo.
4. Comprovante/prova imutáveis do lote sob a primeira edição fixam intenção
   ordenada e resultados metadata. Nascimento deve coincidir com todos os
   recibos/eventos de adoção. Não aceitar todos adopted como prova de lote:
   sucessos individuais ou misturas sem comprovante conjunto são recusados.
5. Replay do comprovante conjunto confirma metadata após reedição/retirada/
   exclusão e revogação, sem conceder prosa nem recriar cabeça. Mudança de
   intenção, comprovante/recibo recriado ou membro divergente falha.
6. Metadata do lote não cria bytes ou preparação própria: nasce somente junto
   do sucesso, como descendente do job permanente já inventariado. Cancelamento/
   exclusão dos membros mantém seus protocolos e conserva provas do sucesso.
7. Testes Node/SDK de duas e até 50 fichas, criação/edição mistas, privacidade,
   CAS/replay/concorrência, falhas em qualquer membro/raiz/recibo/débito composto,
   ausência de leituras após writes e coleta/exclusão posteriores.
8. Checks dirigidos, revisão, docs/ADR/AGENTS/evidência e commit local.
   Sem novo callable/UI/dependência/CI/push/deploy. Validate no fim de P1.

## Limites e evidência externa

Transação única deve caber nos limites reais de request e tempo do Firestore,
com corpos já preparados fora dela. Conferir custo e teste nativo de 50 itens;
não quebrar a atomicidade com bulk/commits paralelos para contornar limites.
Fontes oficiais: [quotas](https://firebase.google.com/docs/firestore/quotas) e
[transações](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Arquivos e fronteira

Núcleo de adoção e commit de edição, novo contrato/store do comprovante de lote,
fixtures/testes e docs. Preservar contratos de criação, provas de leases,
aposentadoria/coleta e compatibilidade singular.

A2a não habilita applyLoreAnalysis em payload. Próximos A2b/A2c precisam
inventário/reserva/cleanup da preparação multi-item e ligação com crédito/recibo
da análise no mesmo commit, mantendo local/global/novas fichas e até 50 itens.
Demais escritores/consumidores/backup/cliente e P1/F2-09/V2 continuam abertos.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-adocao-conjunta-das-geracoes-de-lore.md)
e [ADR 0110](../../../decisions/0110-atomic-book-lore-adoption-batches.md):
37 Node novos e 206 de regressão positivos. Quatro SDK distintos positivos em
duas rodadas; a retomada dos dois casos afetados passou após corrigir leituras
irmãs que sobreviviam à rejeição da transação. O caso nativo de 50 payloads
confirmou adoção/aposentadoria conjunta com um único clock e sem bytes escritos.

A2a implementado internamente. A2b/A2c, demais integrações e validate integral
de P1 permanecem pendentes. Somente commit local; sem CI/push/deploy.
