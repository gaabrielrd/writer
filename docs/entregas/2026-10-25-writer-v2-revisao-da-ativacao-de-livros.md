# Writer V2 — revisão final antes de ativar livros

## Resultado parcial do plano 133

Implementado getBookRestoreActivationReview, serviço interno somente leitura.
Exige preparação original activation-ready, verifica selo/recibo da auditoria,
itens autenticados e dependências nativas. Resumo limitado informa título em
prévia, contagens, universo atualmente autorizado, capa e destino do rascunho.

Token vincula identidade e decisões atuais. Capa de biblioteca passa pelo
verificador Storage; após a espera, job e dependências são revalidados.
Cancelamento, raiz concorrente ou mudança do universo impedem resposta obsoleta.
Não copia prosa global nem altera manuscrito, versões, imagem ou contadores.
Replay de auditoria agora também exige preparação presente no recibo.

## Node dirigido

20 casos distintos positivos em seleções dirigidas, não um lote único de 20.
O lote inicial teve 12/15 positivos. Dois casos de concorrência falharam no
fixture porque a verificação da preparação acessava f antes de sua inicialização;
o holder explícito passou a disponibilizá-lo só depois da preparação.
O terceiro esperado supunha criar uma chave, mas a fixture já tinha chave:
confirmado o caminho original somente leitura, a asserção passou a exigir token
e resumo idênticos. Os três casos corrigidos passaram, 3/3.

Cinco casos adicionais e os dois cenários concorrentes após o ajuste do holder
passaram na seleção 7/7 (5034.9314 ms). Conferem descritor unavailable não
promovido, falta de adaptador/prova divergente, raiz estrangeira concorrente e
rascunhos saved/version sem mudar textos ou histórico. Os demais casos verificam
fase/conta/token/entrada extra, revisão determinística sem writes, universo
revogado/recriado, selo/controle/definições/lote recriados, Storage alterado,
prévia Unicode e recibo sem preparação. Asserções recusam adoção de dados incertos.

Regressão selecionada: replay e cancelamento schema13 em journals/ready,
3/3 positivos, 1327.1628 ms. Não é nova contagem além dos casos de auditoria
já registrados na entrega anterior.

Lint do teste inicialmente apontou prefer-const; o holder removeu o acesso
prematuro sem desabilitar a regra. Lint dirigido depois passou.

## Firestore SDK

1/1 positivo na repetição, zero skipped, 143362.6952 ms. Firestore Emulator
1.22.0 verificado, projeto demo isolado em loopback; serviços/Admin/Rules reais.
Preparação e auditoria reais precedem a revisão. Dados e updateTime de job e
controle permanecem exatos; contador global não muda e cabeça existente continua
negada ao dono pelo SDK sem raiz. Perda de autorização do universo altera token
e decisão; recriar selo original bloqueia a revisão e preserva dados incertos.

A primeira execução alcançou a última asserção, mas falhou por acessar checkpoint
no snapshot, sem data(). Corrigido somente o esperado e repetido o mesmo caso.
Isso não é prova de Storage/Auth/Callable/App Check de produção ou piloto humano.
Os cenários Storage deste incremento usam o adaptador real com bucket simulado.

## Verificações e limites

Formato, lint dirigido, arquitetura, documentação e diff passaram. Revisão
conferiu origem, ausência de writes, retorno limitado e autorização após Storage.
A contagem de versões inclui o rascunho recuperado separadamente; os dois casos
saved/version passaram após essa correção, 2/2 (1895.9755 ms).
Não há nova fronteira UI; Vitest/browser/build/validate global não repetidos.
Validate integral permanece no fechamento de P1, conforme orientação.

Somente o passo 1 do plano 133 está implementado. Ainda faltam ativação atômica,
estado terminal/replay, conclusão segura da mídia/limpeza e host/roundtrip
integral. P1/D3/F2-09/V2, inventários/legados/rollout, fases 3–5 e condições
humanas/comerciais continuam abertos. Nenhum endpoint/Rule/grant novo.

[Plano 133](../tasks/writer-v2/execucao/133-revisao-e-ativacao-do-livro.md) e
[ADR 0153](../decisions/0153-book-restore-activation-review.md).
Sem CI, push, PR, merge, deploy ou produção; somente commit local ao fechar.
