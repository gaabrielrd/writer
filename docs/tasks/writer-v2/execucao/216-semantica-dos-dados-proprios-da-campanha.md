# P3 — semântica dos dados próprios da campanha

- Data: 2026-10-29.
- Base: 325ee7e; sequência de [215](215-universo-organizacional-no-backup.md).
- Estado: implementação interna com checks dirigidos locais; P3/D abertos.

## Objetivo

Preparar a restauração de todos os dados próprios, conferindo DTOs fechados
contra os contratos existentes e os vínculos S1/S2/S3 do arquivo autenticado.
Conferir também raiz e evidência organizacional; integridade não basta para
aceitar um corpo de pista sem item, vínculo sem sessão ou universeId divergente.

## Contrato e sequência

1. Reutilizar serializeCampaignBackupOwnContent para leitura canônica fechada,
   com schemaVersion/kind/id/present/data e validação das regras de cada domínio.
   Rejeitar campos desconhecidos e alterações de IDs; preservar texto UTF-8 literal.
2. Acrescentar callback provisório onOwnUnit ao validador do arquivo. Entregar
   bytes de apenas uma unidade própria depois de conferir seu hash; máximo
   4 MiB serializados por unidade, sem acumular projeto. O limite cobre a
   expansão JSON dos contratos atuais (inclusive três campos clue de 150.000
   caracteres), sem reduzir seus limites ou truncar. Chunks permanecem 64 KiB.
3. Durante validação, guardar apenas metadata de vínculos em índice temporário
   injetado write/seal/read/lookup/dispose, autenticado por MAC efêmero e conta/
   ordinal/família/ID. Nenhum adaptador persistente padrão ou prosa no índice.
4. Só após autenticar arquivo/assinatura, ler páginas de 25; conferir MAC de
   toda a página antes de callbacks/lookup. Conferir os dois lados item/corpo,
   sessões e controles por sessão, pistas/missões vinculadas e controles
   operacionais omitidos. Ordem estrita por família/ID impede duplicatas.
   Omissões legítimas deleted/inactive-parent/control permanecem explícitas.
5. Raiz/progresso são obrigatórios. Independent requer base none; original não
   pode declarar none. V2 exige mesma organização na raiz e project; v1 continua
   com vínculo unproven. Não consultar origem ou conceder acesso.
6. Testes com arquivo nativo rico/vazio e escritores reais, campos/IDs/joins
   inválidos em arquivos novamente assinados, omissões, legado, MAC/índice,
   paginação, abort e texto literal/extremos de JSON. Checks dirigidos e commit.

## Aceite e limites

Todos os próprios devem atravessar o gate de domínio/vínculos antes da futura
materialização. Nenhuma escrita nativa, prosa persistente, endpoint, UI, grant
ou chave real. Índice de teste só em RAM e chave zerada/dispose sempre. A prova
é efêmera campaign-own-semantics-only; referências à base conservam sourceKey
como declaração própria, e seu alvo/edição exigem a semântica derivada e revisão
de origem seguintes. Não usar esse gate para afirmar todo o arquivo restaurável.

Faltam semântica completa da base/lore/imagens, consumidores de procedência,
inventário/cleanup C4 v1–v4 antes de qualquer produtor persistente, upload/
retomada, materialização/ativação, interface e ciclos. P3/D/F2-09 e macro 8/35
abertos. Validate integral no fechamento do bloco; sem CI/push/deploy/subagentes.

## Evidência interna

Passos 1–5 implementados; testes dirigidos 47/47 novos e 157/157 regressões
passaram. Conferir a [ADR 0246](../../../decisions/0246-campaign-own-backup-semantics.md)
e a [evidência parcial](../../../entregas/2026-10-29-writer-v2-semantica-dos-dados-proprios.md).
O índice usa até 32 KiB de metadata por registro para preservar IDs máximos
escapados. Não contém prosa nem adaptador persistente. Revisão final, checks
e commit local completam este incremento interno, sem fechar P3/D.
