# ADR 0110 — Adoção conjunta e comprovante nativo de lotes de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem liberar applyLoreAnalysis sobre payload.
- Plano: [95 / A2a](../tasks/writer-v2/execucao/95-adocao-conjunta-das-geracoes-de-lore.md).
- Antecedentes: [ADR 0101](0101-atomic-lore-generation-adoption.md),
  [ADR 0107](0107-native-book-lore-creation-activation.md) e
  [ADR 0109](0109-logical-lore-analysis-context.md).

## Contexto

A aplicação da análise precisa preservar até 50 itens e confirmar fichas,
crédito e recibo juntos. Chamar a adoção singular em várias transações faria
aplicação parcial e invalidaria o clock das fontes seguintes. Juntar recibos
individuais depois do sucesso não comprova que houve uma transação conjunta.

## Decisão

A adoção tem duas etapas internas na transação do caller: preparação faz
somente leituras/validações; commit faz somente writes. O serviço singular
usa esse mesmo plano e conserva pedido, hashes e formato dos recibos.

prepareBookLoreEditAdoptionBatch recebe batchId e 1..50 pedidos CAS canônicos.
Exige IDs de edição e alvos distintos, mesmo UID, livro e nascimento original.
Reabre fonte/compilação ready de cada membro antes de gravar. Prepara todos
os efeitos sem iniciar outra transação; o caller ainda pode conferir saldo
e recibo antes de commit. Leituras irmãs sempre terminam antes de rejeitar
uma falha, para não usar a transação depois de seu rollback pelo SDK.

Cada cabeça, geração ativa, aposentadoria anterior, lease lógica, recibo de
edição e comprovante do criador nasce no mesmo commit. Timestamp é comum e
monotônico para livro e todas as fichas. localLoreVersion avança uma única vez.
Se algum membro retirar consentimento, o lote revoga publicação uma vez e
avança publicationPrivacyVersion uma vez; cada adoção conserva seu próprio
before/after e revoked, compartilhando a versão final. Publicar não é automático.

Dois documentos imutáveis sob a primeira edição registram sucesso do lote:
adoptionBatches/{batchId} e adoptionBatchProofs/{batchId}. Fixam UID, intenção
ordenada, livro/nascimento, timestamp/versões e progressos metadata originais.
O comprovante e sua prova precisam compartilhar nascimento com todos os
recibos/eventos originais de adoção. Replay compara o registro inteiro com
os pedidos e sucessos individuais revalidados. Perda/recriação da prova,
intenção divergente, sucesso individual sem prova conjunta ou lote misto
não são tratados como aplicação atômica.

Esses documentos não contêm prosa/descritores, não concedem leitura e nascem
somente no sucesso. Não há preparação/bytes própria do lote: membros continuam
sob inventários e cancelamentos existentes. O comprovante fica abaixo do job
permanente já preservado pela exclusão. Reedição/GC/retirada/exclusão podem
remover corpos e raízes sem apagar a confirmação metadata ou ressuscitar fichas.

O limite de metadata serializada do comprovante é 900000 bytes, abaixo do
limite de documento do Firestore. Não é limite de autoria. Corpos e relações
já estão preparados; adoção não regrava partes, headers ou leases individuais.
A transação deve caber nos limites reais de tamanho/tempo do Firestore.
Referências: [quotas](https://firebase.google.com/docs/firestore/quotas) e
[transações](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Consequências

A2a oferece o ponto de composição, sem cobrar crédito por si nem expor callable.
A2b/A2c ainda precisam preparar/inventariar/cancelar o lote da análise e compor
seus alvos locais/globais/novos com débito e recibo reais. Testes de saldo usam
caller de teste; não são prova de integração de cobrança da análise em produção.
applyLoreAnalysis continua recusando alvos payload antes de writes/débito.

Demais escritores, consumidores, backup/cliente, rollout e certificação de P1
continuam pendentes. Não há mudança de Rules/índices/dependências ou deploy.
