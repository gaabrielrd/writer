# ADR 0256 — Inventário versionado da limpeza de campanhas

- Data: 2026-10-29.
- Estado: aceita; validação dirigida e npm run validate positivos no bloco 219–226.
- Relacionadas: [0036](0036-campaign-deletion.md),
  [0255](0255-campaign-portable-variant-body-lifecycle.md).

## Decisão

campaignDeletionInventory é a definição privada e imutável dos layouts C4
1–4. Executor e validador de checkpoints usam as mesmas listas de recovery,
controls, coleções de bases/gerações e filhos da campanha. Ordem, masks,
filtros e whitelists anteriores são preservados. Versão ausente continua 1;
start continua 4 e versões desconhecidas continuam recusadas.

Nenhuma versão ganha uma coleção retroativamente. Recursos de uma versão
posterior não são consumidos ao retomar checkpoint antigo. Futuras famílias
persistentes exigem integração explícita, versão adequada e reserva antes do
produtor. O mapa físico está no
[inventário de portabilidade](../tasks/writer-v2/inventario-portabilidade-campanhas.md).

## Dados restaurados atuais

sourceEvidence, referências e relações portáteis e bodyCodec são campos de
documentos já cobertos, sem novas coleções. A exclusão não interpreta esses
payloads nem exige autorização das fontes: elimina somente recursos próprios
cuja campanha/pai e identidade foram conferidos pelo C4.

Bases e gerações são enumeradas fisicamente, preservando seus pais até retirar
filhos. Não seguir somente ponteiros ativos: corpos podem estar em layout
legado ou geração antiga, e âncoras podem apontar para base retida.
Não prometer descobrir filhos opacos sem pai ou registro seletivo.

Pins de imagem continuam por etapa, com chave tipada, campanha/base/contador
conferidos atomicamente. Biblioteca, aventura, outra mesa e outros donos são
preservados; falha de identidade não avança checkpoint nem decrementa uso.

## Máscara do guard

Confirmação e início mantêm seus campos atuais. Durante cada passo, currentRoot
precisa apenas ownerId/schemaVersion/deleting/deletionId e identidade nativa
do snapshot. Sua máscara não busca título, procedência ou prosa. Raiz ausente
continua permitindo coleta pela reserva; encarnação divergente interrompe.

## Limites

Esta mudança prova a limpeza dos dados materializados usados pelos leitores
219–225. Ainda não existem jobs, uploads, imagens exclusivas ou índices
persistentes de restauração de campanha. Sua futura coleta/cancelamento e
associação seletiva precisam ser implementados antes da primeira gravação.
Sem novo endpoint, fase pública, DTO ou Rule neste incremento.
