# Writer V2 — referências portáteis da base congelada

- Data: 2026-10-29.
- Escopo: [plano 221](../tasks/writer-v2/execucao/221-referencias-portateis-da-base.md).
- Decisão: [ADR 0251](../decisions/0251-campaign-portable-base-references.md).
- Estado: leitores internos preparados; P3/D/F2-09 e macro 8/35 abertos.

## Implementação

Representação privada fechada para links/ledger de bases restauradas, sem
fabricar IDs de origem a partir de hashes. Validação compartilhada, seleção
de metadata e projeção pelo leitor normal. Mantém os DTOs públicos existentes:
vínculo indisponível conserva sua identidade sem targetKey nem origem bruta.

Backup confere fonte/item/ledger e testemunha reversa em consulta limitada.
Alvo disponível exige autorização atual e ID canônico de ledger. Alvo ausente
continua explícito; o backup recusa presença física contraditória por metadata,
sem consultar origem ou prosa. Marcadores privados não entram no arquivo.

Extraída a fábrica temporária de índices dos testes de reexportação para helper
compartilhado, mantendo suas três etapas e descarte; nenhum adaptador de produção.

## Validação dirigida

21 cenários novos de campaignPortableReferences.test.mjs:

- DTOs reais de vínculos/ledger convertidos somente no banco em memória;
  reexportação conserva os mesmos DTOs, com lore local/global, cena e evento.
- Arquivo real assinado passa na revisão própria/derivada/origens, sem IDs
  brutos externos nem marcadores privados nos bytes.
- Alvo ausente permanece indisponível quando a fonte viva volta; leitor normal
  não consulta item ausente ou ficha original.
- Não resolve marcador indisponível mesmo se item aparecer depois; backup
  recusa essa contradição física antes de emitir conteúdo inconsistente.
- Revogação/recriação de ficha impede reautorizar material antigo.
- Onze violações de marcador, correspondência link/ledger, campos nativos
  conflitantes, estado processed, chave canônica e testemunha reversa.
- Base nativa não aceita marcador portátil. Alteração válida do alvo lógico,
  sem alterar updateTime, recusa token antigo pelo motivo específico esperado.

Rodada conjunta: **272/272**, zero falhas/skips, 12885.4658 ms;
log local m144-references-final.log no diretório de QA.
São **21 novos e 251 regressões distintas**, sem somar rodadas repetidas.
Após tornar específica a asserção de token obsoleto, os 21 passaram novamente
(1385.6205 ms), log m144-portable-final.log.

Regressões: campaignRestoredBackup, campaignRestoredReaders, campaignBaseRead,
campaignBackupBaseRead, campaignBackupBaseInventory, campaignBackupAudit,
campaignBackupFile, campaignBackupDerivedSemantics, campaignComparison e
campaignAdoption. ESLint dirigido e sintaxe de 448 módulos Functions positivos.
Formato, arquitetura, documentação e diff final positivos. Revisão manual sem
achados bloqueantes; scan dirigido sem marcadores de segredo.

A primeira montagem do caso nativo conservava evidências restauradas nos itens;
o gate anterior corretamente recusou a mistura antes da leitura do vínculo.
A fixture passou a representar base e itens nativos de forma consistente.
Não houve relaxamento do contrato de produção.

## Pendências

Vínculos de sessões e relações externas de lore/variantes ainda precisam de
contrato próprio. Depois: inventário/cleanup C4 v1–v4, upload/retomada,
remapeamento/materialização/ativação, Estúdio e ciclos completos.
Não há produtor persistente, implantação ou nova validação SDK neste incremento.
As consultas foram verificadas nos doubles com metadata/limites explícitos;
isso não prova a configuração de produção.

Suite integral não repetida: npm run validate fica para o fechamento do grande
bloco, conforme orientação do operador. O validate de f575981 é histórico do
bloco 201–218 e não cobre estas mudanças. Sem CI/push/PR/merge/deploy.
Commit local e servidor manual preservado sem reiniciar/parar processos.
