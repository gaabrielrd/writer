# ADR 0112 — Produção e limpeza vinculadas ao lote da análise

- Data: 2026-10-24.
- Estado: aceito internamente, sem aplicação ou cobrança reais.
- Plano: [97 / A2b2](../tasks/writer-v2/execucao/97-preparacao-vinculada-do-lote-da-analise.md).
- Antecedentes: [ADR 0111](0111-native-lore-analysis-application-reservation.md) e
  [ADR 0110](0110-atomic-book-lore-adoption-batches.md).

## Contexto

O manifesto já fixa até 50 alvos e IDs. Preparar fora da transação do pai
permitiria bytes após cancelamento ou checkpoints sem seu filho. Um filho
existente também não pode continuar pelo serviço singular contornando o pai.

## Decisão

Workflow v2 acrescenta cursor de membro/etapa/campo, contagem de preparados,
ready e intenção cancelling com cursor de cleanup. Eventos, índices de
operação e provas imutáveis vinculam cada update nativo do estado. Fences,
tokens e eventos v1 permanecem válidos. Replay devolve somente metadata.

Cada nova unidade confere pedido, CAS e reabre análise original/provedor,
nascimentos observados de livro/capítulo/universo, expiração e contexto lógico
completo. A abertura autorizada é capacidade ligada ao objeto da transação.
Não se concede autoridade por DTO, token de recuperação ou certificado antigo.

IDs analysis-<hash>, analysis-source/edit/field-<hash>, com hash hexadecimal
de 64 caracteres, são reservados ao protocolo. Ao criar o filho, gravamos
loreAnalysisChildOwners e loreAnalysisChildOwnerProofs junto de sua raiz e
do evento/checkpoint do pai. Registros fixam pai/token/membro/tipo/ID, hash
da intenção/start e unidade original. Leitura confere os nascimentos de raiz,
proprietário, prova e evento, além do manifesto.

Produtores singulares exigem a capacidade exata da unidade para esses IDs.
Criação/inspeção vinculadas só originam filhos previstos. Uma edição pode
ler um campo planejado já selado como dependência, após conferir seu vínculo;
isso não concede a capacidade de produzir bytes nesse campo. Materialização
inline continua sob as provas internas da edição. Adoção singular dos
membros reservados é bloqueada: A2c deve autorizar a adoção integral.

Serviços de criação, inspeção, campo, edição e composição aceitam transação
injetada para o coordenador. Não abrem nested transactions. Leituras terminam
antes dos writes; filho, registros de proprietário e checkpoint confirmam
juntos. Cada chamada faz uma unidade: inspeciona, prepara campo/parte/selo,
reserva a geração, compõe ou audita. Valores dos patches são conferidos pelo
hash do pedido a cada chamada, sem prosa livre em checkpoint.

Ao concluir um membro, certificado/prova metadata fixam sua referência CAS
pronta e nascem junto do avanço do cursor. Globais recebem certificado metadata
e conservam a fonte fixada; não são escritos. Ready exige todos os membros.

Cancelamento fecha o pai antes da limpeza. Sem filhos/artefatos pode concluir
diretamente; com atividade entra em cancelling. Cleanup avança uma unidade
na ordem edição, campos e origem, depois audita certificados e registros.
Confere vínculos originais sem reautorizar produção ou devolver prosa.
Estrangeiros, recriados e sucesso adotado não são apagados por inferência.

Exclusão do livro coordena intenção/cleanup da aplicação e checkpoint na mesma
transação, preservando cutoff/nascimentos e metadata permanente. Rules negam
SDK em toda a árvore dos registros de proprietário e provas. Não há índice
composto, dependência ou endpoint novo.

## Consequências

A2b2 entrega preparação/ready e limpeza internos. Não cria/troca cabeças,
não avança clocks de lore e não debita. A2c deve validar a prontidão e origem,
autorizar adoção de todos os membros e confirmar locais/globais/novos,
crédito e recibo reais juntos. applyLoreAnalysis continua recusando payload.

A restrição de A2b1 a cancelamento sem filhos é substituída pela intenção e
limpeza coordenadas. Dados sem prova original continuam exigindo reconciliação.
Leituras históricas de metadata não comprovam disponibilidade ou autorização
do conteúdo. Demais writers/consumidores/backup/cliente, rollout e certificação
de P1/F2-09/V2 permanecem obrigatórios; nenhuma implantação foi realizada.
