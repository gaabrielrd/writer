# P1 / M34b — Texto e estilo do rascunho na preparação privada

## Objetivo e contrato

Consumir o rascunho verificado sem sobrescrever o manuscrito salvo. Preparar
partes e metadados de uma versão separada quando o texto difere, incluindo
contribuição vazia e capítulo removido. None não equivale a texto vazio.

- Uma parte raw por unidade, SHA incremental/bytes finais e verify(tx) do item
  e bytes. Preservar Unicode/BOM, sem limite total novo ou lista de todos os textos.
- Comparar hash/tamanho exatos com capítulo legado preparado e comprovado.
  Não comparar com campo congelado de capítulo composto por cenas.
  Igual ao salvo: não duplicar corpos. Removido/diferente: identidade de versão
  de domínio próprio, distinta das identidades dos históricos remapeados.
- Persona vem somente do item: exigir definição idêntica comprovada ou preparar
  contribuição exclusiva M34a. Nenhuma biblioteca atual é consultada/copiada;
  compartilhar definição não faz no-op físico. draftProfileId permanece estável.
- Guardar metadados integrais do capítulo e vínculo/hash do perfil em
  preparedDrafts/current sob o job. Não inventar datas, rótulos ou contagens.
- Inventário v11 antes de qualquer novo recurso; certificar namespace/journals
  vazios. Journal/corpo/perfil/descriptor/cursor/recibo atômicos e cleanup limitado,
  inclusive partes sem descriptor final. Compatibilidade v1–v10.
- Progresso v8 mantém cursor no rascunho durante partes. Final termina em
  draft-finalize, consumindo o item uma vez e deixando capa intacta.

## Tarefas e aceites

1. [x] Contrato de progresso e inventário v11 antes dos recursos.
2. [x] Escritor interno retomável, comparação exata, texto e persona verificados.
3. [x] Testes Node/SDK de estados, fronteiras, falhas, replay e cleanup.
4. [x] Revisão, ADR/docs/evidência e commit local.

## Continuação obrigatória M34c/P1

O manifesto workVersions ainda não é criado: a próxima etapa deverá conferir
metadados, contagem de palavras, preservação portátil da contribuição e todos os
corpos antes de finalizar a versão separada. Não fabricar wordCount zero nem
marcar a etapa como capa/ativada antecipadamente. Raiz ausente/countReady false.
O resultado é preparação privada do texto, não versão utilizável ou restauração
concluída. Os mesmos requisitos valem para rascunhos grandes.

Faltam finalizar a versão/metadata, capa, integração de personas, campos grandes/
consumidores, certificação/ativação e host/UI/roundtrip/validate integral.
Metadata acima do envelope nativo falha intacta; representação integral permanece
obrigatória antes da ativação. P1/F2-09 e Writer V2 abertos.
Sem API pública, Rule, dependência, crédito, subagentes ou CI/push/PR/deploy.

## Resultado local

12 cenários novos integram 105 testes Node dirigidos positivos. Dois SDK reais
confirmam texto/perfil privados, rollback/retomada e cleanup v11 protegido.
Nenhuma versão recuperada utilizável ou raiz foi ativada.
[Evidência M34b](../../../entregas/2026-10-22-writer-v2-rascunho-na-preparacao-privada.md)
e [ADR 0079](../../../decisions/0079-restored-draft-preparation.md) registram os
resultados e a continuação obrigatória M34c. P1/F2-09 seguem abertos.
