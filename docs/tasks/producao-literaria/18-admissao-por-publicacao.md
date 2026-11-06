# Incremento 18 — Admissão nativa por publicação anterior

## Estado

Código em implementação; novos testes escritos e não executados. O turno anterior
foi progresso (inspeção paginada e vínculo antissalto opcional). Este incremento compõe
a exigência no servidor; não declara interface concluída, liberação ou aceite integral.

## Política e admissão

publicationPolicy v1 aceita requirePreviousPublication boolean opcional para capítulo
ou ato. Ausência preserva a forma legada; livro inteiro recusa true, pois não há unidade
predecessora dentro desse escopo. A IA continua sem escolher a política operacional.
A interface ainda precisa oferecer e explicar essa escolha; não há novo controle visível.

Quando true, o ciclo exige inspeção completa independentemente de o cliente selecionar
passage. A primeira unidade entra por prova nativa de ausência de predecessora, sem
ciclo fictício. Uma unidade posterior exige o ciclo da predecessora imediata, já revisto
e preservado, e sua prova publicada. Dentro de um mesmo ato não exige republicação a
cada capítulo: exige o ingresso confirmado da predecessora, sob a mesma revisão de
política e encarnação do ato. Capítulos sem ato são unidades individuais nessa regra.

A inspeção é vinculada ao scopeToken, registro, confirmação de registro e verificações
de identidade. admissionEntered é confirmado na passagem da preparação à primeira
versão. A escrita seguinte não revoga o ingresso já passado, mas continuam conferidos
contrato, identidades, posição, versão anterior e certificado preservado. Cancelar não
exige que uma origem antiga ainda esteja atual.

Nova redação de primeira versão avulsa é recusada quando a política exige admissão;
o caminho nativo do ciclo já confere a admissão antes de fornecer seu vínculo interno.
A política não publica automaticamente nem transforma recibo histórico em permissão.

## Cobertura integral da unidade publicada

A inspeção pode fixar publicationId. Depois do censo e da reconferência de ordem,
quando há publicação predecessora aplicável, percorre uma terceira fase em páginas
de até cinco capítulos. Confere cada projeção e origem da unidade selecionada pela
ordem nativa. Para um ato, confere todos os seus capítulos, não só o último.

O checkpoint mantém conta/hash do censo, conta/hash das provas, identidade única da
edição e uma âncora nativa. O resultado só fica ready se o censo inteiro continuar
idêntico e a âncora da predecessora tiver sido conferida. Não carrega todas as provas ou
corpos simultaneamente nem limita o tamanho total do livro. Uma projeção ausente em
qualquer ponto impede conclusão. Read do certificado reautoriza a âncora e os controles.

## Publicação e integração do ato

Confirmar publicação avança updatedAt, que faz parte do fence conservador da integração.
Para não obrigar nova geração do mesmo relatório, a passagem admite uma ponte estrita:
a inspeção publicada integral do ato precisa apontar a integração exata da edição,
com ID, origem e token nativo atuais iguais. Continua conferindo relatório aceito,
cobertura do capítulo/ato e autorização das fontes da síntese final. Um simples
recibo, status published ou coincidência de texto não substitui essa prova.

## Arquivos e composição

Novo módulo interno literaryWorkflowAdmission.mjs, composto em workflow e seus grants.
Ampliados literaryPassageInspection, literaryPublicationPassage e literaryWorkflowPassage.
Política pura e tipos mantêm campos fechados. Cliente tipado aceita admissionInspectionId
no scope/start e publicationId na inspeção. Nenhuma nova coleção, callable, dependência
ou preço neste incremento; mantém as quatro ações e inventário privado do incremento 17.

## Casos preparados, ainda não executados

- Contrato puro: boolean explícito para capítulo/ato e recusa de true para livro inteiro.
- Publicação: ato de sete capítulos atravessa páginas; ausência de qualquer projeção
  impede certificado mesmo que a última unidade esteja publicada.
- Workflow: omitir passagem não contorna política; primeira unidade entra por censo;
  redação avulsa é recusada; continuação do ato usa ingresso anterior; ciclo, integração,
  edição confirmada e admissão entre atos são compostos pelas factories reais.

Não há resultados novos de testes, lint, tipos, formato, build, navegador ou cobertura.
Os arquivos precisam de revisão/formatação e gates no fechamento antes da integração.

## Pendências para completar o fluxo

- Interface de escolha da política, preservação explícita ao trocar unidade e comparação
  no histórico; não deixar uma exigência ativa oculta no formulário.
- Interface de inspeção, seleção de edição e retomada metadata por conta/livro, sem
  avanço automático ao abrir ou reenviar start incerto.
- Fornecer inspeção/admissão ao driver de sequências, com parada própria de publicação;
  hoje o driver para ao encontrar a exigência, sem poder fornecer o novo certificado.
- Cobrir fronteira sem ato, revogação/recriação, CAS/resposta incerta e ponte inválida.
- Aceites E1–E4, E5 impacto e restauração editorial .writer como nova cópia privada,
  cobertura global e validação final. Sem commit, integração de volta, push ou deploy.
