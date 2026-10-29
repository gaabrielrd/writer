# ADR 0227 — verificação terminal da exclusão de aventuras

- Data: 2026-10-28.
- Estado: motor interno implementado; plano 199 e fluxo público abertos.
- Base: 1d7a6b6. Complementa a [ADR 0226](0226-adventure-deletion-chat-and-activity.md).

## Decisão

A fase verify repete por páginas de dez a inspeção dos corpos de contextos e
turnos e dos controles. A passagem é somente por metadata: não hidratar prosa
nem retirar dados nessa fase. Corpo próprio comprovado reabre controls com o
cursor reiniciado e os certificados posteriores descartados. Contradição entre
escopo congelado do corpo e seu controle recusa; não alternar indefinidamente
entre inspeção e limpeza de um corpo que pertence a outro projeto.

A última unidade relê as 23 famílias de autoria com limite um, usos de imagens,
retomada canônica e fontes/chaves/mídia. Consulta também corpos derivados pelo
escopo congelado indexado e contextos próprios ainda não encerrados. As
passagens limitadas dependem da reserva permanente e dos guards já integrados
que impedem novos escritores da origem. Certificados e contadores anteriores
não substituem as consultas vazias atuais no commit terminal.

Família conhecida reaparecida reabre children na família exata; uso de imagem
reabre images, corpo reabre controls, contexto não encerrado reabre quiescence
e atividade reabre activity. Truncar certified até a fase reaberta, reiniciando
os cursores posteriores. Identidade recriada ou sem prova continua recusada e
preservada. Fontes inconsistentes não recebem certificado nem são promovidas.

Somente depois dos vazios, compor remoção da raiz presente, reserva deleted,
job complete e recibo imutável na mesma transação. Contar a raiz uma vez quando
presente; raiz já ausente não é recriada nem contada. Preservar o nascimento
inicial de job/reserva. Leitura terminal exige raiz ausente e updateTime nativo
de reserva e job igual ao nascimento do último recibo. Enquanto deleting, a
reserva conserva updateTime do recibo inicial. Metadata copiada em documento
recriado não substitui essas provas.

Retry exato devolve recibo original e progresso atual, inclusive após perda de
ACK terminal ou reinício do serviço. Pedido novo após complete não executa nova
unidade. Reserva permanente continua bloqueando criação e leitura de origem
reaparecida. Perguntas próprias, recibos, campanhas e biblioteca independente
são preservados; esta etapa não decide a política final pendente de perguntas.

Três índices de metadata declarados localmente: contextos por fase/escopo,
contextBodies por origem congelada e turnBodies por origem no grupo documental.
Não alterar layout v1 nem atribuir migração a jobs públicos ainda inexistentes.

## Evidência e limites

123 Node dirigidos e seis SDK/Rules demo passaram. O SDK prova commit terminal
concorrente, relógios nativos, retomada após reinício, vizinho preservado,
pergunta legível, reaparecimento de autoria/usos/atividade e recusa de raiz,
reserva ou corpo recriados. Dados de teste são sintéticos; o SDK novo usa
aventuras criadas no Estúdio, não um roundtrip nativo completo de restauração.

Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-verificacao-terminal-da-exclusao-de-aventuras.md).
O motor interno chega a complete. Transporte autenticado, cliente/UI/retomada,
política final de perguntas e validate integral do bloco ainda faltam.
Não há endpoint público, implantação, CI ou operação remota.
