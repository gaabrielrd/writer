# ADR 0242 — manifesto e procedência assinada de campanhas

- Data: 2026-10-29.
- Estado: contratos e serviços internos implementados localmente.
- Base: f88077c; [plano 212](../tasks/writer-v2/execucao/212-manifesto-e-procedencia-assinada.md).

## Decisão

A prova nativa da auditoria 211 depende da campanha e das bases atuais. Não
colocá-la no arquivo como autorização. Acrescentar evidências portáteis fechadas
do nascimento da aventura, universo e fichas autorizadas, produzidas pelos
mesmos gates antes de qualquer projeção. Base mantém capturedAt e identidade
lógica; item indisponível só mantém sua chave e indisponibilidade, sem origem
ou prosa protegida. Âncora antiga inclui os fatos da sua própria base/ficha.

Dobrar evidências em raiz própria de SHA-256, preservando a raiz lógica v1 do
conteúdo. Ordem exata: prefixo [writer-campaign-witnesses-v1, campaignId],
registro de base, registros de itens na ordem do inventário e registros de
âncoras na ordem das variantes. Cada registro é JSON [section, id, outcome,
content-ou-null] seguido de LF. Base indisponível/none usa id null e resultado
explícito. Item é identificado por sourceKey; âncora, pelo ID da variante.
O corpo disponível é a projeção canônica validatePortableCampaignWitness.

Contar unidades/bytes das evidências e repetir as leituras nas duas passagens.
A auditoria compara essa raiz junto com conteúdo, inventário e dependências.
Nenhuma lista de evidências ou mapa do projeto é mantido no servidor.

O emissor executa a auditoria real; não recebe manifesto ou hashes do cliente.
Projetar manifesto fechado de campanha v1, versões de conteúdo/procedência,
conta vinculada por hash de domínio próprio, ID original lógico, disponibilidade,
timestamp e raízes/contagens. Tokens nativos, inventário privado e nativeDigest
não entram no pacote. Fatos de encarnação são autenticados pela raiz das evidências,
sem exigir que campanha/base antigas sobrevivam para verificar a emissão.

Usar Ed25519 de node:crypto, com algoritmo fixo e chave privada injetada somente
no servidor. Preimage é domínio writer-private-campaign-backup-v1, NUL e JSON
canônico de schemaVersion, algoritmo, keyId e manifesto projetado. Cobrir keyId
impede trocar um ID revogado por um alias da mesma chave. Assinatura deve ser
base64url canônica de 64 bytes; nenhum algoritmo/URL/chave do arquivo é aceito
como configuração confiável. A API nativa e o suporte Ed25519 estão descritos
na [documentação Node 22](https://nodejs.org/download/release/v22.21.0/docs/api/crypto.html#cryptosignalgorithm-data-key-callback).

Registro confiável versionado é fornecido pelo servidor, como array ou getter
síncrono de configuração. Active assina e verifica; verify-only só verifica;
revoked recusa verificação e nova emissão. Ler o estado novamente antes de
assinar. Preservar chaves públicas anteriores sem expiração automática dos
backups; nunca reutilizar um keyId para outra chave. Revogação de chave
comprometida invalida a prova derivada, sem converter derivado em nota própria.
A configuração/rotação real ainda precisa de operação antes de habilitar exportação.

Verificação não lê o banco e exige a mesma conta. Resultado é explicitamente
campaign-issuance-only. Timestamp futuro além de cinco minutos é recusado;
emissões antigas continuam verificáveis por chave confiável. Isso não estabelece
prazo ou autorização de acesso ao conteúdo.

## Limites e consumidores obrigatórios

Assinatura prova somente a emissão dessas raízes. Antes da restauração, conferir
todos os frames/bytes/descritores contra content.digest, todas as evidências
contra provenance.digest, os vínculos semânticos entre eles e a autorização
atual de cada origem pelo nascimento exato. Entidade recriada sob o mesmo ID
não herda o acesso da anterior. Próprios permanecem distintos de derivados.

Esses consumidores e o framing ainda não estão implementados; não habilitar
download ou ativação com campaign-issuance-only. A operação real precisa de
checkpoint/limites; não expor o emissor interno como uma chamada longa sem
retomada. Antes de recursos persistentes, ampliar C4 v1–v4 e consumidores.

Sem endpoint/UI/Rules/dependência, chave real, segredo configurado ou implantação.
Criptografia foi executada localmente em Node 24.21.0 com chaves efêmeras em RAM.
Não foi executado runtime Node 22, Secret Manager ou ciclo de credenciais reais.
Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-procedencia-assinada-do-backup.md).
