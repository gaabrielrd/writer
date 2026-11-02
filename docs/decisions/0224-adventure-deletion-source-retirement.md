# ADR 0224 — fontes da exclusão de aventuras e retirada de mídia pendente

- Data: 2026-10-28.
- Estado: integração interna implementada; plano 199 aberto.
- Base: dcf3135; complementa a [ADR 0223](0223-adventure-deletion-quiescence.md).

## Contexto

Excluir uma aventura ativada não pode publicar uma imagem ainda preparing,
deixar a chave de recuperação acessível ou quebrar os recibos da restauração.
A coleta original só retira a chave depois de concluir a mídia. Importações
ativadas possuem manifests externos à raiz, com nascimento diferente dela.

## Decisão

O avanço da exclusão compõe uma unidade dos controles originais de mídia/coleta
com seu próprio checkpoint e recibo. Não reescreve o job ativado nem seus
recibos congelados. Não usa a limpeza pré-ativação como exclusão do projeto.

Na parte de restauração, consultar somente jobs do UID/adventureId e provar a
encarnação pelo store original e pelo nascimento conjunto do job/raiz. Reserva
original de kind job sem head não significa ausência de fonte: recusar.
Continuar mídia e coleta já iniciadas ou comprovar a coleta concluída com
nova consulta vazia, inclusive quando a raiz da aventura não existir mais.

Mídia pendente usa uma entrada interna de retirada, sem opção equivalente nos
pedidos públicos. Conferir reserva permanente de exclusão, UID, aventura,
nascimento original, intenção e proveniência da biblioteca. Nenhum accept é
chamado por esse caminho. Retirar a geração física e reconferir contexto/CAS
depois do I/O; só então desligar o uso original e marcar a imagem deleted.
O recibo unavailable e o checkpoint original de mídia ficam no mesmo commit do
recibo/checkpoint da exclusão. Um accept iniciado antes da exclusão pode ter
alterado o Storage, mas não pode publicar após a retirada e a revalidação.

A imagem já ativa é uma cópia própria da biblioteca e permanece preservada,
assim como personas e campanhas independentes. Seus usos de projeto terão a
limpeza própria da fase seguinte; este passo não exclui arquivos ativos.

Depois da mídia completa, reutilizar a preparação transacional da coleta
original. A primeira unidade retira a chave por máscara de metadata e preserva
a compatibilidade do sidecar. A coleta permanece limitada às famílias originais,
com prova de journals/artefatos e consulta final vazia. Artefato que reaparece
depois de done impede a exclusão de saltar essa fonte.

Para importações, conferir metadata de job/reserva e o recibo imutável de
ativação: nascimento da raiz coincide com o recibo, não com o job. Job/token,
checkpoint e updateTime precisam corresponder. A chave já deve estar ausente.
Retirar até oito manifests por unidade após conferir índice, nascimento e
recibo original de append; não selecionar título nem texto do manuscrito.
Verificar sequência completa e consulta vazia desde o início. Guardar job e
recibos ativados como metadata histórica.

Após essas unidades, a verificação de chaves por adventureId também recusa
IDs órfãos. Só então certificar quiescence e mover para a fase media. As fases
seguintes ainda não estão implementadas; isso não certifica a exclusão inteira.
Os dois índices de operações de importação foram declarados apenas localmente.

## Validação e limites

Testes dirigidos cobrem retirada física, imagem ativa, coleta parcial/concluída,
raiz ausente, origem/recibo recriados, gaps de manifest, falhas de I/O/commit e
ACK perdido. 76 cenários Node distintos passaram em rodadas sobrepostas.
13 cenários SDK/Rules distintos passaram em rodadas; a jornada nativa completa
de mídia/coleta passou isoladamente em 274595,1786 ms após dois limites de
tempo insuficientes na preparação. Resultados e limites estão na
[evidência parcial](../entregas/2026-10-28-writer-v2-fontes-na-exclusao-de-aventuras.md).

Plano 199 e P2/P3/D/F2-09/V2 continuam abertos. Não há endpoint nem UI de
exclusão. Autoria, usos restantes, chats derivados, controles/atividade, vazio
final e remoção da raiz ainda faltam. Perguntas próprias permanecem enquanto
sua política na exclusão inteira estiver pendente. Validate integral no
fechamento do bloco; sem CI, push ou deploy.
