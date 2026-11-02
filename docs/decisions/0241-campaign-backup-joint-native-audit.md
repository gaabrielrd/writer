# ADR 0241 — auditoria nativa conjunta de campanhas

- Data: 2026-10-29.
- Estado: serviço interno implementado localmente.
- Base: 1d0d8e2; [plano 211](../tasks/writer-v2/execucao/211-auditoria-conjunta-do-backup.md).

## Decisão

Compor os serviços reais de leitura em createCampaignBackupAuditService.
A intenção aceita somente campaignId e expectedSourceToken opcional, com
UID validado e valores desprendidos antes de await. Nenhum I/O antes de pull.
O serviço não recebe lista, manifesto ou hash de cliente para certificar.

Fixar fonte própria e derivada. Percorrer raiz/progresso e nove famílias
próprias, incluindo controles, omissões e páginas vazias. Na base disponível,
conferir snapshot, sete tipos de cabeçalho, campos auditados integralmente e
as quatro famílias físicas. Auditoria por item prova partes declaradas;
inventário físico prova que partes encontradas possuem dono/manifesto.

Ler variantes e âncoras antigas com autorização e bindings reais, incluindo
removed/inactive/legacy. Conferir SHA do DTO e bytes dos campos pelo auditor
nativo existente. Cobertura por binding detecta partes ausentes; lojas, corpos
e sonda collectionGroup detectam resíduos e órfãos tipados. O singleton legado
de cada página de lojas só inicia uma varredura de corpos por passagem.

Para cada imagem, refazer o hash nativo integral de sua geração exata. Não
substituir por bytes atuais nem por um hash declarado no pedido. Base/variante/
imagem indisponíveis têm omissão explícita; próprios não dependem do acesso
à origem. Nenhum conteúdo derivado é convertido em nota própria.

Dobrar descritores de unidades em SHA-256 incremental, com domínio, coordenadas,
resultado e, quando disponíveis, tamanho, partes e hash. Dobrar separadamente
páginas, limites, cursores/lookahead e tokens nativos de dependências/cobertura.
A prova de conteúdo inclui metadata lógica dos recursos físicos; não determina
ainda o framing ou a autorização de uma restauração.

Repetir a sequência inteira, inclusive conteúdo/hash de imagens e campos,
desde o início, conferindo fontes ao final de cada passagem. Comparar raízes,
contagens e disponibilidade, em vez de aceitar apenas a última página.
Identidades nativas detectam regravação idêntica sem alterar o hash do texto;
controles por sessão detectam mutações S2/S3 sem alterar a âncora raiz.

Retenção é limitada à página/unidade atual, hashes e contadores, sem mapa de
projeto ou concatenação de campos. Lore usa seu limite nativo de entidade.
Progresso tem somente passagem, etapa e contadores. Somente término natural
retorna campaign-native-audit. Return/throw marcam cancelamento imediatamente;
cada retorno de I/O confere o sinal e suprime o resultado tardio. A operação
interna já enviada ainda pode executar suas reautorizações obrigatórias.

## Limites

Duas passagens e controles dos produtores nativos não constituem garantia de
snapshot linearizável de escritas arbitrárias fora desses contratos. Testes
em memória não comprovam concorrência/credenciais/índices reais. A futura
persistência deve ter checkpoints e limites de execução; não expor uma chamada
remota longa que precise auditar a campanha inteira de uma vez.

A prova é privada, efêmera e ligada às identidades nativas atuais. Não é
assinatura, procedência portátil, download nem grant de acesso. Faltam manifesto/
atestado independente da existência dos IDs antigos, framing/arquivo, persistência/
cleanup, restauração e UI/ciclo. Ampliar C4 v1–v4 e consumidores antes de novos
produtores persistentes. Sem endpoint/UI/Rules/dependência/segredo novo.

Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-auditoria-conjunta-do-backup.md).
