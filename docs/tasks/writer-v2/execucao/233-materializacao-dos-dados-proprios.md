# P3 — Materialização retomável dos dados próprios de campanhas

- Data: 2026-10-29.
- Base: 3c1cefa; revisão persistida validada no bloco 227–232.
- Estado: núcleo implementado e validado com checks dirigidos; sem ativação.

## Objetivo e requisitos

Gravar os dados próprios do arquivo aprovado nos caminhos ordinários da nova
campanha reservada: notas, sessões, checklist, preparação, referências e vínculos.
Preservar texto, ordem, estado e datas; remapear IDs por domínio e referências
de pai. Reconstruir revisões/contadores e controles globais e por sessão.
Raiz permanece o marcador privado sem ownerId; título/progresso são preparados
em estado cifrado até a futura ativação, sem conceder universo/base.

## Suposições e solução

Own e integridade concluídos autenticam os próprios, mesmo quando a origem
derivada foi revogada. Não exigir grant de derivados para recuperar notas.
Reusar fonte cifrada/frame reader e parser próprio até 4 MiB por DTO; avançar
1–25 frames e concluir no máximo um DTO por chamada, sem acumular seus pedaços
no estado. Conteúdo nativo atual é limitado a 512 KiB; não reduzir esses limites.

IDs determinísticos vinculam UID/RID/jobToken/domínio/ID original; body/item
compartilham mapeamento, pais dos vínculos são remapeados. sourceKey de referência
é ponteiro preservado, sem ler ou conceder conteúdo derivado. Novas revisões
começam em 1; controles vazios em 0 e nextOrder vem do máximo preservado.

Antes do produtor, inventariar ownWrites/ORDINAL sob o job e todos os caminhos
ordinários tocados. Cada journal mínimo e seus alvos são criados com o mesmo
recibo/nascimento; metadataHash, encarnação e imutabilidade autenticam alvos
sem ler prosa ao auditar/coletar. Cancel limpa estado/chave e coleta alvos/journal
antes dos índices e chunks, recusando órfãos/estrangeiros/recriados sem avanço.
Verificar vazio inicial e final de cada família. Não inserir caminhos em C4 1–4;
integração do job ao C4 apropriado continua obrigatória antes da ativação.

## Sequência e arquivos

1. Formato/mapeamento/inventário próprio, contrato opcional do checkpoint e
   coleta nativa por recibos antes da gravação de alvos.
2. Coordenador interno: frames/DTO próprio, controles globais e por sessão,
   auditoria limitada e metadata do projeto preparado. CAS/replay e reconferência
   de integridade após I/O; estado cifrado até 32 KiB, sem texto de notas.
3. Compor em campaignRestoreTransfer. Não criar callable ou interface.
4. Testes dirigidos: ricos/vazios/omissões, literais e limites atuais, remapeamento
   entre duas mesas, leitores ordinários após liberação somente em fixture,
   controles/mutações posteriores, rollback/CAS/reload/cancel/replay, corrupção,
   revogação e órfãos. SDK demo dirigido para nascimento nativo/Rules/coleta.
5. Revisão, ADR/AGENTS/arquitetura/inventário/evidência e commit local.
   Somente checks dirigidos neste incremento; validate integral no fechamento
   do próximo bloco de materialização/ativação, sem atribuir 227–232 ao novo código.

Arquivos previstos: novos campaignRestoreOwnFormat, campaignRestoreOwnWrites,
campaignRestoreOwnMaterialization; contratos/store/cleanup/transfer existentes;
testes Node/helper e SDK próximos, documentos do incremento.

## Aceite, riscos e limites

Dados lidos pelos serviços ordinários conservam conteúdo e vínculos próprios
com novas identidades. Campos de preparação exatos não ganham metadata extra.
Uma chamada não grava múltiplos DTOs grandes; tudo é atômico com journal/job/
operação e retry não duplica. Auditar por metadata/nascimento, nunca prosa;
cancelamento não depende da chave. Escritor atrasado perde CAS após cancel.

A prova interna indica preparação própria, sem ativação nem autorização dos
derivados. Ativação futura precisa auditoria atual e autorizações por recurso.
Base/lore/imagens, vínculo autorizado ao universo, C4 dos temporários, ativação,
Estúdio/ciclos, condições humanas/comerciais e política final das perguntas
permanecem pendentes. Macro 8/35 e P3/D/F2-09 abertos.
Preservar master e servidor manual; sem agentes/CI/push/PR/merge/deploy.

## Resultado local

Materialização própria retomável implementada com mapeamento, controles,
journal/auditoria e coleta antes dos índices. 258 testes dirigidos (19 novos)
e um cenário SDK/Rules positivos. Leitores e novas mutações ordinários
conferidos após liberação exclusiva de fixture; raiz produtiva segue pendente.
Veja [ADR 0263](../../../decisions/0263-campaign-own-materialization.md) e
[evidência](../../../entregas/2026-10-29-writer-v2-materializacao-propria-de-campanhas.md).

Próximo: materialização de base/lore/derivados/mídia, C4 dos temporários,
auditoria física de ativação, ativação e Estúdio/ciclos.
Validate integral no fechamento desse bloco; macro 8/35 e P3/D/F2-09 abertos.
