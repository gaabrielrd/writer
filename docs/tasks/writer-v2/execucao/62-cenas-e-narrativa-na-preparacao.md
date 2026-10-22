# P1 / M29 — Cenas e narrativa na preparação privada

## Objetivo e solução

Materializar todos os recursos de cenas e planejamento narrativo do backup
validado no destino reservado, antes da reconciliação de contagens e ativação.
O lore próprio já preparado por M28 é contado, sem regravá-lo.

- Consumir um item verificado por unidade, com item.verify(tx) antes do commit.
- Remapear IDs por M21; preservar prosa, hash/bytes, ordem A/B, arquivo,
  pais removidos e referências indisponíveis sem conceder autorização.
- Gravar cenas, corpo, planejamento, referências, fontes e controle sem capítulo;
  gerar sceneLoreLinks pela mesma chave nativa do escritor normal.
- Gravar controles narrativos, arcos, marcos, cronologia e vínculos, incluindo
  sourceKey/sourceArcId/loreKey compatíveis com as consultas existentes.
- Permitir recursos intercalados e filhos anteriores aos pais. Não assumir
  existência do pai durante a escrita privada; a validação integral já confere
  vínculos obrigatórios. Journal registra cada filho no mesmo commit.
- Vínculos equivalentes compartilham chave canônica. Revalidar conteúdo e journal,
  sem regravar os pares idênticos: Firestore conserva updateTime em no-op.
  resourceCounts conta registros consumidos; artifactCount conta pares únicos.
- Preparação v3/inventário v7 antes dos novos recursos. Conferir namespaces novos
  vazios na migração e manifesto completo ao final; cursor principal avança sem
  descartar itens. Manter leitura/replay/cleanup de v1–v6.
- Limpar filhos pelo journal tipado em lotes antes dos pais. Antes de remover
  cena/arco, certificar vazios seus filhos nativos, recusando filhos não registrados.
  Corpos grandes de capítulos seguem a fase v5. Repetir certificação final.
- Preservar ausência da raiz, controle countReady false e contagens derivadas
  ainda não reconciliadas. Fase final deste escritor: resource-counts, com
  cursor no primeiro item de personas, sem avançar esse item.
- Campos derivados começam neutros: wordCount/sceneCount/referenceCount e
  revisões de estrutura/composição. Recalcular em etapa obrigatória posterior,
  com ledger compartilhado, antes de ativar ou servir a cópia.

## Tarefas e aceites

1. [x] Projeção nativa/chaves fechadas de todos os onze tipos após lore e índice.
2. [x] Journal/cleanup v7 com filhos antes dos pais e migração compatível.
3. [x] Escritor interno, progresso v3, manifesto, replay/CAS/rollback.
4. [x] Testes dirigidos Node e SDK real; documentação/revisão/commit local.

## Riscos, limites e não escopo

Um item lógico pode exceder o documento Firestore ou a quota dos leitores normais.
A escrita deve falhar inteira sem perder fonte/cursor e sem reduzir o formato.
Representação de campos grandes e adaptação de consumidores continuam obrigatórias.

A raiz continua ausente: nenhum contador neutro fica visível ao editor. Preparação
não é restauração concluída. Ainda faltam reconciliação, personas, histórico,
rascunho/capa, autorização final, ativação, host/UI e roundtrip/validate de P1.
Datas nativas novas; datas dentro da fonte congelada preservam o conteúdo original.
Nenhuma API pública/Rule, crédito, dependência, push/CI ou deploy novo.

O inventário confere os caminhos tipados produzidos pelo protocolo. Não varrer
ou apagar subcoleções arbitrárias criadas por Admin fora desse inventário;
inconsistências nos namespaces conhecidos interrompem para investigação.
