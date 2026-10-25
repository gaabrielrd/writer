# Writer V2 — finalização recuperável da capa restaurada

## Resultado

A capa preparing pode ser concluída por serviço interno. Autoriza ativação,
definições/intenção, registro/uso e origem nativos; aceita Storage por PATCH
condicional, sem regravar bytes; reautoriza depois da espera e ativa registro/URL,
raiz aplicável, conclusão e recibo juntos.

Livro que trocou a capa, foi excluído/recriado ou entrou em exclusão não é
sobrescrito. Imagem própria continua na biblioteca; remoção concorrente da imagem
bloqueia finalização sem recriar arquivo. Contadores/usos e prova imutável da
ativação não são regravados. Falhas intermediárias são retomáveis com o mesmo token.

Conclusão/recibo não contêm URL ou credencial. Nova operação sobre conclusão
existente retorna already-complete sem outro recibo/write/Storage. Consulta
separa conclusão histórica de imageState preparing/available/unavailable/none;
imagem apagada/recriada não é readotada por um recibo antigo.

## Node e GCS SDK local

47 casos distintos positivos, em seleções dirigidas: 24 do serviço e 23 de
Storage (12 novos, nove de estágio/fence anteriores e dois de SDK anteriores).
Não é um lote único de 47. Cinco casos GCS usam o SDK real contra contrato HTTP
loopback e já estão contados nesse total.

O lote Storage inicial teve 18/23 positivos. Cinco asserções comparavam Buffer
com Uint8Array produzido por structuredClone; corrigida só a representação do
esperado e repetidos apenas esses cinco, 5/5 (340.3468 ms). Os cinco novos
cenários recusaram estado estrangeiro/fence/recriado/metadata/token sem PATCH.
PATCH exato passou também com generation e metageneration acima de 2^53;
repetição isolada 1/1, 460.3477 ms. Resposta HTTP perdida e 412 concorrente cobertos.

Serviço: primeiro lote falhou na importação de um nome de helper de backup
inexistente; removido antes de executar os casos. Três casos básicos passaram
(2818.5087 ms). A seleção seguinte teve 18/20 positivos; os dois erros estavam no
double sem DocumentReference.update usado pelo serviço normal da biblioteca.
O fixture passou a suportar essa operação por transação; só os dois foram
repetidos, 2/2 (2077.2779 ms), sem mudar o código de remoção.

imageState atual e proteção contra imagem ativa recriada foram acrescentados;
seis casos afetados passaram (4795.9218 ms), sendo um novo: total de 24 distintos.
Casos incluem conta/token/entrada/operação conflitantes, livro não ativado,
falhas após PATCH/commit, rollback/retry, troca/exclusão/ABA da raiz, imagem em
exclusão, dependências/usos/recibos recriados, adaptador inválido/ausente,
recaptura normal dos bytes da capa e preservação da história após limpeza das
definições e remoção normal da biblioteca. Nenhuma conclusão falsa ao remover
uma imagem durante o I/O.

## Firestore SDK real

1/1 positivo, zero skipped, 141836.5838 ms. Firestore Emulator 1.22.0 verificado,
projeto demo isolado em loopback, Admin/serviços/Rules reais.

Falha após aceitação externa deixa imagem preparing/URL do livro null; retomada
usa token anterior e confirma imagem, raiz, conclusão e recibo com updateTime
comum. Nascimentos de raiz/imagem conservados; job e recibo da ativação ficam
exatamente iguais. Conclusão/recibo negados ao dono, outro e anônimo via SDK;
dono lê biblioteca, outro não, e não pode forjar URL por SDK.

Exclusão normal da imagem após detach e exclusão da raiz preserva conclusão
histórica, informa indisponibilidade e não faz novo I/O Storage. Recriar a
conclusão bloqueia replay, preservando dados incertos. Os estados visuais
preparing/available/unavailable da API são cobertos pelo Node; não houve nova UI.

SDK GCS é real com servidor HTTP simulado; SDK Firestore usa bucket em memória
com adaptador de produção. Não são Storage/Auth/Callable/App Check de produção,
nem piloto humano ou prova de disponibilidade futura do arquivo.

## Verificações e limites

Formato, lint dirigido, arquitetura, documentação e diff passaram. Revisão
conferiu precondições GCS, autorização após I/O, prova histórica, namespaces
privados, estados atuais e ausência de novo endpoint.
Sem UI nova; Vitest/browser/build/validate global não repetidos. Validate integral
permanece no fechamento de P1, conforme orientação do operador.

Passo de mídia interno implementado. Ainda faltam limpeza pós-ativação própria,
host/UI/roundtrip integral, inventários/writers/exclusão/legados/rollout e validate
de P1, fases 3–5 e condições humanas/comerciais. Opção de novas gerações indexadas
continua false. Job activated conserva o estado inicial de mídia; consultar o
serviço de mídia para conclusão/disponibilidade atuais.

[Plano 134](../tasks/writer-v2/execucao/134-finalizacao-da-capa-restaurada.md) e
[ADR 0155](../decisions/0155-restored-book-cover-completion.md).
Runners/logs QA externos com prefixo m42-media-sdk, sem artefatos grandes no Git.
Somente commit local; sem CI, push, PR, merge, deploy ou operação de produção.
