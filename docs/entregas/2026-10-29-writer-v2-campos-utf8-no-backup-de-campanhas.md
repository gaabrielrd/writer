# Writer V2 — texto UTF-8 no backup de campanhas

- Data: 2026-10-29.
- Escopo: [plano 217](../tasks/writer-v2/execucao/217-campos-utf8-no-arquivo-de-campanha.md).
- Decisão: [ADR 0247](../decisions/0247-campaign-backup-utf8-fields-v2.md).
- Estado: correção interna parcial; P3/D/F2-09 e macro 8/35 abertos.

## Correção entregue

Uma cena válida com 90.007 bytes e caracteres multibyte era capturada nativamente,
mas o backup falhava porque exigia partes fixas em vez das fronteiras UTF-8 reais.
Falha reproduzida antes de alterar o produtor/leitor: campaign-backup-audit-changed.

A emissão agora usa contentVersion 2 e raiz lógica v2. Produtor/leitor compartilham
a conferência de partes nativas dos campos congelados e âncoras, sem concatenar
o texto inteiro. Soma/SHA/ordem/tamanho/UTF-8 e fronteira máxima são exatos.
Só texto congelado admite essa regra: JSON/metadados/imagens continuam fixos.
O emissor assina a versão da auditoria e o leitor exige igualdade com o header.

Leitura de arquivos contentVersion 1 mantém suas regras originais e foi exercitada
com arquivos realmente assinados em provenanceVersion 1 e 2, inclusive chave
verify-only. Nenhum limite do editor, conteúdo congelado ou acesso mudou.

## Validação executada

- Novos: campaignBackupUtf8Fields.test.mjs, **19/19**, zero falhas/skips,
  2426.5018 ms na execução final.
- Regressões pertinentes: campaignBackupFile (29), campaignBackupAudit (22),
  campaignBackupAttestation (31), campaignBackupOriginReview (56) e
  campaignBackupOwnSemantics (47), campaignBackupBaseRead (20) e
  campaignBackupBaseInventory (26): **231/231**, zero falhas/skips, 10580.6477 ms.
- Total: **250 cenários distintos aprovados**; não é a suíte integral.
- Conteúdo nativo rico: cena, principal compartilhado, bloco adicional, lore,
  campos vazios e âncora; UTF-8 literal com BOM/espaços/emojis/acentos/quebra.
- Uma entrada de 131.072 bytes exporta três partes [65535,65536,1], sem perda.
  V1 recusa essa nova gramática em vez de a reinterpretar.
- Âncora legada mantém texto longo após adoção e remoção da base antiga.
  Arquivo passa na leitura própria e revisão autorizada das origens.
- Adulterações: divisão no meio de caractere com mesmos bytes/SHA concatenados,
  fronteira não máxima, UTF-8 inválida, contagem/tamanho/vazios inválidos,
  versões divergentes/desconhecidas e fonte alterada durante publicação.
- Emissão sem callback de publicação também recusa fronteiras nativas não
  máximas com texto/SHA completos inalterados; auditoria e arquivo concordam.
- Helpers de reassinatura usam agora o domínio da versão real; o teste de
  versão inválida mudou para 3 porque 2 passou a ser suportada.

Uma asserção inicial comparava o lore à entrada antes da normalização do escritor.
Foi corrigida para a edição nativa capturada, sem mudar o escritor nem afrouxar a
comparação de bytes. Cenas/blocos continuam comparados literalmente ao conteúdo
salvo. A preparação inicial da reprodução também teve um operationId curto;
corrigido antes de confirmar a falha real, sem contar essa tentativa como prova.

## Limites e continuação

Sem endpoint/UI, produtor persistente, recurso/prosa/pin novo ou implantação.
Esta correção identificada na inspeção derivada precisava preceder os joins:
base/item/parent/fields/corpos/links/lore/imagens/âncoras e consumidores ordinários
continuam pendentes, seguidos por C4 v1–v4 antes de persistir, upload/retomada,
nova cópia/remapeamento, materialização/ativação, interface e ciclos.

npm run validate permanece no fechamento do grande bloco. Sem mudança de
interface/consumidor TypeScript, typecheck/build/browser não repetidos.
Não declarar a definição integral de concluído satisfeita. Sem CI/push/PR/merge/
deploy/subagentes; somente commit local. Servidor manual preservado.

Conferência final: lint e sintaxe dos 11 arquivos JS alterados, arquitetura,
links, Prettier dos 19 arquivos e git diff --check passaram. Varredura dirigida
não encontrou chaves privadas literais, padrões de segredo ou artefatos acima
de 5 MiB. Master em E permaneceu limpa em 522ccaa; servidor manual node 11192
na porta 5173 seguiu HTTP 200 sem reinício. Hooks não foram contornados.
