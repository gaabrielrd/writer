# P1 — limpeza retomável após ativação

## Objetivo e descoberta

Concluir a limpeza própria do [plano 133](133-revisao-e-ativacao-do-livro.md)
após [mídia](134-finalizacao-da-capa-restaurada.md), sem usar cancelamento.
Grafo consultado; símbolos atuais ausentes. Código atual mantém arquivo original,
índices/estado de validação, definições privadas e journals sob job. Recibos
globais e lote de personas ainda comprovam disponibilidade; devem permanecer.

Não regravar job/recibo/reserva de ativação, conclusão/recibo de mídia, lote ou
perfis. Não apagar nem revalidar como preparação os dados do livro ativo, que
podem ter sido editados/excluídos legitimamente.

## Contrato antes do código

1. Pré-requisito: mídia concluída por prova nativa. Se imagem original preparing
   foi retirada pelo dono, permitir finalizeBookRestoreMedia concluir unavailable
   somente após tombstone original deleted, origem/prova intactas, contador zero
   e nenhum uso. Não há I/O Storage, URL, imagem nova ou alteração da raiz.
   Remoção durante um PATCH invalida aquela tentativa; nova tentativa observa
   a remoção confirmada. Imagem ausente/estrangeira/em exclusão não é tombstone.
2. Novo progresso privado e recibos separados; job terminal permanece imutável.
   Entrada fechada restoreId/jobToken/operationId/expectedRevision; cursor só
   servidor, lotes fixos. Getter informa waiting-for-media/not-started/andamento/
   done. Revalidar ativação e mídia originais por unidade. Progresso e deletes/
   recibo atômicos; prova nativa do primeiro/último recibo, CAS e replay históricos.
3. Journals materializationArtifacts em páginas de oito. Autenticar endereço/
   contexto/recibos/nascimentos originais. Para seis famílias sob job, autenticar
   alvo original e apagar alvo+journal. Para dados nativos do livro/personas,
   apagar somente journal original, sem ler/escrever seu alvo atual.
   Contar exatamente artifactCount-retiredArtifacts; preparação antiga não muda.
4. Percorrer recibos originais por restoreId e ID, um por unidade, preservando-os.
   append autentica chunk imutável nascido no mesmo commit e apaga só esse chunk,
   contando bytes. advanceIntegrity autentica provas imutáveis do seu commit
   dentro da janela máxima de 16 índices anterior ao fim; provas de passos
   anteriores ficam para seu recibo. Prova posterior/recriada falha.
   Confirmar totais uploadedChunks/uploadedBytes/checkedChunks ao terminar.
   Guardar apenas ID do recibo da validação final, sem lista/catálogo/prosa.
5. Apagar validationIndex/items por páginas de oito, com createdByOperationId,
   identidade e recibo original imutável. Total items igual validationMeta.items.
   Apagar estado final somente com hash/checkpoint/nascimento e última atualização
   nativa originais. Não ler bytes/prosa do upload ou valores dos índices.
6. Conferir vazios os namespaces privados conhecidos e ausência da chave/estado
   de integridade. Recusar órfãos/estrangeiros/recriados, preservando dados incertos.
   Namespaces novos exigem evolução do contrato. Não é varredura global contra
   mutações Admin arbitrárias ou filhos desconhecidos sob pais inexistentes.

## Estado e escopo

Controle em archiveCleanup/current; recibos em bookRestoreArchiveOperations.
Guarda revisão/fase/cursor/contadores e primeiro/último recibo, sem prosa ou lista.
Operação nova após done retorna already-complete sem writes; recibos anteriores
confirmam com progresso atual. SDK não acessa novos controles/recibos.

Arquivos removidos não são recuperáveis por cancelamento. Livro ativo, histórico,
fontes/corpos, biblioteca, universos, reservas e provas de ativação/mídia/personas
permanecem. Leitores normais e recaptura devem continuar funcionando.

## Aceites e validação dirigida

- [x] Progresso/CAS/recibos/deletes retomáveis e nativos, sem mutar ativação.
- [x] Famílias privadas e arquivo/índices removidos com contagem exata e limites.
- [x] Livro editado/excluído e biblioteca preservados; leitores normais funcionam.
- [x] Capa removida originalmente conclui unavailable sem reconstrução.
- [x] ABA/ausência/estrangeiros/retry/replay/erros protegem dados incertos.
- [x] Node/SDK/checks/documentação e commit local; resultados na
      [evidência](../../../entregas/2026-10-25-writer-v2-limpeza-pos-ativacao.md).
- [ ] Host/UI/roundtrip integral/inventários/legados/rollout/validate de P1 e
      fases 3–5/gates permanecem no objetivo.

Sem CI/push/PR/merge/deploy/subagentes. Testes dirigidos; suíte global no
fechamento do grande bloco P1.
