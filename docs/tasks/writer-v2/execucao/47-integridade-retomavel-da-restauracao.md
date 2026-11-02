# F2-09 P1 M14 — Integridade retomável dos bytes recebidos

Contrato em 2026-10-22 sobre 3c29d62. Executar sequencialmente, somente local,
sem CI/subagentes. M13 foi progresso verificado: commit e 26 testes dirigidos.
P1/F2-09 e a V2 integral permanecem abertos.

## Objetivo e sequência

Conferir no servidor que todos os bytes recebidos correspondem ao SHA-256 e à
chain declarados pela transferência, antes de validar formato/conteúdo.
A sequência completa permanece: revisão protegida, reserva/upload, integridade,
validação semântica servidor, remapeamento/materialização/mídia, autorização
atual de universo e ativação atômica, recuperação/cleanup/UI/roundtrip.

Este marco acrescenta integridade limitada por chamada e porta interna de leitura
com provas nativas. bytes-verified não é ready, validado semanticamente ou ativado.
Nenhuma raiz/filho de books será criado.

## Descoberta e dependência

Grafo writer-v2 consultado primeiro para os novos contratos, sem resultados;
fontes M13/M11/M12 conferidas diretamente. Validadores puros já recebem byte
source e índice; não carregar arquivo completo nem usar relatório do cliente
como autorização.

Node crypto não oferece persistência pública do contexto de SHA-256 entre
invocações. hash-wasm 4.12.0 fornece save/load e não tem dependências de runtime;
fixar versão somente em functions. Fonte primária consultada:
[README hash-wasm](https://github.com/Daninet/hash-wasm#resumable-hashing).
Snapshot de hash pode conter bytes da entrada: nunca é metadata pública/recibo.
Qualquer mudança de versão exige teste de compatibilidade ou recusa explícita;
nunca reiniciar silenciosamente um checkpoint existente.

## Protocolo

advanceBookRestoreIntegrity recebe restoreId, jobToken, operationId,
expectedCheckpoint e limit inteiro entre 1 e 16 partes (máximo 1 MiB por chamada).
Reautorizar job/reserva/marcador/raiz ausente, replay e CAS antes dos corpos.
Somente uploaded/checking. Primeiro passo promove cleanupVersion 1 para 2.

Ler cada chunk contíguo, conferir schema/contexto/ID/índice/tamanho/base64/hash.
Atualizar SHA-256 serializável e chain sem reler partes anteriores. Cada parte
ganha prova server-only com createTime/updateTime nativos, tamanho e hash.
Criação da prova, snapshot privado do SHA, contadores do job e recibo são atômicos.

Ao final, exigir bytes/quantidade e chain iguais aos da transferência e digest
igual ao SHA completo inicial. Sucesso muda para bytes-verified. Digest/chain
incompatíveis produzem rejected com razão segura e recibo; conteúdo de parte
corrompido falha sem avançar checkpoint. Não traduzir erro temporário em rejeição
definitiva. Estado SHA incompatível/ausente/alterado falha fechado.

Recebido da library: estado SHA é entrada sensível. Guardar em
bookRestores/ID/integrityState/current, com contexto/checkpoint/contadores/chain
e hash de controle ligado ao job, nunca em progress/list/recibo. Remover esse
snapshot no fim bem-sucedido ou rejeitado. Job só guarda hashes e contadores.

## Leitura interna e coleta

Porta de bytes para o próximo validador não é endpoint de download. Cada range
limitado a metadata+payload do contêiner (272 KiB) reautoriza o job bytes-verified
e confere cada chunk e sua prova nativa na
mesma transação; mudança/ABA/contexto de uma parte invalida a leitura. Não usar
prova de outra restauração ou fallback de metadata. Exigir token/prova no consumo.
Fonte não significa autorização de universo nem prova semântica.

Inventário cleanup v2: chunks, integrityProofs, integrityState/current e chave.
Manter compatibilidade com v1. Fases limitadas: até 50 partes/provas por passo,
certificar EOF e limpar estado/chave antes de cancelled. Preservar metadados
permanentes e todo livro, inclusive quando surgir raiz inesperada.
Cancelamento aceita uploaded/checking/bytes-verified/rejected além de uploading.

Antes de futuros índices/DTOs/mídia: ampliar inventário novamente e certificar
ausência de filhos alheios; nunca adotar/apagar órfãos por prefixo.

## Arquivos e testes

Functions: contratos/upload, novo integrity/read helper, composição/check.
Rules existentes de bookRestores recursivo já negam os novos filhos; provar
SDK para donos/outros/anônimo. Adicionar dependência fixada e lock somente de
Functions; nenhuma biblioteca no bundle cliente.

Testes Node: vetores SHA independentes, retomada em nova instância, reenvio/CAS,
concorrência/cancelamento, hash/chain/estado/chunk inválido, native ABA no reader,
limites, nenhuma exposição de bytes/snapshot e cleanup v1/v2.
SDK real no emulador: progresso/retry/provas nativas, SDK deny, cancelamento e
limpeza integral sem alterar outros projetos. Regressão dirigida de M13 e HTTP.
Typecheck/lint/formato/check/docs/arquitetura/build conforme impacto.
Validate integral no fechamento P1, sem alterar cobertura ou acionar CI.

## Resultado local

Implementados avanço/SHA/provas, leitor interno, integração e cleanup v2.
Quatorze Node novos e cinco cenários SDK novos positivos, além das regressões
M13/HTTP. [Evidência](../../../entregas/2026-10-22-writer-v2-integridade-dos-backups.md).

Na integração, o teto do range passou de 64 para 272 KiB porque o decoder pede
metadata+payload juntos. Limites de payload e partes permanecem; teste real de
framing e SDK conferem a correção. Bytes-verified não substitui o validador
semântico. Índices normalizados/recursos/mídia exigem próximo inventário antes
dos writers; nenhuma raiz/filho de books foi criado. P1/F2-09 continuam abertos.
