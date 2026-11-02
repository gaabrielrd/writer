# ADR 0078 — Contribuição exclusiva de persona do rascunho

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M34a, pré-requisito da recuperação do rascunho

## Problema

O relatório semântico conta perfis distintos usados pelos vínculos salvos e
pela contribuição do rascunho. M31 preparava apenas os primeiros e exigia
igualdade com o total final. Um rascunho com perfil exclusivo era válido,
mas sua preparação falhava no manifesto de personas.

## Decisão

No fechamento book-personas, ler book-draft pelo índice lógico penúltimo,
verificando tipo/ID e item.verify na mesma transação. A gramática vigente do
pacote e o normalizador legado encerram os itens com draft e cover.
Nenhuma busca por nome, varredura de histórico ou caminho do cliente.

Se o rascunho declara persona, conferir a definição preparada por ID remapeado,
com journal/recibo/nascimento comprovados. Definição existente precisa ter
perfil e hash idênticos. Ausência comprovada registra personas.draftProfileId.
None, rascunho sem estilo ou perfil compartilhado registram null.

A igualdade permanece exata: profileCount dos vínculos salvos, acrescido da
contribuição exclusiva identificada no item verificado, deve ser igual a
totals.profiles. Não aceitar uma diferença numérica sem provar sua origem.
O descriptor não copia perfil, não consulta biblioteca e não concede acesso.

draftProfileId é opcional em progresso v5–v7; ausente conserva o significado
anterior de contribuição zero. Recibos que possuem o campo exigem a mesma
identidade no job atual; recibos anteriores não passam a exigir esse campo.
Nenhuma alteração de schema do arquivo, relatório semântico ou inventário.

## Consequências e continuação

O perfil exclusivo será preparado ao consumir o rascunho na continuação M34.
profileCount continua contando somente definições dos vínculos salvos;
draftProfileId identifica a contribuição exclusiva original e não deve ser
apagado ao prepará-la. A certificação final deve conferir todas as definições
comprovadas, inclusive esta, antes da ativação.

Este incremento corrige o avanço até draft, sem restaurar texto ou criar a
definição exclusiva. Raiz ausente/countReady false. Faltam rascunho como versão
separada, capa, integração de personas, campos grandes/consumidores,
certificação/ativação e host/UI/roundtrip/validate integral.
P1/F2-09 e Writer V2 continuam abertos.
Sem API pública, Rule, coleção, dependência, crédito, CI/push/PR/deploy novos.
