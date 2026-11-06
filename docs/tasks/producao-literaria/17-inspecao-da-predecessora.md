# Incremento 17 — Inspeção paginada da predecessora imediata

## Estado e escopo

Implementado em código, sem testes ou validações executados neste incremento.
Continuação do plano integral: a passagem selecionada passa a poder exigir a prova da
predecessora imediata. O incremento anterior foi progresso: criou a prova nativa de
edição confirmada. Nenhuma das cinco etapas está formalmente encerrada.

Ainda não habilita a política obrigatória de publicação anterior. Permanecem pendentes
a admissão da primeira unidade sem ciclo predecessor, a prova integral do ato, a
escolha operacional pelo autor, a interface e a recuperação durável correspondente.
A seleção opcional não deve ser apresentada como bloqueio obrigatório antissalto.

## Inspeção no servidor

A coleção privada literaryPassageInspections guarda um checkpoint constante em tamanho:
capítulo-alvo, predecessora, última unidade do ato anterior, identidades, contadores,
cursor e hashes. Não guarda prosa nem uma lista integral de capítulos. A inspeção percorre
o livro inteiro em páginas de até 25 capítulos e depois reconfere todos os metadados
em uma segunda passagem. O livro não tem limite total de capítulos.

A ordem usa o comparador canônico existente: atos ordenados, desempates pelos IDs,
capítulos ordenados dentro do ato e capítulos sem ato ao final. Atos vazios não inventam
uma unidade anterior. Primeiro capítulo tem prova de ausência de predecessor após o
censo completo. O resultado também distingue a entrada no ato da continuação nele.

Cada avanço confere fence do livro, origem do alvo, revisão esperada e token da
encarnação da inspeção. O cliente não fornece cursor, predecessor ou inventário aprovado.
A segunda passagem compara conta e hash integrais, inclusive mudanças atrás do cursor
sem atualização compliant do clock. Uma inspeção incompleta não fornece certificado.

Start repetido não reinicia nem muda o alvo. Resposta perdida é consultada pelo mesmo
ID; repetir CAS antigo não percorre outra página. Get somente consulta. Se a origem
mudar, get devolve metadata stale com o token para permitir cancelamento, sem conceder
certificado. Cancel não depende do fence antigo, preserva o registro e impede recomeçar
com o mesmo ID. Não existe retry automático de mutação no cliente.

## Vínculo com o ciclo

O campo opcional passage.inspectionId exige uma inspeção ready do alvo atual. O servidor
compara a predecessora nativa da inspeção com o capítulo do ciclo anterior selecionado;
um ciclo concluído mais antigo não permite saltar uma unidade intermediária.

O certificado inclui nascimento da inspeção e do ato do alvo. Antes da entrada exige
o fence completo. Depois de passageEntered, preserva o ingresso já conferido diante
das próprias mudanças de prosa da unidade seguinte, mas reconfere identidade/posição
do alvo, encarnação do ato e versão da predecessora. Recriação ou mudança de posição
não herda o aceite. Não aceita entered ou qualquer permissão enviada pelo cliente.

A primeira unidade já pode ser identificada pelo leitor interno da inspeção. Sua
admissão obrigatória ainda precisa ser composta fora de uma passagem que exige ciclo
anterior; não fabricar um ciclo vazio para contornar esse requisito.

## Composição, privacidade e exclusão

As quatro ações start/get/advance/cancelLiteraryPassageInspection pertencem a planningApi,
com a factory de workflow existente. São 434 ações nos mesmos 16 setores; não há nova
Function. Cliente tipado usa domainCallable e exportação pública de literary-production.
A inspeção não gera, publica, altera manuscrito ou debita créditos.

Rules recusam SDK inclusive do dono. Índices automáticos do payload estão desabilitados.
A exclusão do livro inclui a nova coleção no inventário antes de remover a raiz.
Writes atualizam o clock de dependências literárias, sem invalidar o próprio fence
semântico da inspeção. Ainda falta compor a interface, listagem/retomada durável por
conta/livro e o inventário completo de impacto previsto em E5.

## Testes preparados, não executados

- Nove casos de serviço: livro de 61 capítulos, ordem entre atos/empates/vazios/sem ato,
  primeira unidade, CAS após ACK perdido, fechamento de inspeção stale, alteração atrás
  do cursor, latch após prosa própria, autorização/exclusão e recriação de livro.
- Dois casos com factories reais do workflow: recusa de salto e entrada com predecessora
  imediata certificada.
- Teste de exclusão semeia um órfão da nova coleção e exige ausência de todos os filhos.
- Rules incluem a coleção no teste de recusa de leitura/escrita SDK.
- Contrato de setores passa a exigir 434 ações únicas. Nenhum resultado foi executado.

Arquivos precisam de formatação, revisão e gates no fechamento antes da integração.
Os resultados anteriores de testes, build e cobertura não comprovam este incremento.
Sem commit, push, integração de volta ou deploy.
