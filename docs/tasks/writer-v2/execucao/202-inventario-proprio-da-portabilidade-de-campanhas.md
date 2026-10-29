# P3 — inventário privado dos recursos próprios de campanha

- Data: 2026-10-29.
- Base: a30a8fa; sequência do [plano 201](201-portabilidade-privada-de-campanhas.md).
- Estado: inventário interno validado por testes direcionados, parte do passo 2; P3/D/F2-09 permanecem abertos.
- Macro 8/35. Somente commit local; sem CI, envio remoto ou subagentes.

## Objetivo e escopo

Percorrer por páginas todas as nove famílias próprias/estruturais da campanha,
com identidade nativa por recurso e por sessão, para preparar captura consistente.
Não usar uma lista de itens ativos como inventário completo e não fazer dump de
documentos. A etapa seguinte lerá DTOs/texto por unidades com estas provas.

| Família                   | Coleção direta da campanha | Dependências verificadas                                                                         |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| note                      | notes                      | noteState/current                                                                                |
| session                   | sessions                   | sessionState/current e seus próprios controles S2/S3, inclusive ausentes                         |
| checklist                 | workChecklist              | workProgress/current                                                                             |
| preparation-item          | preparationItems           | preparationState/current                                                                         |
| preparation-body          | preparationBodies          | preparationState/current e cabeçalho ativo do item com mesma revisão/kind                        |
| session-reference         | sessionReferences          | sessão e sessionReferenceState/SESSION                                                           |
| session-reference-state   | sessionReferenceState      | sessão, ID e revisão do controle                                                                 |
| session-preparation-link  | sessionPreparationLinks    | sessão e sessionPreparationState/SESSION; destino ativo ou tombstone existente quando link ativo |
| session-preparation-state | sessionPreparationState    | sessão, ID, revisão e nextOrder do controle                                                      |

A raiz e workProgress/current são singleton cobertos pela âncora inicial.
Base congelada, variantes/legadas e mídia terão inventário/autorização próprios
nos passos seguintes; não promover referências S2 a conteúdo próprio.

## Contrato de leitura

Adicionar campaignBackupInventory.mjs e teste dedicado. Reutilizar a validação de
escopo/token e identidade nativa da âncora, sem modificar seu DTO ou abrangência.
Expor apenas um serviço interno de listagem, sem index/callable/cliente/UI.

Entrada fechada: campaignId, sourceToken, family, limit opcional (1–25),
cursor opcional e expectedPageToken opcional. Capturar tudo antes de await.
Cursor canônico versionado vincula UID, campanha, sourceToken, família, limite e
último ID; limite codificado suporta IDs nativos de até 1.500 bytes sem reduzir
o contrato existente. Cursor não é segredo, grant ou prova de completude.

Em cada transação: exigir máscaras, conferir C4/raiz/controles globais pelo
sourceToken, depois ler somente metadados por ordem de ID. Query tem limite
limit + 1 e select com campos de roteamento/escopo/revisão/estado/datas, sem
título, descrição, texto, resumo, corpo, target de lore, chave, URL ou Storage.
Não filtrar deleted: tombstones e controles sem conteúdo continuam observáveis.

Conferir ownership, campaignId, campaignToken nativo, schema, ID e revisão.
Controles e pais são lidos por máscaras fixas e cache somente da transação/página.
Ausência de controle com itens, corpo sem pai, escopo divergente, revisão
incompatível ou timestamp nativo inválido recusam explicitamente sem escrever.
Sessões excluídas e itens-destino excluídos são tombstones válidos: não recriar,
descartar seus vínculos silenciosamente ou tratá-los como sessão/item ativo.

Cada itemToken vincula UID, campanha, sourceToken, família, ID, nascimento/
updateTime do documento e dependências nativas. Item session também observa
os dois controles opcionais por sessão; um vínculo criado depois de listar a
sessão invalida sua prova mesmo quando a âncora global não muda.

Resposta fechada: schemaVersion, campaignId, sourceToken, family, items de
id/itemToken, nextCursor e pageToken. pageToken inclui início, limite e todos
os documentos observados, inclusive o lookahead. expectedPageToken reconfere a
mesma página; divergência resulta em campaign-backup-page-changed. Erros de
recursos/dependências resultam em campaign-backup-item-inconsistent; identidade
nativa inválida mantém a recusa tipada da âncora.

## Consistência e limite da prova

Paginar até nextCursor null, registrar provas em índice limitado e repetir
todas as famílias desde o começo antes do selo. Conferir igualdade dos itens,
páginas, fim, presença/ausência e âncora final. Nova inserção atrás do cursor
não é detectável por consultar apenas a página seguinte. A segunda passagem e
os controles monotônicos por sessão são obrigatórios; uma página isolada não
certifica o projeto e um cursor fabricado não pode ativar restauração.

O futuro produtor/validador também precisará conferir a cobertura completa dos
manifestos. Este incremento não aceita relatório cliente como prova de arquivo
nem cria prosa/pins/jobs. C4 continua v1–v4 até o inventário de persistência P3.

## Arquivos e sequência

1. Exportar helpers internos existentes de scope/token/identity em
   functions/src/campaignBackupSource.mjs, preservando o contrato e seus testes.
2. Implementar funções/famílias fixas e serviço em
   functions/src/campaignBackupInventory.mjs; não adicionar abstração genérica
   de banco, dependência ou rota.
3. Testar escritores reais e banco transacional com máscaras: todas as famílias,
   paginação, controle por sessão, tombstones, exclusão, recriação e falhas.
4. Revisar diff, registrar ADR/evidência parcial e atualizar plano/índices.
   Rodar somente testes afetados e checks estáticos/documentais necessários.
   Validate integral no fechamento do grande bloco P3.

## Critérios de aceite

- [x] Todas as nove famílias alcançáveis por paginação limitada sem filtro ativo.
- [x] Entrada/cursor fechados e congelados antes de I/O; nenhum caminho arbitrário.
- [x] Sem prosa, query ilimitada, gravação, segredo ou consulta da origem derivada.
- [x] Tokens nativos por unidade e por sessão detectam mudanças reais S2/S3
      ausentes da âncora global; páginas antigas recusadas no replay.
- [x] Sessão/item excluído mantém vínculos inventariáveis; corpo inconsistente
      ou controle com escopo errado recusa sem mutação.
- [x] Conta diferente/C4/mudança global recusam antes de consultar filhos.
- [x] Testes direcionados e checks reais registrados, sem ampliar alegação para
      backup/restauração completos ou autorização da edição congelada.

## Riscos e não escopo

A listagem atual dos serviços de usuário filtra ativos; não a reutilizar como
inventário de backup. A nova query não depende de pai ativo, mas exige seu
tombstone válido. Estado impossível não é truncado nem escondido.

Sem DTO de conteúdo, arquivador, prova de procedência, assinatura, mídia,
restauração, C4 novo, Rules, endpoint ou UI neste incremento. A política de
perguntas do plano 199 e gates humanos/comerciais não são alterados.
