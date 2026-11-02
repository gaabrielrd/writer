# ADR 0152 — Inventário final da preparação de livros

- Status: implementado; ativação e fechamento de P1 pendentes.
- Data: 2026-10-25.
- Plano: [132](../tasks/writer-v2/execucao/132-inventario-final-da-restauracao.md).

## Decisão

Antes de criar a raiz, advanceBookRestoreAudit congela a preparação completa em
schema13/resources-audit. Requer índices completos, Counts/drenagem concluídos,
capa preparada e lote de personas original ainda preparando. Revalida job,
reserva, marcador, raiz ausente e controles a cada avanço.

Primeiro percorre os journals originais; depois, os 32 namespaces físicos
conhecidos, incluindo filhos e perfis filtrados pela origem do livro. Cada
unidade consulta no máximo oito documentos de conteúdo por página; pais têm
cursor separado e são autenticados pelo resolvedor original. Conferir alvos,
journals, recibos e timestamps nativos. Recusar stageKind, documento sem journal,
nascimento recriado e qualquer divergência de totais.

O cursor fechado contém somente posição, contagens, contexto e uma âncora
nativa. Contexto fixa job, validação, destino, totais e layout. Não carrega
prosa, catálogo ou lista de provas. Escritas são só job e recibo atômicos.
Artefatos permanecem intactos; saldo criado/retirado/limpo mantém seu significado.

Após páginas vazias finais e igualdade exata dos dois totais, marcar
activation-ready/audit done. Isso não cria livro, ativa personas, libera imagem
ou concede acesso. Cancelamento cleanup14 e recibos anteriores continuam válidos.

## Limites

O inventário se apoia em escritores congelados e Rules que negam acesso SDK sem
raiz. Não é snapshot global contra mutações administrativas arbitrárias, nem
descoberta de namespaces desconhecidos ou filhos sob pais inexistentes.
Evoluir o layout explicitamente antes de acrescentar um namespace produtor.

Auditoria histórica é metadata, não grant nem verificação atual de Storage.
A futura ativação deve revalidar revisão, universo, Storage e provas nativas,
e criar raiz/controles/vínculos/lote atomicamente. Portabilidade, host, roundtrip
integral, inventários gerais, legados, rollout e validate de P1 seguem abertos.

[Evidência](../entregas/2026-10-25-writer-v2-inventario-final-da-restauracao.md).
