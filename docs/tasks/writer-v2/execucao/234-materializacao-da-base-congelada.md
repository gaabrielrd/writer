# P3 — Materialização da base congelada de campanhas

- Data: 2026-10-29.
- Base: 211910e.
- Estado: núcleo implementado e validado com checks dirigidos/SDK; sem ativação.

## Objetivo e requisitos

Materializar a estrutura/texto da base congelada arquivada nos caminhos
ordinários, mantendo procedência/nascimento originais e autorização atual
por recurso antes de ler prosa e na transação de escrita. Não recapturar a
aventura atual. Preservar partes, cenas/blocos, arcos/marcos/eventos e lore,
texto literal, campos vazios, campos emprestados, relações e links opacos.

Próprios continuam independentes do acesso aos derivados. Conteúdo omitido
no arquivo não revive. Recurso negado antes de sua cópia fica omitido; perda
de acesso depois de copiar partes impede avanço/conclusão, sem liberar
a campanha. Cancel continua removendo os temporários mesmo após revogação.

## Solução e arquivos

Acrescentar localizador cifrado opcional às linhas do índice derivado já
existente (ID do frame/cursor inicial), sem mudar value/hash semântico ou
as portas atuais. Nova porta interna locate lê posição autenticada sem prosa.
Usar esse localizador somente após autorização; não escanear payloads negados.
Índices anteriores continuam válidos para revisão/coleta; sem localizador,
materialização recusa com motivo próprio, preservando o job, exigindo nova
preparação explícita em vez de alterar registros imutáveis.

Compartilhar o journal nativo real de ownWrites com configuração fechada para
baseWrites e caminhos BASE/root/items/bodies/links/loreReferences. Preservar
o wire próprio existente. Antes do produtor, integrar cancel/coleta dos novos
alvos/journals e proteção do pai: não retirar a base enquanto restarem filhos,
inclusive desconhecidos. Layouts C4 1–4 permanecem; integração de temporários
ao C4 adequado antecede ativação.

Coordenador interno percorre linhas em chamadas limitadas; JSON limitado por
DTO, texto por frames de 64 KiB. Estado cifrado pequeno sem corpo crescente.
UTF-8 nativo/legado é convertido em chunks nativos completos, com verificação
incremental de bytes/hash; ajustar chunkCount sem mudar texto. Publicar item
após seus campos; corpo emprestado é escrito pelo dono original, sem duplicar.
Fonte de cada escrita é reautorizada na mesma transação.

Base raiz é criada após seus filhos e permanece preparing. sourceMode restored
e sourceEvidence preservam testemunhas originais. Relações de lore e vínculos
usam os codecs portáteis existentes; ledger de corpos é reconstruído dos
chunks efetivamente escritos. IDs de mídia são mapeados deterministicamente,
sem criar biblioteca/pin/binário neste incremento.

Arquivos: novo journal nativo compartilhado e wrapper base, formato/mapeamento/
coordenador da base, índice/staging persistido, contratos/store/cleanup/transfer,
testes próximos Node/SDK e documentação.

## Sequência e aceite

1. Localizador aditivo com validação/autenticação, regressão dos revisores.
2. Compartilhar journal próprio sem mudar resultados; inventário/coleta de
   base, proteção do pai e estado opcional antes do produtor.
3. Materializar base/item/campo/links/ledger com guards de origem, omissões,
   IDs/mapeamento e auditoria dos alvos registrados. Nenhuma chave/estado do
   cliente ou assinatura vale grant.
4. Testes de texto rico/legado/lore/local/global/borrowed, leitura ordinária
   após liberação só na fixture, duas mesas, omissões, revogação antes/depois
   de I/O e escrita, CAS/rollback/replay/cancel, órfãos e proteção do pai.
   SDK demo dirigido para prova nativa/Rules/coleta.
5. Revisão, ADR/AGENTS/inventário/arquitetura/evidência e commit local.
   Checks dirigidos agora; validate integral ao fechar materialização/ativação.

## Riscos, suposições e pendências

Native field limitado pelo contrato atual de captura; não diminuir quotas
ou truncar texto. Métodos de leitura de origem usam metadata/birth, nunca
prosa viva. Mudanças durante I/O falham sem avanço; cancel não reautoriza.
Auditoria registrada não substitui auditoria física final de ativação.

Variantes/âncoras, binários/biblioteca/pins, universo autorizado, C4 dos jobs,
auditoria física/ativação e Estúdio/ciclo rico continuam próximos. Não declarar
P3/D/F2-09 ou V2 concluídos; macro 8/35 permanece. Sem agentes/CI/push/PR/merge/
deploy; preservar master e servidor manual.

## Resultado local

Base congelada materializada com texto/estrutura/lore e evidência do arquivo,
autorização antes da prosa e na escrita, localizadores cifrados e journal/coleta
compartilhados. 276 casos Node distintos em rodadas (18 novos) e um cenário
SDK/Rules com fontes nativas reais positivos. Sintaxe de 480 módulos e lint
dirigido positivos. [ADR 0264](../../../decisions/0264-campaign-frozen-base-materialization.md)
e [evidência](../../../entregas/2026-10-29-writer-v2-materializacao-da-base-congelada.md)
registram escopo, correções e limites.

Variantes/âncoras, binários/biblioteca/pins, universo autorizado, C4 dos jobs,
auditoria física/ativação e Estúdio/ciclos continuam próximos. Macro 8/35 e
P3/D/F2-09 abertos; validate integral no fechamento desse bloco, somente commit local.
