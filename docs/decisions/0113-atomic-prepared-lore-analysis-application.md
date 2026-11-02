# ADR 0113 — Aplicação atômica do lote preparado da análise

- Data: 2026-10-24.
- Estado: aceito internamente; integração de cliente e rollout pendentes.
- Plano: [98 / A2c](../tasks/writer-v2/execucao/98-aplicacao-integral-da-analise-preparada.md).
- Antecedentes: [ADR 0110](0110-atomic-book-lore-adoption-batches.md),
  [ADR 0111](0111-native-lore-analysis-application-reservation.md) e
  [ADR 0112](0112-bound-lore-analysis-application-preparation.md).

## Contexto

Ready certifica preparo, sem conceder autorização atual nem comprovar adoção.
Aplicar os locais por chamadas singulares ou cobrar depois de adotar permitiria
lote parcial e cobrança sem commit integral. Recibo mutável no ticket também
não deve substituir os comprovantes nativos após limpeza das origens.

## Decisão

applyLoreAnalysis mantém id/text/changes e resultado applied/credits. Na mesma
transação lê ticket e aplicação. Recibo legado, sem propriedade application,
mantém confirmação pelo hash JSON histórico. Preparação usa o hash canônico
do manifesto; a diferença de ordenação de propriedades não altera sua intenção.
Uma marca application presente, inclusive nula/inválida, não permite fallback
para o resultado mutável do ticket se faltar sucesso preparado comprovado.

Sem reserva, o caminho antigo inline/global permanece; payload continua exigindo
preparo. Com reserva ready, o finalizador reabre análise/provedor, encarnações
e contexto lógico atuais. Preparando/cancelado bloqueia o legado antes de
escrever ou cobrar. Reserva e aplicação legada não correm fora dessa leitura
transacional. Não se executa a preparação inteira dentro de uma chamada longa.

A capacidade de adoção exige todos os certificados/provas de membro, IDs
exatos e proprietários nativos das edições previstas. Só a API agregada
recebe um objeto opaco ligado à transação, abertura autorizada e hash do lote
local completo. Adoção singular continua bloqueada mesmo após o grant e a
abertura agregada. Capacidade de adoção não autoriza produtores de bytes.

A2a planeja a adoção de todos os locais. Globais existentes recebem somente
patch e data; novos recebem defaults privados e criam IDs fixados no manifesto.
Todas as leituras e validações terminam antes das gravações. Um timestamp
comum respeita datas anteriores; o clock local, o global e a invalidação de
autorização global avançam uma vez quando aplicáveis. Relações e consentimento
existentes permanecem intactos.

Cabeças/gerações/criadores/leases, globais, débito, ticket e estado applied
confirmam junto do recibo/prova permanentes. Plataforma custa um crédito por
lote; BYOK custa zero, sem update de saldo. Não existe débito por membro.
Ausência/saldo inválido bloqueiam o commit; repetir sucesso não lê saldo atual.

Recibo fixa contexto, intenção, provedor/custo, saldo observado/resultado,
encarnação do usuário, versões, timestamp e referência ao grupo A2a. Seu
nascimento coincide com prova, evento final, update do estado e grupo conjunto.
Load de applied exige esse comprovante. O leitor histórico verifica o grupo
original antes de invocar replay A2a, sem commit; não pode fabricar grupo
a partir de sucessos individuais nem autorizar nova adoção por recibo.

Confirmação metadata permanece após expiração, topup, revogação, reedição,
retirada/coleta e exclusão do livro/ticket. Não reabre fonte nem recria raiz.
Recibos/provas/grupos recriados ou ausentes exigem reconciliação. Cancelar
sucesso é recusado; exclusão verifica applied, conserva metadata e deixa o
inventário geral aposentar/coletar os recursos adotados.

## Consequências e portões restantes

A aplicação preparada interna agora integra o débito real no contrato existente.
Não há novo callable/UI, dependência, índice composto ou implantação. A
orquestração do preparo e recuperação no cliente/endpoints permanece necessária,
assim como demais writers/consumidores, backup, ativação/rollout e certificação
de P1/F2-09/Writer V2. Condições humanas/comerciais não foram encerradas.
