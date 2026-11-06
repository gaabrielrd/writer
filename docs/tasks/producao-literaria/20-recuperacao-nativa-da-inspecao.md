# Incremento 20 — Origem nativa e encerramento de início incerto

## Estado

Implementado em código, com testes preparados e não executados neste turno. O turno
anterior foi progresso: interface e acompanhamento de inspeção. Este incremento trata
a pendência de recuperação apontada no incremento 19; ainda não comprova aceites,
validação integral ou liberação do fluxo.

## Início vinculado à encarnação

getLiteraryPassageInspectionScope é uma consulta autenticada de metadata. Seu hash
vincula actor, livro, nascimento nativo do livro, capítulo e identidade nativa do
capítulo. Não lê corpo, gera, escreve ou debita. É a quinta ação da inspeção no mesmo
planningApi: 435 ações nos mesmos 16 setores, sem nova Function.

Novos starts exigem expectedScopeToken. A interface consulta a origem antes da reserva
local, persiste o token junto do ID e repete somente esse input. O servidor confere o
token na transação de criação e guarda fingerprint do início. Recriar livro/capítulo
com os mesmos IDs não autoriza o pedido antigo. Replay precisa corresponder à mesma
intenção; não refaz a captura de origem para adotar silenciosamente um novo projeto.

O token fixa identidade, não uma versão de prosa aprovada. A inspeção continua
capturando/conferindo o inventário atual; só a seleção explícita posterior leva a prova
ao registro do ciclo. Uma consulta de scope nunca autoriza geração ou publicação.

## Encerramento antes da resposta do início

cancelLiteraryPassageInspection aceita alternativamente a intenção original completa
(chapterId, publicationId, expectedScopeToken e inspectionId), sem exigir que o cliente
já tenha visto nascimento/revisão do registro. Se o ID estiver ausente, cria uma reserva
negativa permanente, sem corpo, certificado ou capacidade de ingresso. Se o início já
existir, fecha apenas o mesmo fingerprint. Um start em trânsito não atravessa o fence;
repetir o encerramento é idempotente.

Não exige que capítulo ou estrutura antigos ainda estejam disponíveis. Mantém autorização
do livro e o vínculo de nascimento das inspeções existentes. O modo de cancelamento
por CAS nativo continua disponível para registros legados observados. Não misturar os
dois formatos nem usar not-found para apagar intenção incerta.

Na interface, o cancelamento é independente do start pendente. Um epoch em RAM invalida
ACKs/erros/consultas/avanços antigos. Após consultar o encerramento confirmado, a tela
não precisa esperar o start antigo terminar. Remoção local continua separada e compara
toda a intenção sob Web Lock curto.

## Intenção de cancelamento durável

Antes de HTTP, o adaptador grava cancelRequested true monotonicamente no mesmo registro
metadata. Recarregar não reabilita início, avanço ou seleção quando esse encerramento
ainda é incerto. CAS recusa substituir IDs/token ou remover dívida usando uma cópia
anterior ao cancelamento. HTTP não mantém Web Lock aberto.

Novos registros v2 guardam os IDs, expectedScopeToken e cancelRequested, sem prosa,
chave, cursor ou aprovação. V1 é preservado para consulta e encerramento de inspeção
existente; não inventa um token atual para recriar seu início. Metadados legados sem
flag são conservados, e o cancelamento explícito pode acrescentá-la sem mudar IDs.

## Casos preparados, não executados

- Servidor: início sem token, recriação do livro e capítulo, reserva negativa antes do
  start, replay fechado, cancelamento após remover o capítulo/mudar estrutura e recusa
  de outra intenção. Cenários existentes atualizados para consultar scope antes do start.
- Interface: resposta tardia após encerramento, cancelamento sem esperar start, retomada
  de cancelRequested sem reabilitar produção e ausência de reautorização de metadata v1.
- Adaptador: token persistido, formato fechado, legado preservado e cancelamento durável
  monotônico com CAS integral. Registro de setores passa a esperar 435 ações.

Não executados testes, tipos, lint, formato, build, navegador ou cobertura neste turno.
Os arquivos precisam de formatação/revisão e dos gates no fechamento. Resultados dos
incrementos 15 e anteriores não comprovam estas mudanças.

## Pendências do objetivo integral

Próximo incremento: fornecer a inspeção por unidade ao driver e à interface de sequências,
com parada específica de publicação, sem fallback ou reenvio automático de pedido incerto.
Fechar casos de recuperação em concorrência/conta, inclusive após exclusão do projeto,
e prova visual em temas/teclado/telas estreitas no fechamento. Continuam os aceites E1–E4,
E5 impacto e portabilidade editorial .writer como nova cópia privada, cobertura global
mínima de 90% em funções e validação integral.

Antes dos testes finais, conferir/incorporar a principal conforme solicitação do autor.
A base incorporada atual permanece identificada como 16d8af5; não declarar que inclui
commits posteriores sem conferência. Sem commit literário, merge de volta, push ou deploy.
