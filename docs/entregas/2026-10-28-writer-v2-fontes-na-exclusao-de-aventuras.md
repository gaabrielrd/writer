# Writer V2 — fontes na exclusão de aventuras

## Estado e escopo

Integração interna parcial do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base dcf3135. A [ADR 0224](../decisions/0224-adventure-deletion-source-retirement.md)
registra a composição entre exclusão, mídia e coleta originais.

## Implementado

- Processamento da restauração ativada por UID, reserva e nascimento originais.
- Retirada de mídia pendente por geração, sem publicação implícita. Revalidação
  após I/O e encerramento do uso original/cópia preparing com recibos atômicos.
- Continuação da coleta original, inclusive parcial ou já terminada. Chave
  removida por metadata no momento previsto pelo sidecar; vazio reconferido.
- Importação ativada validada pelo recibo de ativação e metadata nativa.
  Manifests retirados em páginas de oito, sem ler título/texto do manuscrito.
- Certificação da quiescência somente após as fontes e a ausência de chaves.
  Imagens ativas, personas, campanhas e recibos históricos preservados.

## Testes e checks executados

| Verificação dirigida                                     | Resultado real                                            |
| -------------------------------------------------------- | --------------------------------------------------------- |
| adventureDeletionSources                                 | 18/18, 12949,643 ms                                       |
| Início/quiescência/fontes, rodada com 16 casos de fontes | 43/43, 11934,5633 ms                                      |
| Coleta original + fontes, rodada com 16 casos de fontes  | 29/29, 23449,0702 ms                                      |
| Mídia original                                           | 18/18, 36128,8141 ms                                      |
| SDK/Rules de exclusão anterior e importação              | 12 cenários aprovados em rodada com uma jornada cancelada |
| Jornada nativa isolada de mídia/coleta/exclusão          | 1/1, 274595,1786 ms                                       |
| Sintaxe Functions                                        | 401 módulos                                               |
| ESLint, arquitetura, documentação e skills               | Passaram                                                  |

São **76 cenários Node distintos**: 18 de fontes, 17 de início, dez de quiescência,
13 de coleta original e 18 de mídia original. Há sobreposição nas rodadas da tabela;
não somar seus totais como cenários novos. Também há **13 cenários SDK/Rules
distintos** aprovados em rodadas, sem tratar a primeira rodada cancelada como verde.

A jornada nativa usa Firestore real no emulador demo e cliente Storage real com
wire HTTP local sintético. Confere concorrência/replay do mesmo avanço,
nascimento/updateTime conjuntos de imagem/sidecars/recibo da exclusão, ausência
de todas as famílias privadas e de bytes da geração anterior, e preservação do
job ativado e updateTime da raiz marcada. Não comprova credenciais, índices ou
comportamento de produção.

Logs de QA fora do Git: m115-engine.log, m115-node.log, m115-sources-final.log,
m115-sdk.log, m115-sdk-retry.log e m115-sdk-native.log. Nenhum resultado do
validate integral anterior é atribuído ao código deste incremento.

Duas tentativas da jornada nativa de mídia atingiram o limite de 180 segundos
durante a preparação original. A inspeção metadata no emulador confirmou avanço
dos checkpoints, sem evidência de bloqueio da exclusão. A jornada foi repetida
isoladamente com limite adequado e passou em 274595,1786 ms. As assertivas
foram mantidas; somente o tempo do teste foi ajustado.
A importação nativa e os 11 cenários anteriores da exclusão passaram em rodada
com a jornada de mídia cancelada. Essa rodada não é uma suíte verde.

O primeiro teste de manifest ausente detectou falta de recusa na última página
curta. A implementação passou a conferir a contagem esperada antes de remover
essa página. O teste foi repetido e passou, preservando todo o lote.

## Pendências

Ainda não existe exclusão pública. Faltam fases de mídia/verificação restante,
usos de imagens, autoria, chats derivados, controles/atividade, vazio final e
raiz, transporte/cliente/UI/retomada e validação integrada. Perguntas próprias
não foram apagadas e continuam sujeitas à decisão pendente do operador.

Sem mudança de interface, Rules, dependências ou exports em index. Frontend,
build/browser e validate integral não foram repetidos. O integral fica no
fechamento do bloco 198–exclusão, conforme orientação do operador.
Macro permanece 8/35; P2/P3/D/F2-09 e gates humanos/comerciais continuam abertos.
Somente trabalho local; sem CI/GitHub, push, PR, merge ou deploy.
