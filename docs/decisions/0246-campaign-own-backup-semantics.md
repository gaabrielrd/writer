# ADR 0246 — semântica dos dados próprios no arquivo de campanha

- Data: 2026-10-29.
- Estado: implementado internamente; restauração/ativação pendentes.
- Complementa [ADR 0245](0245-campaign-organizational-universe-provenance.md).

## Contexto

Assinatura e hashes não bastam para restaurar um arquivo cujo DTO tenha campos
desconhecidos, cuja preparação tenha corpo sem item ou cujo vínculo organizacional
divirja da evidência project. O produtor já usa contratos de domínio; o leitor
deve reutilizá-los sem interpretar declaração própria como grant da origem.

## Decisão

parseCampaignBackupOwnContent faz a projeção inversa de uma unidade canônica:
schemaVersion/kind/id/present/data exatos, UTF-8 válido e roundtrip literal pelo
serializer existente. Não alterar limites de nota, resumo, data civil, pista,
missão, estado ou ordem. Projeção fechada também recusa campos desconhecidos
aninhados; o valor validado fica profundamente congelado.

validateCampaignBackupFile oferece onOwnUnit provisório: conteúdo próprio
entregue somente após hash/bytes da unidade, mas antes da autenticação do arquivo
inteiro. Usar apenas para validação/índice temporário, nunca para escrita ativa.
Sem callback, o leitor mantém seu fluxo anterior. Retém somente uma unidade
própria por vez; framing/dados continuam em partes de até 64 KiB.

CAMPAIGN_OWN_JSON_BYTES limita a unidade serializada a 4 MiB, cobrindo a expansão
JSON dos contratos atuais. Uma pista válida com três campos de 150.000 NULs
produz mais de 2 MiB serializados e continua íntegra. Isso não é limite total
de RAM nem aumento dos limites dos escritores; não acumular projeto.

createCampaignBackupOwnSemanticsService usa índice temporário injetado
write/seal/read/lookup/dispose. Guardar somente metadata de vínculos, nunca
títulos/prosa. MAC efêmero vincula conta, ordinal, família, ID e payload; chave
só em RAM e zerada ao terminar. Ordem de famílias/IDs é estrita, sem mapa do
projeto em RAM. Cada página de até 25 é desprendida e autenticada integralmente
antes de callbacks/lookups. Metadata de até 32 KiB por registro cobre dois IDs
de 1.500 bytes com expansão JSON; limite não reduz o contrato portátil de IDs.

Somente depois de conferir arquivo/assinatura, raiz/progresso obrigatórios,
declaração independent/base none e organização raiz/project v2, selar o índice
e iniciar joins. V1 permanece legível com organização unproven. Conferir
item/corpo nos dois sentidos e mesmo tipo; referência/vínculo exige sessão ativa,
controle por sessão exportado como omissão control e item ativo quando aplicável.
Controles residuais exigem a sessão presente, inclusive tombstone. Omissões
legítimas deleted/inactive-parent/control são preservadas por família, não
restauradas como conteúdo ativo.

Contar ativos/omissões/checklist e calcular próximas ordens globais seguras.
Recusar overflow também da ordem de vínculos por sessão. O digest semântico é
determinístico para o mesmo arquivo/metadata e não inclui os MACs aleatórios.
Conferir novamente a chave pública ao final; sempre descartar índice/chave.

## Limites e sequência

campaign-own-semantics-only é uma prova efêmera vinculada à cadeia/tamanho do
arquivo validado. Fonte emprestada continua mutável; materializador futuro deve
conferir novamente essa mesma identidade antes de consumir bytes. Nenhuma prosa
persistida, endpoint/UI, adaptador padrão, grant ou recurso nativo é criado.

sourceKey de referência própria permanece declaração: alvo/edição na base,
semântica completa de base/lore/imagem e autorização atual têm gates próprios.
O índice MAC de teste só existe em RAM, sem retomada entre processos. Antes de
qualquer produtor persistente, fechar inventário/cleanup C4 v1–v4 e consumidores.
Restauração em nova cópia, materialização/ativação e interface/ciclos seguem
pendentes; não declarar P3/D/F2-09 concluídos.

## Evidência

47 cenários novos e 157 regressões Node passaram; consultar a
[evidência parcial](../entregas/2026-10-29-writer-v2-semantica-dos-dados-proprios.md).
Validate integral reservado ao fechamento do grande bloco.
