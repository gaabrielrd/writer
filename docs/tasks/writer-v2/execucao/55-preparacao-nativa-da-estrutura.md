# P1 / M22 — Preparação nativa da estrutura e limpeza v4

## Objetivo

Gravar atos, capítulos e ledger no destino reservado, com raiz ausente, contagem
reconstruída e descarte seguro. É a primeira escrita de recursos de P1; mantém
pendentes demais recursos, ativação e UI, sem declarar restauração completa.

## Requisitos e solução

- Usar somente M20/M21 para conteúdo/IDs e verify(tx) na transação consumidora.
- Um item de estrutura por operação, CAS e recibo idempotente. Estado de conteúdo
  continua content-verified; progresso de preparação distingue structure/resources.
- Fixar validationCheckpoint separado antes de avançar a preparação: snapshot
  final de validação não muda ao criar recursos. Não relaxar o vínculo em v1–v3.
- Primeira unidade inicializa workProgress privado no destino; seguintes criam
  atos e capítulos. Reusar createWorkProgressLedger, com countReady falso para
  não gravar raiz. Só metadata/atos/capítulos; parar antes dos demais tipos, sem
  ignorá-los ou declarar a cópia pronta.
- Preservar texto, títulos, ordem, vínculos e slots; reconstruir dono/ID/datas,
  revisões e contagens. Composição scenes começa em zero até a etapa de cenas.
- Native writer e journal privado de artefatos são atômicos junto de cursor,
  contadores e recibo. Não escrever recursos antes de ampliar cleanup.
- Cleanup v4 cobre exatamente acts, chapters, workProgress, workWordGroups e
  workWordSources mais materializationArtifacts. Caminhos vêm de tipo/ID fechado,
  nunca de caminho arbitrário do arquivo.
- Provar nascimento do documento/journal junto ao recibo criador e sua última
  atualização junto ao último recibo. Limpar por máscara de metadados, sem ler
  texto; recusar recurso alterado, recriado, estrangeiro ou raiz presente.
- Até 50 artefatos por etapa de limpeza; contar os pares realmente removidos,
  conferir namespace vazio antes de apagar arquivo/índices e novamente ao terminar.
  Inventários antigos v1/v2/v3 permanecem compatíveis.
- Não criar raiz, perfil, mídia ou vínculo global. Método de estrutura é interno,
  sem export HTTP/callable até o protocolo completo estar pronto.

## Sequência e critérios de aceite

1. [x] Implementar inventário/journal v4 e conferência de origem nativa.
2. [x] Integrar preparação de metadata/atos/capítulos e ledger existente.
3. [x] Provar leitura M20 após avanços, retries/CAS/perda de resposta, cancelamento,
       limpeza limitada, foreign/ABA, nenhum acesso SDK ou overwrite de destino.
4. [x] SDK real, regressões dirigidas, checks, revisão, documentação e commit local.

## Limites e trabalho obrigatório seguinte

A escrita inicial usa documentos nativos atuais. Se conteúdo válido do formato
exceder o armazenamento nativo, a transação precisa falhar inteira, conservar
fonte e checkpoint e não rotular o arquivo inválido. Não truncar nem baixar o
limite de 8 MiB do formato. Representação de campos grandes e adaptação completa
dos leitores/escritores ainda são obrigatórias antes de concluir P1.

Faltam cenas/fontes/narrativa/lore, história/rascunho, perfis/mídia, representação
grande, autorização/ativação, host/UI/roundtrip e validate integral P1. O rascunho
diferente continua destinado a versão separada, preservando manuscrito salvo.
Sem dependência nova; CI ignorada e somente commits locais.

## Resultado local

Implementados estrutura/ledger, journal privado, snapshot fixado e cleanup v4.
103 Node dirigidos passaram, incluindo 17 novos; dois SDK reais passaram e o
cenário de estrutura foi repetido após ajuste de retry por tentativa. Ver a
[evidência](../../../entregas/2026-10-22-writer-v2-estrutura-nativa-da-restauracao.md).
Campo content de 1.100.000 bytes continua íntegro no arquivo após rejeição pelo
SDK, sem avanço ou recibo parcial. Essa limitação está demonstrada e permanece
pendente de representação grande. P1/F2-09 continuam abertos.
