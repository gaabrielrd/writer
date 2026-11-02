# ADR 0063 — Validação servidor dos backups JSON legados

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M19](../tasks/writer-v2/execucao/52-validacao-servidor-do-json-legado.md).

## Decisão

advanceBookRestoreValidation valida também writer-book-backup v1–v6, sem cursor,
DTO, relatório ou prova de conteúdo enviados pelo cliente. A fonte M14 alimenta
os mesmos passos lexicais M17, catálogo/normalização M18 e núcleo M15 usados no
leitor existente. Versão declarada precisa coincidir com a encontrada no arquivo.

Fases legacy-scan, legacy-catalog e legacy-normalize precedem semantic/recheck.
Unidades processam até 64 KiB/64 spans, finalizam catálogo, executam um passo de
normalização, até 64 relações ou 16 provas finais. A leitura de um item lógico
continua limitada a 8 MiB por ranges; não há limite de quantidade do projeto.

Scanner em EOF mais SHA integral M14 produzem a procedência. Não fabricar selo
de contêiner nem dados ausentes. Núcleo valida somente conteúdo próprio e IDs de
referência; metadados/corpos globais não são copiados e capa por URL não é buscada.
Resumo preserva disponibilidade/ausências e avisos legados, sem conceder acesso
ao universo, publicação ou direitos do arquivo.

## Snapshot e compatibilidade

validationVersion 1 continua exclusiva do contêiner novo, com snapshot de 64 KiB.
Version 2 é exclusiva do JSON legado. Seu envelope mantém schemaVersion 1 e
contexto UID/jobToken/restoreId/checkpoint; contém validationVersion 2 e stateJSON.

stateJSON é JSON canônico opaco de até 640 KiB UTF-8 reais, com margem nativa
para o envelope e abaixo do teto de documento. Isso comporta cursor lexical
M17 de até 512 KiB mais estados M18/M15. O limite mede o payload antes do
escape do envelope; mapas/arrays lexicais não são gravados como campos nativos
profundos. Contexto, hash, checkpoint e nascimento pelo primeiro recibo continuam
obrigatórios. Payload não entra em progresso, recibo ou lista; SDK direto negado.

Fases e resumo têm guardas por versão. Recibos antigos/v1 e limpeza continuam
compatíveis. Os dois formatos só chegam a content-verified após rechecagem das
provas de entrada; isso não ativa raiz nem reautoriza origem externa.

## Índice, releitura e atomicidade

Catálogo/perfis/grupos geram índices de metadados com origem nativa por recibo,
sem pointer de item semântico. Índices do núcleo usam itemIndex. Cada registro
normalizado ganha pointer com cursor anterior, localização, record/hash e tamanho,
sem DTO ou prosa. Relações retomadas usam readback M18 sem writes e conferem hash.

A preparação continua fora da transação final, registrando todas as observações
de chunks/provas/índices. O coordenador reautoriza o contexto e confirma leituras,
efeitos, snapshot/progresso e recibo juntos. CAS/identidade/I/O não rejeitam arquivo.
Erro de TypeError/RangeError do encoder de DTO, no ponto puro de codificação,
vira invalid-record; o mesmo tipo vindo de I/O permanece transitório.

## Inventário e continuidade

Nenhuma coleção nova. validationIndex/Items/State já pertencem ao cleanup v3;
o envelope de contexto permite limpar estado opaco/corrompido por máscara sem
ler seu payload e sem apagar contexto alheio. Reservas/marcadores/recibos ficam.

Materialização/remapeamento/mídia precisam ampliar o inventário antes dos writers.
Reautorização de universo, ativação atômica e host protegido/UI/roundtrip/validate
integral continuam pendentes em P1. Não há fluxo final de restauração nesta etapa.
