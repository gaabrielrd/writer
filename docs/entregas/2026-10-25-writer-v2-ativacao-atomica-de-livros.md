# Writer V2 — núcleo de ativação atômica de livros

## Resultado

activateBookRestore confirma a revisão original por CAS e operationId, verifica
Storage e reautoriza antes do commit. Cria livro privado com dados literais e
barreiras nativas, libera a contagem preparada e o lote de personas, grava
vínculo/contador estritos do universo e registro/uso da capa. Job/recibo são
gravados junto com a remoção do marcador de bloqueio e da chave de recuperação.

Textos, fontes grandes, lore inline/indexado/monolítico, histórico e perfis
permanecem intactos. O título completo é salvo, mesmo quando a prévia foi
limitada. Origem de universo revogada invalida a confirmação anterior; uma nova
revisão explícita pode confirmar a cópia sem vínculo. Nenhum lore global é copiado.

Confirmação histórica exige provas nativas originais e não depende da raiz atual.
Após edição/exclusão, replay e consulta mantêm o resultado anterior sem recriar
dados. Cancel/cleanup/preparação não apagam destino ativo. Perfis próprios
continuam disponíveis na biblioteca após exclusão normal do livro.
Rules preservam restoreOrigin e impedem forja cliente; edição normal de título
e criação manual sem origem continuam funcionando.

## Node dirigido

55 casos distintos positivos: 22 de ativação e 33 regressões (20 revisão e
13 upload). Não é um lote único de 55.

Ativação: quatro primeiros passaram em 4065.706 ms; outros 17 passaram na
seleção seguinte (9829.0146 ms). Leitura literal do nome C1 e imagem preparando
não selecionável foram acrescentadas a dois casos existentes; eles e o novo
caso monolítico passaram 3/3 (2134.3333 ms), totalizando 22 distintos.
Consulta/reinício após exclusão e perfis mantidos foram ampliados e repetidos
somente nesses dois casos: 2/2, 1420.9243 ms.
Regressões revisão/upload: 33/33, 11706.7662 ms, zero skipped.

Conferidos: raiz/controle/lote/vínculo/recibo juntos; leitores normais de lore e
backup após ativação; payload monolítico literal completo; corpos/fontes grandes
intactos; conta/token/CAS/revisão/entrada extra; universo/contadores/usos
estrangeiros; selo/reserva/raiz recriados; capa/uso órfão; cancelamento durante
Storage; rollback completo e retry do callback sem duplicar contador/operação;
job/recibo/reserva recriados após ativação; descritor adulterado; bloqueio do
port preparado e chave de recuperação após ativação.

## Firestore SDK e Rules reais

2/2 positivos, zero skipped, 277955.9655 ms, Firestore Emulator 1.22.0 verificado
em projeto demo isolado/loopback, Admin/serviços/Rules reais:

1. Raiz, controle, lote e job têm updateTime igual ao nascimento do recibo;
   raiz nasce nesse mesmo commit. Lote conserva seu nascimento original.
   Universo recebe exatamente um vínculo/contador; reserva permanece e marcador
   some. Dono lê raiz, outro/anônimo não. Forjar/remover/alterar restoreOrigin
   falha; editar título e criar livro manual funcionam. Consulta e replay após
   exclusão não recriam raiz ou repetem o vínculo.
2. Capa, uso e raiz nascem no mesmo commit. Registro preparing com useCount 1,
   URL null e accepted false. Só leituras de metadata Storage durante ativação;
   replay não repete efeitos.

A primeira tentativa do runner falhou antes dos casos por importar sharp a
partir da raiz. Corrigido para createRequire do pacote functions já instalado,
sem adicionar dependência; a execução seguinte passou. A capa usa o adaptador
real com bucket simulado, não Storage/Auth/Callable/App Check de produção.

## Verificações e limites

Formato, lint dirigido, arquitetura, documentação e diff passaram. Revisão
final conferiu efeitos, prova histórica, ausência de novo endpoint e limites de
mídia/limpeza. Rules foram compiladas e exercitadas pelo SDK real.
Sem nova fronteira UI; Vitest/browser/build/validate global não repetidos.
Validate integral permanece no fechamento de P1 conforme orientação.

Núcleo de criação/consulta está implementado; restauração integral não está
concluída. A capa permanece preparando e não selecionável até o passo de mídia.
Job activated guarda estado inicial pending/none; mídia e limpeza terão progresso
próprio e não poderão regravar sua prova imutável. Arquivo/índices/journals ainda
não foram limpos por um protocolo pós-ativação. Não executar cleanup de cancelamento.

Faltam finalização da capa, limpeza própria, host/UI, roundtrip integral e demais
inventários/writers/exclusão/legados/rollout/validate de P1, fases 3–5 e condições
humanas/comerciais. Padrão de novas gerações indexadas continua false.
Nenhum endpoint ou operação de produção novo.

[Plano 133](../tasks/writer-v2/execucao/133-revisao-e-ativacao-do-livro.md) e
[ADR 0154](../decisions/0154-atomic-private-book-activation.md).
Somente commit local; sem CI, push, PR, merge ou deploy.
