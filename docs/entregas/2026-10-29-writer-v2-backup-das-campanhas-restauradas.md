# Writer V2 — backup das campanhas restauradas

- Data: 2026-10-29.
- Escopo: [plano 220](../tasks/writer-v2/execucao/220-backup-das-campanhas-restauradas.md).
- Decisão: [ADR 0250](../decisions/0250-campaign-restored-backup-readers.md).
- Estado: leitores internos preparados; P3/D/F2-09 e macro 8/35 abertos.

## Implementação

Contextos de backup derivado, base/âncoras e corpos de variantes reconhecem
as provas privadas já definidas em 219. A validação pura da testemunha de item
é compartilhada com os leitores normais. Tokens incluem a prova e a cadeia,
com autorização por nascimento original exato antes de prosa. Não se usa a data
da cópia para reautorizar origem antiga, nem se expõem os marcadores no arquivo.

Nova emissão preserva capturedAt, texto congelado e nascimentos originais,
utilizando o ID privado atual da base. Âncora restaurada retida continua válida
após adoção nativa quando sua fonte permanece autorizada. Indisponibilidades
continuam explícitas, sem origem inventada nem leitura de texto revogado.

## Testes executados e resultados

20 cenários novos em campaignRestoredBackup.test.mjs, com fixture de cópia
somente em memória. Captura/testemunhas/edição/variante/adoção, emissão assinada
e revisão própria/derivada/origens usam os serviços reais do domínio.

- Arquivo rico com cena UTF-8 longa, lore local/global, imagem e variante longa.
  Revisão composta positiva e índices temporários descartados nas três etapas.
- Testemunha decodificada do arquivo confere com o ID privado novo e os
  nascimentos originais. Campanha/base antigas ausentes e sem consultas a elas.
- Edição viva posterior não substitui texto congelado no arquivo; provas
  privadas não aparecem nos bytes emitidos. Emissão não modifica o banco.
- Aventura/universo/ficha global/local recriados antes do nascimento da cópia:
  base ou item indisponível; sem nome/campo/texto derivado indevido.
- Mudança de nascimento de um nanossegundo; evidências nulas/parciais/
  redirecionadas/de outra cadeia/base/chave; gate de âncora retida.
- Variante retida após adoção de candidata nativa passa na reexportação e na
  revisão completa, e volta a indisponível quando sua ficha é recriada.
- Prova alterada sem depender de updateTime invalida a captura; alteração
  durante saída aborta o destino, sem commit de bytes parciais.
- Inventário físico continua somente metadata, com a mesma autorização.
- Notas próprias continuam no arquivo quando a aventura inteira fica indisponível;
  texto derivado de variante é omitido, e a emissão não consulta Storage.

Rodada conjunta dos consumidores afetados: **392/392**, zero falhas/skips,
16267.0894 ms, log local m143-backup-final.log no diretório de QA.
Essa rodada reuniu 19 novos e 373 regressões. Depois de reforçar as asserções
do arquivo e acrescentar o caso das notas próprias, a rodada nova passou com
**20/20**, zero falhas/skips, 1672.1032 ms (m143-restored-final.log).
Total de **393 cenários distintos**, sendo 20 novos e 373 regressões;
rodadas repetidas não são somadas.

Suítes: campaignRestoredBackup, campaignRestoredReaders,
campaignBackupDerivedSource, campaignBackupBaseRead, campaignBackupBaseInventory,
campaignBackupLore, campaignBackupLoreInventory, campaignBackupImage,
campaignBackupAudit, campaignBackupAttestation, campaignBackupFile,
campaignBackupOriginReview e campaignBackupDerivedSemantics.

A primeira montagem teve três falhas porque helpers da fixture ainda apontavam
para a campanha original já removida. A cópia passou a chamar os serviços com
seu próprio ID/token. Os três casos passaram sem alterar as regras de produção.

ESLint dirigido positivo e sintaxe de 447 módulos Functions positiva.
Formato, arquitetura, documentação e diff final positivos; revisão sem achados bloqueantes. Não foi repetido
npm run validate neste incremento; a suite integral fica para o fechamento do
grande bloco. O validate anterior de f575981 é evidência histórica do bloco
201–218 e não comprova estas mudanças.

## Limitações e continuação

Sem materializador persistente ou restauração de campanha na interface.
Próximo: referências opacas e inventário/cleanup C4 v1–v4 antes de persistir
dados de restauração. Depois upload/retomada, remapeamento/materialização,
ativação e Estúdio/ciclos. Sem CI, push, PR, merge ou deploy; commit local.
Dependências já instaladas no bloco anterior; não reinstaladas neste incremento.
Servidor manual preservado sem reiniciar ou encerrar processos.
