# ADR 0052 — Rascunho explícito e estilo declarado no backup

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contrato:** [M8](../tasks/writer-v2/execucao/41-rascunho-explicito-no-backup.md).

## Decisão

bookDraftBackupRecords congela metadados conhecidos e string de prosa local
sincronicamente, antes do primeiro next/await. É contribuição explícita separada
da captura salva; inclui vazio e capítulo removido sem consultar sua existência.
Não força autosave, histórico ou recriação do capítulo. Recusa composição scenes.

Preservar título, ordem, actId, complemento e datas fornecidas; omitir opcionais
undefined sem inventar datas/contagens. Projeção pura M3b retira campos extras.
Metadata usa limite por item de 8 MiB e quadros de 64 KiB; não é limite do texto.

Texto fica na string já existente no editor. TextEncoder.encodeInto limita
buffers a 64 KiB; roundtrip fatal/ignoreBOM rejeita surrogate solto e preserva BOM.
Primeira passagem computa hash incremental/totais, com cessão periódica para
abort; segunda emite bytes da mesma string imutável. Sem array de partes nem
codificação integral do corpo. SHA-256 reutiliza @noble/hashes existente.

## Perfil declarado e acesso

Um capítulo removido pode ser o único vínculo de uma persona. getBookBackupDraftPersona
autoriza livro/origem M3b e resolve ID declarado somente na conta autenticada ou
catálogo puro de presets. É contribuição local declarada, distinta da seleção
salva M6; não exige capítulo atual nem aceita ownerId/caminho arbitrários.
Leitura própria por ID não concede permissões sobre perfis alheios.

Reusar identidade/projeção/validador M6; perfis arquivados continuam portáveis.
Resposta tem limite de 256 KiB, acima do máximo dos campos atuais, sem truncar.
Token fixa origem/UID/perfil nativo; hash confere a projeção exata. Não copiar
credenciais, BYOK, campos extras ou biblioteca inteira. Ausência/inconsistência
falha, sem perder silenciosamente estilo.

## Registros e conferência

book-draft distingue state none e present; present guarda metadata, perfil
necessário e manifesto de texto. book-draft-text usa ID do capítulo/parte;
vazio presente tem uma parte vazia e hash SHA-256 correto. None não tem corpo.
Prova privada só aparece ao esgotar o gerador; retorno antecipado/abort não
confere sucesso. verifyBookBackupDraft reautoriza raiz/perfil antes do selo M2.

Host futuro deve ligar isCurrent ao UID/livro/contexto da captura; nova digitação
não muda a foto congelada. Não persistir rascunho por este serviço. Restaurador
futuro mostrará contribuição separada e exigirá decisão explícita, sem restaurar
capítulo removido automaticamente. Nenhuma dessas interfaces de UI está entregue.

Sem escrita, Rules, coleção, crédito ou dependência nova. A
[entrega M8](../entregas/2026-10-21-writer-v2-rascunho-explicito-no-backup.md)
distingue produtor limitado e prova de bytes das fixtures/UI/sink/restauração.
P1/F2-09 continuam abertos, somente commits locais e sem CI/push.

## Compatibilidade posterior

A [ADR 0164](0164-explicit-draft-persona-absence.md) estende somente contribuições
com personaAvailability explícita: ausência guarda persona null sem lookup;
overrides antigos mantêm perfil real revalidado. Sem marca, a recusa M8 permanece.
