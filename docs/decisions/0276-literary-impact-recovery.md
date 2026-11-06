# ADR 0276: Recuperação do mapa por intenção e recibo nativos

Status: implementação local; testes preparados, ainda não executados.

## Contexto

Uma investigação de impacto usa muitos passos. Reabrir o painel não pode reenviar um
pedido incerto, e uma resposta atrasada não pode retirar a intenção de cancelamento.
Resoluções privadas também não podem virar cache em claro no armazenamento local.

## Decisão

Usar journal próprio, com schema fechado e CAS integral por conta/livro/sessão sob
Web Locks que abrangem somente I/O local. Guardar intenção de início e correlação/CAS
dos passos; omitir rationale/evidence, nomes e resultados observados. O pedido de
resolução completo fica só em RAM e não é reconstruído após reload.

Consumir ACK apenas após recibo original e consulta fresca à mesma origem nativa;
reconferir a sessão dentro do lock. Consulta desconhecida não libera ponteiros e não
autoriza reenvio. Cada repetição é explícita, com o mesmo ID/hash e pedido congelado.

Expor `cancelLiteraryImpactOperation` pelo setor de planejamento. O recibo negativo
permanente disputa a mesma transação do produtor original; se vence, o produtor tardio
retorna cancelado. Se o produtor já venceu, o encerramento retorna o recibo original.
Método e nascimento nativo impedem tratar esse fence como cancelamento do mapa todo.

O cancelamento integral usa intenção monotônica própria e pode prosseguir sem esperar
a resposta do produtor. Consumo local depende de confirmação servidor; falta de recurso
ou mudanças de fonte não bastam. Preparação canônica de índices não é revertida.

## Consequências e verificação pendente

Texto não confirmado da resolução não é recuperado após encerrar a sessão. A interface
explica esse limite e pede confirmação para descartá-lo. Notas salvas são versionadas
no servidor e consultáveis como autoria própria sem reabrir fontes revogadas.

Os testes preparados abrangem CAS, troca de conta, quota, respostas tardias, cancelamento,
reload, fronteiras de transporte e corrida nativa Firestore. Precisam ser executados
no fechamento, depois de incorporar novamente a principal. Não há aceite de E5 nem
validação integral verde; o inventário histórico continua explicitamente parcial.
