# Writer V2 — modo de lore fixado na preparação

## Resultado local parcial

Start fixa política interna loreMode no job e reserva imutável. Configuração
posterior não muda pedido existente. Campo não aparece no input nem no progresso
público. Job/reserva divergentes, valor futuro, remoção unilateral e reserva
mutada são recusados. Prova histórica também conserva a política original.

Job sem política usa prefixo/provas já existentes. Entre fichas, consulta
metadata limitada a um candidato v2, com autenticação do journal original e
reconferência antes de writes. Sem evidência, conserva legado. Não copia prosa,
cria grant, migra cursor/hash ou reescreve reserva antiga.

[Plano 145](../tasks/writer-v2/execucao/145-modo-de-lore-fixado-na-restauracao.md)
e [ADR 0168](../decisions/0168-pinned-book-restore-lore-mode.md).

## Node dirigido

70 casos distintos positivos em seleções; não houve rodada única de 70.

- Oito novos casos de modo passaram na primeira rodada: dois sentidos de troca
  de configuração, retry/input/imutabilidade, legado sem evidência, prefixo legado,
  prefixo streamed, intervalo entre fichas indexadas e candidato sem journal.
- A mesma rodada de modo/upload teve 10/21, 2122.6643 ms: 11 regressões falharam
  porque fixtures antigas deixavam updateTime diferente de createTime já no
  nascimento. Upload/Integrity passaram a usar nativeUpdates true, sem alterar
  o double global nem relaxar servidor. Rodada afetada: 27/27, 650.3275 ms.
- Ativação e LoreStream: 34/34, 12290.9556 ms. Inclui campos/relações >8 MiB,
  perfil/datas/valores literais, replay/retomada, cancelamento/limpeza, Storage,
  universo, raízes/recibos/reservas recriados e retirada da revisão obsoleta.
- Mais um caso de prova histórica fixada passou 1/1, 483.4786 ms. Trocar modo
  no job/reserva não é adotado, e raiz ativa permanece igual.

Total sem duplicar reexecuções: modo 8 + Upload/Integrity 27 +
Ativação/LoreStream 34 + prova histórica nova 1. As falhas iniciais não contam
como aprovação. Nenhuma fixture ou dado próprio foi apagado para forçar sucesso.

## Firestore SDK/Rules

2/2 casos, zero skipped, 77431.6986 ms. Emulador verificado 1.22.0 loopback,
projeto demo isolado. Primeiro caso: modo e reserva nascem no mesmo commit;
replay com configuração oposta conserva política; SDK não escreve job/reserva;
input de modo, remoção unilateral e reserva alterada são recusados.
Logs PERMISSION_DENIED são esperados.

Segundo caso: metadados de modo foram removidos administrativamente para
exercitar a consulta legada entre duas fichas. Journal/heads v2 originais
certificam continuação mesmo com configuração false, sem raiz. Trata-se de
prova da consulta/seletor; não de certificação histórica de ativação desse
registro administrativamente alterado.

## Checks e limites

Lint/formato dos arquivos, syntax dos 297 módulos Functions, arquitetura,
links de docs e diff passaram; revisão sem bloqueador no escopo. Sem UI/protocolo cliente/query pública nova, não repetir provas
Chromium sem mudança nesses contratos. Sem validate global neste incremento.

Padrão da factory segue false. Ainda faltam matriz final e seleção coordenada
do runtime/validação integral de P1. Nenhuma conta real foi auditada; raízes
internas v1 sem marca de ausência não recebem inferência/reparo por esse campo.
Inventários, legados/coleta/rollout e fases/gates continuam no objetivo.
Somente commit local; sem CI, push, PR, merge, deploy, dependência ou subagente.
