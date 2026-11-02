# ADR 0207 — preparar biblioteca e usos das imagens de aventuras

Data: 2026-10-28. Estado: implementado internamente e validado localmente no bloco 183–185.

## Contexto e decisão

A capa única de um livro pode nascer com seu uso na transação de ativação.
Aventuras podem ter muitas imagens. Não limitar o formato para tentar escrever
todas na última transação. Preparar imagem+uso por unidade com journals nativos,
mantendo o ciclo existente dos livros: preparing, URL null e useCount 1.

Essa preparação física antes da raiz revisa a formulação de 182/ADR 0204, que
situava a criação da biblioteca com a ativação auditada. A disponibilidade continua
posterior à ativação e à finalização da mídia. Os leitores exigem active, a
listagem do servidor exclui preparing, rename recusa esse estado e remove
recusa o contador positivo. Rules continuam permitindo metadata somente ao dono
e negam escrita/usos pelo SDK. Não há novo gate ou permissão pública.

A origem v2 usa target adventure tipado, restoreId/jobToken, assetId e
installationOperationId. Não inventar bookId ou activationOperationId. A imagem
nasce no commit da instalação, não no futuro commit de ativação. A retirada
permanente aceita as duas origens, mantendo o mesmo contexto/provas Storage e
recusa de fallback para delete bruto.

## Instalação, auditoria e falhas

O instalador exige o selo original e seu recibo/jobHash nativos. Guarda essa
fronteira como prova histórica, remove os campos do selo operacional e instala
um ativo por intenção Storage prepared. Conferir intenção, binding e cabeça
nativos, imagem/filhos ausentes. Imagem, uso canônico, journals, checkpoint e
recibo nascem juntos. O uso tem a mesma chave e forma dos writers atuais.

Os dois novos endereços têm escopo image no usuário. Filhos uses têm prefixo de
journal que os limpa antes da imagem; o pai é conferido no mesmo escopo.
A limpeza final recusa imagens remanescentes que declaram a origem da aventura.
Cancelamento continua revogando personas e confirmando todos os fences de
Storage antes dos alvos; dados estrangeiros ou recriados são preservados.

image-library-ready exige uma imagem/uso por intenção. É obrigatória outra
auditoria, cujo layout inclui imagens da origem e seus usos e cujo contexto
inclui os contadores instalados. O selo inicial não autoriza esse inventário.

Contadores da nova auditoria reiniciam. Recibos até o checkpoint do selo original
continuam históricos e não são comparados aos contadores da rodada nova; todos
os demais contadores e a rodada atual preservam suas barreiras monotônicas.
A fronteira é o recibo nativo capturado pelo instalador, não um cursor do cliente.

## Limites

Registros preparing não podem ser selecionados como imagens ativas e não trazem
URL. O host de restauração ainda deverá concluir ou retomar a mídia pendente.
Depois da ativação, o finalizador precisará conferir nascimento e campos
imutáveis próprios da instalação, respeitando desvínculo/retirada e alterações
do usuário; não exigir igualdade integral ao journal histórico após mutações
legítimas nem religar a cabeça antiga.

Ativação atômica/reautorização do universo, aceitação/URL por ativo,
recuperação/UI/roundtrip, P2/P3/D/F2-09 e fases seguintes permanecem obrigatórios.
Não há novo endpoint, dependência, índice ou alteração de Rules neste incremento.
