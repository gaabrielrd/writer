# ADR 0245 — universo organizacional no backup de campanha

- Data: 2026-10-29.
- Estado: aceito e implementado internamente; integração/ativação pendentes.
- Complementa [ADR 0244](0244-campaign-backup-origin-review.md).

## Contexto

O universeId da raiz pode mudar sem alterar a base congelada, e campanhas
independentes também podem ter universo. A evidência da base prova outro vínculo.
O arquivo v1 conservava o ID organizacional no DTO próprio sem seu nascimento;
não permite religação automática segura quando o ID foi reutilizado.

## Decisão

Novos arquivos usam provenanceVersion 2, com evidência project única, primeira
entre as evidências, vinculada ao originCampaignId. Sua projeção fechada contém
kind, campaignId e universe: none, unavailable com id, ou reference com id/born.
Nascimento é createTime nativo do universo atualmente autorizado ao exportar.
Não copiar lore, nome, prosa, clock ou tokens internos para essa projeção.

O leitor revalida a fonte própria/derivada e C4 em transação antes de ler metadata
da raiz e do universo organizacional. Autor deve ser a mesma conta e universo
não pode estar deleting. Universo ausente/inacessível produz unavailable sem
impedir o backup próprio. Auditoria inclui a evidência nas duas passagens;
witnessToken privado inclui identidade nativa e metadata para detectar alterações.

Framing/contentVersion continuam 1. A raiz de evidências usa o domínio
writer-campaign-witnesses-v2. Manifesto, assinatura e header fixam a mesma versão.
Leitor/verificador mantêm v1: sem evidência project, retornar organizationalUniverse
unproven. Não consultar o ID organizacional bruto para inventar prova nem usar
o universo da base como substituto. Restaurador deverá oferecer escolha explícita
e autorização atual para esse vínculo legado, preservando o próprio manuscrito.

Após autenticar arquivo/índice, revisão v2 confere autor/nascimento/deleting
organizacionais em duas passagens, separadamente da aventura/lore derivados.
Omissão de exportação permanece indisponível e não consulta universo recriado.
origins.witnesses conta todas as evidências; derivedWitnesses e os contadores
available/unavailable/none cobrem derivados. organizationalUniverse informa
available, unavailable, none ou unproven separadamente. A contagem/prova de
revisão incorpora ambos os conjuntos sem transformar callbacks em grant.

## Consequências e limites

ID e edição própria permanecem preservados mesmo quando o vínculo não é elegível.
Origem recriada com mesmo conteúdo/ID não herda nascimento antigo. Universo
organizacional pode continuar disponível quando a aventura/base se perde, e
vice-versa. Nenhum acesso futuro ou ativação decorre dessa revisão.

O produtor nativo captura raiz e evidência sob os mesmos anchors/transações;
a raiz lógica própria permanece assinada. Validação semântica completa dos DTOs
e sua união com evidências ainda cabe ao consumidor seguinte; esta entrega não
declara restauração/materialização pronta. Não há índice/sink persistente padrão,
endpoint/UI, segredo configurado, Rules ou dependência novos. Antes de persistir
recursos, fechar inventário/cleanup C4 v1–v4 e consumidores de procedência.

## Validação

21 cenários novos e 117 regressões pertinentes Node passaram (138/138).
Incluem arquivos v1 realmente assinados com chaves efêmeras em RAM, vínculos
independentes/diferentes, omissão, nascimento, C4/fonte, alteração entre passagens,
arquivos v2 ausentes/duplicados/trocados e desacordo de versão. Conferir a
[evidência parcial](../entregas/2026-10-29-writer-v2-universo-organizacional-no-backup.md)
para comandos e limites. Validate integral permanece no fechamento do bloco P3.
