# F2-09 P1 M8 — Rascunho explícito do capítulo aberto

Contrato em 2026-10-21 sobre ffad8d7. P1/F2-09 abertos. Grafo consultado
primeiro; exportManuscript, Chapter, fluxo histórico e contratos atuais conferidos.

## Objetivo e contrato

Preservar contribuição local explícita do capítulo legado aberto, inclusive texto
vazio e recurso removido remotamente, sem autosave, versão manual ou gravação.
Captura salva permanece separada: nenhum capítulo reaparece automaticamente.

bookDraftBackupRecords congela sincronicamente metadados conhecidos e string de
texto ao criar o gerador, antes de await/next. Valida bookId do capítulo e recusa
modo scenes, cuja prosa é composição. Não depende da existência do capítulo atual.
Preserva título, ordem, actId/complemento/datas presentes; não inventa datas,
contagens, audiência ou flags. Inputs extras/credenciais não entram no arquivo.

Um capítulo removido pode ter complemento de persona ausente da captura M6.
Nova leitura getBookBackupDraftPersona autoriza livro/origem M3b e ID de persona
declarado na contribuição explícita. Resolve somente preset conhecido ou perfil
da conta autenticada; não exige capítulo existente nem lista biblioteca.
Este é um vínculo local declarado, distinto do vínculo salvo M6. Não é grant.
Perfil arquivado continua portátil. Token fixa livro/origem/UID/identidade nativa
do perfil; revalidação final impede mistura após edição/recriação/revogação.

Perfil usa projeção/validador M6 e limite de 256 KiB, maior que o máximo permitido
pelos campos atuais. Token/hash privados não são dados portáteis. Perfil ausente
ou inválido falha, sem omitir estilo ou copiar perfil de outra conta.

Texto não tem novo limite total. TextEncoder.encodeInto em buffers de 64 KiB
e roundtrip UTF-8 fatal/ignoreBOM preservam Unicode/BOM e rejeitam surrogate solto.
Primeira passagem computa SHA-256 incremental/totais sem bytes completos; segunda
emite partes da mesma string imutável. Cede execução periodicamente para abort.
Vazio emite uma parte vazia com hash correto. Não acumula lista de partes.

Cabeçalho book-draft (JSON por partes limitadas) declara schemaVersion 1 e state
none ou present; present contém metadata do capítulo, perfil necessário e
byteLength/chunkCount/contentHash. book-draft-text usa ID do capítulo e ordem.
Metadata limita-se ao mesmo orçamento por item M3b (8 MiB), não ao tamanho total
do rascunho. Índice none não equivale a contribuição vazia.

Gerador aguarda consumo; falha/abort/retorno antecipado não fornece prova final
nem selo. isCurrent/signal conferem sessão/contexto; host futuro deve associar
isCurrent ao UID/livro, sem invalidar a foto congelada por novas digitações.
Prova privada guarda origem/totais e identidade do perfil. Conferência final
reautoriza raiz e perfil após demais seções e antes do selo. Sem persistência local.

## Arquivos e sequência

1. bookBackupDraft(.mjs/.d.mts), bookBackupDraftRead servidor, dispatcher/check;
   reusar helper interno de identidade de persona M6, sem mudar suas garantias.
2. book-portability: bookDraftBackupRecords e adaptador callable; API pública
   type-only de Chapter e reuso de projeções puras/hash incremental existente.
3. Functions/Vitest: entrada ausente versus vazia, recurso removido sem lookup,
   congelamento anterior a next/await, texto grande/Unicode/fronteiras/hash,
   complemento/perfil/metadata, isolamento, alteração de perfil e cancelamento.
4. SDK real para autorização da leitura de perfil explícito, sem capítulo,
   edição/recriação e raiz; Chromium compõe M3b–M8 e prova rascunho vazio/removido
   e recusa de selo após mudança de perfil.
5. Checks dirigidos/build, revisão, docs/ADR/entrega/AGENTS e commit local.

## Limites e aceites

Nenhuma UI/arquivo persistente/restauração anunciada. Leitor semântico futuro
deve mostrar o rascunho separado e exigir decisão explícita ao restaurá-lo.
JSON v1–v6 permanecem intactos e com regressão. Sem escrita, coleção, Rules,
crédito ou dependência nova. Mídia, schema/leitor, sink/revisão e preparação/
ativação/cleanup/recuperação continuam em P1. Validate no fechamento do bloco;
sem CI/push/deploy. Nenhuma tarefa ampla adicional concluída.

## Resultado local

Implementado rascunho separado com snapshot síncrono, corpo incremental e perfil
declarado próprio reautorizado. Functions 15/15 incluindo M6; cliente 44/44
incluindo JSON v1–v6, 20 MiB/320 partes e abort; SDK quatro cenários; Chromium
17 cenários, 161 registros e rascunho de capítulo ausente com perfil exclusivo.
Build e checks dirigidos positivos. Veja [entrega M8](../../../entregas/2026-10-21-writer-v2-rascunho-explicito-no-backup.md)
e [ADR 0052](../../../decisions/0052-explicit-book-draft-backup.md).
Sem UI/sink/restauração anunciados; P1/F2-09 abertos, sem CI/push/deploy.

## Compatibilidade posterior

O [plano 141](141-ausencia-de-persona-no-rascunho-portatil.md) conserva ausência/
overrides antigos explicitamente marcados, sem lookup por coincidência nem
perda de texto. Sem marca, a exigência original de perfil real permanece.
