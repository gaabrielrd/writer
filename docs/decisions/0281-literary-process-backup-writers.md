# ADR 0281: Coordenação explícita dos escritores editoriais e conclusão da limpeza

Status: implementação local parcial; validação pendente.

## Contexto

Processos editoriais avançam em transações que nem sempre alteram a raiz do livro. Uma captura privada precisa distinguir esses commits. Cancelamentos podem ainda gravar metadata durante a exclusão.

## Decisão

Usar chamadas explícitas aos escritores selecionados de onze famílias. Validar método e pai exato, encaminhar argumentos nativos e gravar o marcador privado na mesma transação. Preservar autorização, precondições, raiz e clocks semânticos. Não interceptar Firestore ou transações globais.

Passar o contexto do livro no persistidor de checkpoints de publicação e em todos os seus chamadores. Identificar a observação como process-headers-partial, com famílias no token privado. Não usar essa observação como autorização nem habilitar o produtor v2 antes da auditoria/captura completas.

Na finalização da exclusão, conferir o marcador e reiniciar a varredura literária limitada quando houver escrita tardia. O marcador é removido ao final do inventário, com os filhos, antes da raiz.

## Consequências

Mutações selecionadas invalidam a captura sem alterar manuscrito ou créditos. Há uma escrita privada adicional por chamada de cabeçalho. Unidades/corpos fora do commit conjunto precisam ser auditados/projetados conforme seu próprio protocolo. Instâncias antigas precisam ser drenadas antes de habilitar a exportação.

Ver [incremento 33](../tasks/producao-literaria/33-coordenacao-dos-escritores-do-processo.md). Os casos preparados, incluindo SDK real, ainda não foram executados.
