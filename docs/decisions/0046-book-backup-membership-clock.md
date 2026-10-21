# ADR 0046 — Clock de pertencimento de capítulos e atos

- **Estado:** adotado localmente em 2026-10-21; rollout não realizado.
- **Contexto:** [P1](../tasks/writer-v2/execucao/31-portabilidade-de-livros.md) e
  [M3a](../tasks/writer-v2/execucao/35-clock-da-estrutura-legada.md).

## Problema e decisão

Criação/remoção de capítulos pelo SDK e criação de ato com ordem igual a actCount
podiam deixar a raiz inalterada. Assim uma coleção paginada podia mudar sem
invalidar o token nativo da raiz. O SDK real reproduziu quatro casos indevidamente
aceitos. Contagem de palavras não resolve: capítulo vazio também muda a seleção.

Exigir o avanço de updatedAt da MESMA raiz na MESMA operação atômica de criação
de ato/capítulo e remoção de capítulo de livro ativo. Rules comparam get/getAfter
por bookId, aceitam somente data válida e exigem aumento estrito quando a anterior
já for válida. A raiz legada sem updatedAt válido pode receber a data da mutação,
sem fabricar createdAt ou alterar conteúdo histórico.

Usar o campo já atualizado pelos escritores atuais evita outro contador e uma
migração de schema. Ele não é prova de origem nem relógio de autorização. O token
de captura continua ligado a createTime/updateTime NATIVOS da raiz; avançar o
campo garante uma alteração observável dessa raiz. Mesmo se uma edição direta
posterior reduzir a data lógica, ela também muda o timestamp nativo. Não usar
somente igualdade do updatedAt lógico como substituto do token preciso.

## Compatibilidade e fronteiras

O código atual de books atualiza raiz e filho atomicamente ao criar/remover
capítulos, criar atos e organizar a obra. As operações válidas foram aceitas no
SDK, inclusive criar e remover 200 capítulos com uma atualização de raiz por lote.
O avanço em outro livro, antes/depois do filho, ou somente em título/contagem,
não satisfaz o novo contrato.

Limpeza de capítulo em livro já deleting mantém o fluxo anterior: não precisa
reescrever a raiz para cada filho. Captura de projeto deleting já é bloqueada.
Criação continua proibida nesse estado. Os gates de dono, progress resources,
contentMode, vínculo e persona continuam valendo; não são substituídos pelo clock.

Metadado direto de capítulo continua permitido. A prova SDK mostra updateTime
do capítulo mudando enquanto o token da raiz permanece igual: a captura completa
ainda precisa de readset nativo de cada recurso. Persona, controle de progresso
e mídia também têm suas próprias fontes. Não declarar snapshot integral por
este gate de pertencimento.

Rules não controlam Admin. Writers de Functions/manutenção ainda precisam de
auditoria e prova antes de concluir a captura P1. JSON v1–v6 e as APIs atuais de
exportação não foram substituídos por um snapshot completo neste marco.

## Consequências e validação

Clientes antigos que omitem a raiz serão recusados após implantação. Coordenar
writers/Rules e drenar essas instâncias antes do rollout. Nenhuma implantação foi
feita. O lote SDK de 200 prova o uso prático de get/getAfter com o mesmo livro no
emulador verificado, sem presumir orçamento de acessos por inspeção de código.

A prova usa Firebase Web SDK, Admin local e o serviço real de token M1. Nenhuma
fixture de UI demonstra esse contrato. As duas operações positivas antigas de
personas/publicação foram atualizadas para a atomicidade já usada pela aplicação;
todas as expectativas de privacidade e validação foram preservadas.

Sem campo/dependência/índice novos, mudança de conteúdo, publicação ou concessão
de acesso. P1 continua exigindo schema, captura restante, mídia, materialização
privada, revisão/remapeamento e roundtrip.
