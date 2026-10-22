# ADR 0056 — Revisão de backups de livro JSON v1–v6

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M12](../tasks/writer-v2/execucao/45-leitura-dos-backups-json-legados.md).

## Decisão

Ler writer-book-backup v1–v6 por ranges, sem JSON.parse do arquivo inteiro.
bookLegacyJSON valida gramática, UTF-8, duplicatas/chaves escapadas, profundidade,
BOM inicial e EOF, e calcula SHA-256 dos bytes originais. Arrays/projeto não têm
corte silencioso. Spans dos itens próprios ficam no índice protegido M11.

Ler até 8 MiB por item próprio e 64 KiB por range. Objetos têm até 64 campos/
chaves de até 256 bytes e profundidade 24, acima dos schemas conhecidos.
Strings globais ignoradas são percorridas no buffer, sem materialização de valor.
Arquivo/Blob do host deve ser imutável; fingerprint não autentica quem o criou.

bookLegacyCatalog fecha campos/capacidades de cada versão e oferece leitura
limitada por span. bookLegacyReview valida/normaliza apenas os dados disponíveis.
Não buscar URL de capa nem copiar seu token/path. Metadata/lore global inline
ficam excluídos; conservar somente candidato de universo por ID, com encarnação
not-recorded. Isso não afirma acesso ou revogação atual. Servidor futuro deve
reautorizar o ID mostrado e avisar a ausência de prova histórica, conforme P1.

## Procedência e perdas conhecidas

Relatório tem validation legacy-content-only, diferente de content-only do
formato novo. Registra versão, tamanho/fingerprint, candidato de universo,
histórico/progresso não registrados, draft não separável e situação da capa.
Não emitir contêiner/selo M2 fictício. Placeholders internos usados na validação
comum não constituem captura completa de histórico vazio ou prova de ausência.

Texto do capítulo pode ter incorporado draft vazio/removido; manter os bytes
lógicos disponíveis sem declarar qual edição era salva. Capítulo por cenas
também contém composição renderizada: conservar esse artefato separadamente
das cenas canônicas e da fonte de conversão, sem fallback automático.

v5/v6 guardam rank ativo, não os dois buffers. Reconstruir ambos a partir do rank
disponível para conferir ordem e marcar isso como derivado. Não inventar datas
de conversão ausentes no SceneSource antigo. Nomes/available/category resolvidos
de referências são descartados com aviso; identidade/procedência permanecem.

Exportador antigo coleta personas do livro/capítulos e pode não incluir a usada
somente numa fonte de conversão. Via legada aceita vínculo sem perfil e override
antigo indisponível como avisos, sem criar perfil/atributo. IDs ausentes devem
ser remapeados para identidade neutra na restauração, sem coincidência com a
biblioteca atual. Perfis não usados são contabilizados e não importados.
Validação do arquivo novo continua estrita para esses casos.

## Fronteiras e operação

Validador comum é interno e recebe a procedência específica; a entrada de arquivo
novo mantém framing/EOF e perfil completos obrigatórios. runBookValidation
centraliza hash e cleanup do índice para as duas inspeções, congela sinal antes
de await, preserva erros de cleanup e rejeita relatório após cancelamento.

Sem interface final, escrita no livro, API remota, Rule, coleção, crédito ou
dependência nova. Servidor de restauração precisa verificar conteúdo/autorização
novamente, remapear, preparar filhos invisíveis e ativar cópia privada atomicamente.
Flags do arquivo não publicam dados ou concedem acesso. Recuperação e coleta
de ciphertext órfão após crash continuam para o host posterior.

[Evidência M12](../entregas/2026-10-22-writer-v2-leitura-dos-backups-legados.md)
separa arquivos do exportador com APIs simuladas, parser/índice reais e limites.
Validate completo no fechamento P1; somente commits locais, sem CI/push.
