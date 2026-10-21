# ADR 0034 — Preparar e comparar uma candidata de base

**Estado:** aceita; C3A concluído tecnicamente em `fe10b15`, CI e regras verdes.
**Data:** 2026-10-17.

## Contexto

A aventura original pode evoluir enquanto a campanha conserva sua captura e as
adaptações da mesa. O mestre precisa examinar outra captura antes de decidir sua
adoção. A comparação deve continuar distinguindo retirada autoral, revogação de
acesso e arquivo indisponível, sem revelar mudanças em conteúdo oculto.

## Decisão

Preparar uma candidata privada na campanha existente, reutilizando o motor de
captura da aventura completa e apenas do lore explicitamente referenciado. Cada
passo compara origem, encarnação da campanha e base ativa; mudanças persistem um
aborto. C3A nunca altera `activeBaseId`, variantes, notas ou a aventura original.

Controles, recibos e fences iniciais têm coleções privadas próprias. Candidatas
usam `campaignBases` e os cinco filhos existentes. Checkpoints monotônicos e
recibos exatos permitem repetir o mesmo pedido com progresso atual posterior.
Cancelamento limpa filhos e pins em etapas; controles próprios permanecem
consultáveis sem a origem ou o root da campanha. Não há expiração automática.

Comparar dados da origem, itens, referências e imagens em páginas limitadas,
aplicando a autorização e a projeção antes de classificar. Não usar hashes de
campos privados como sinal de mudança. Ordem compara os vizinhos autorizados,
evitando marcar rebalance técnico como mudança autoral. Texto usa chunks e
verificação integral; mídia mantém autorização antes/depois do I/O e no-store.
Metadados autorais `imageKey`, `alt` e `caption` seguem a autorização do item;
ausência de pin/arquivo bloqueia a prévia sem tornar a legenda secreta.
Detalhes de item mostram esses metadados sem buscar bytes automaticamente. Uma
ação explícita pede a prévia; qualquer falha invalida o composto, sem interpretar
um not-found genérico como prova de autorização ainda válida.

Leituras compartilham identidade, datas capturadas, revisão de variantes e token
da comparação. Um contexto novo observado invalida páginas, detalhes e mídia já
compostos antes de aceitar outra janela. Os limites são por tentativa lógica da
transação; retries do SDK não constituem promessa de custo fixo.

O navegador persiste somente metadados mínimos sob Web Locks por UID/campanha,
com CAS do envelope completo e verificação de sessão dentro do escritor. Nunca
guarda texto, nomes, manifestos, mídia ou token de comparação nesse journal.
Pedidos iniciais e passos incertos conservam método e payload exatos. Um marcador
conhecido é neutro: permite descoberta, sem autorizar RPC ou avanço após reload.
Confirmar progresso grava a descoberta conhecida antes de limpar o inicial.

Encerrar um início desconhecido exige intenção explícita e fence no servidor;
uma candidata já conhecida não é descartada implicitamente. Passo vencido só
pode ser encerrado explicitamente após conflito definitivo e GET da mesma
identidade com checkpoint maior. Nenhum desses caminhos inventa outro pedido.
O Estúdio reúne controles locais e remotos, incluindo limpeza final sem resposta
e preparações cuja campanha foi removida. Dados locais ilegíveis são preservados.

## Consequências

O mestre pode preparar, comparar e descartar sem adotar a candidata. Adoção C3B
continua obrigatória em incremento próprio, incluindo continuidade das variantes,
`bodyRevision` e tratamento explícito de rascunhos cifrados da base anterior.
Um flip isolado de `activeBaseId` não satisfaz esse contrato.

SDK direto permanece negado. Os índices declarados precisam ser implantados na
entrega de infraestrutura; testes no emulador não comprovam essa implantação ou
Storage real. Exclusão integral da campanha permanece uma entrega separada.

Ver [contrato C3A](../tasks/writer-v2/execucao/18-comparacao-de-bases-da-campanha.md),
[bases congeladas](0031-campaign-frozen-bases.md) e
[variantes e recuperação protegida](0033-campaign-lore-variants.md).
