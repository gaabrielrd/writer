# Writer V2 — semântica dos dados próprios da campanha

- Data: 2026-10-29.
- Escopo: [plano 216](../tasks/writer-v2/execucao/216-semantica-dos-dados-proprios-da-campanha.md).
- Decisão: [ADR 0246](../decisions/0246-campaign-own-backup-semantics.md).
- Estado: incremento interno parcial; P3/D/F2-09 e macro 8/35 abertos.

## Implementação

O leitor próprio reutiliza os validadores de domínio e a projeção canônica
existentes para conferir todas as famílias próprias. Recusa campos extras,
IDs/kinds divergentes, UTF-8 inválido e regras de domínio inválidas, preservando
texto literal, BOM interno, NULs, espaços e quebras de linha.

O arquivo entrega uma unidade própria por callback provisório depois de seu
hash. Limite serializado de 4 MiB cobre JSON expandido dos contratos atuais;
chunks mantêm 64 KiB e não há array do projeto. Índice temporário guarda somente
metadata, autenticada por MAC efêmero; páginas de 25 são conferidas antes de
callbacks/lookups. Chave é zerada e índice descartado em sucesso/falha.

Depois da integridade/assinatura, o serviço confere raiz/progresso obrigatórios,
organização raiz/project e independent/base none. Liga sessão/referência/controle,
pistas/missões/corpos e vínculos; omissões legítimas mantêm o catálogo e corpos
próprios independentes das sessões excluídas. Counts/próximas ordens são seguras;
digest é estável entre revisões do mesmo arquivo, embora a chave MAC seja nova.
V1 mantém organização unproven; não deriva autorização de um sourceKey.

## Validação executada

- Novos: campaignBackupOwnSemantics.test.mjs, **47/47**, zero falhas/skips,
  7677.3837 ms na execução final.
- Regressões pertinentes: campaignBackupOwnRead (19), campaignBackupFile (29),
  campaignBackupOriginReview (56), campaignBackupAttestation (31) e
  campaignBackupAudit (22): **157/157**, zero falhas/skips, 10024.1848 ms.
- Total: **204 cenários distintos aprovados**. Não corresponde à suíte integral.
- Cobertura comportamental: rico/vazio, escritores reais, 21 violações em
  arquivos realmente reassinados, vínculo organizacional, legado v1, omissões
  reais de nota/sessão/item, paginação, chave revogada, abort nas duas etapas,
  falhas de índice, MAC de outra execução, página esparsa/iterador alterado,
  autenticação da página antes de callback e ausência de prosa no índice.
- Corpus literal e pista serializada acima de 2 MiB passaram sem truncagem;
  IDs máximos com escapes não foram reduzidos para caber no índice.
- Revisão encontrou e corrigiu overflow de ordem por sessão e orçamento de
  metadata para dois IDs escapados. Ambos possuem cenário específico.

A primeira fixture rica não tinha o leitor de Storage necessário para sua
ilustração congelada: fornecido imageStorageFixture com adaptador real de
geração/bytes; 33/33, depois 45/45 e finalmente 47/47 passaram. Não houve mudança
no leitor de imagens. Um lint inicial incluiu d.mts e informou arquivo ignorado;
a conferência final aplica lint somente aos cinco arquivos JS, mantendo formato/
contrato da declaração.

## Limites

Sem produção de recursos persistentes, endpoint, interface nova ou implantação.
Gate próprio não autoriza o alvo derivado nem declara todo o arquivo restaurável.
Semântica da base/lore/imagens, consumidores de procedência, C4 antes de persistir,
upload/retomada, nova cópia/remapeamento, materialização/ativação e UI/ciclos seguem.

npm run validate permanece no fechamento do grande bloco conforme orientação
do operador. Typecheck/build/browser não repetidos por não haver mudança de
interface ou consumidor TypeScript. Não declarar a definição integral de
concluído satisfeita. Sem CI/push/PR/merge/deploy/subagentes; somente commit local.

Conferência final: lint/sintaxe dos cinco arquivos JS, arquitetura, links,
Prettier dos 14 arquivos e git diff --check passaram. Varredura dirigida não
encontrou chaves privadas literais, padrões de segredo ou artefatos acima de
5 MiB. Master em E permaneceu limpa em 522ccaa; dev server node 11192/5173
permaneceu HTTP 200, sem reinício.
