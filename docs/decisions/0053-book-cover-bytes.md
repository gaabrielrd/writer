# ADR 0053 — Bytes autorizados da capa no backup

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contrato:** [M9](../tasks/writer-v2/execucao/42-midia-autorizada-no-backup.md).

## Decisão

O inventário atual de livros tem mídia gerenciada na capa. RichEditor/lore/cenas
de livro não mantêm ilustrações próprias; imagens de blocos pertencem a aventuras.
Não inferir ativos ou buscar URLs a partir da prosa. Capa com apenas URL produz
legacy-unavailable sem copiar URL; biblioteca vinculada inconsistente falha.

getBookBackupCover/readBookBackupCoverChunk/verifyBookBackupCover recebem
livro/origem/token/índice, nunca caminho ou imageId arbitrários. Reautorizar livro
próprio, biblioteca ativa/contador/uso próprio e caminho canônico antes/depois
de cada I/O Storage. Token privado fixa identidades nativas Firestore e
generation/metageneration/size/type/accepted do objeto. Versão de metadata
impede ABA de accepted. Cabeçalhos HTTP private,no-store.

Somente PNG aceito até 16 MiB, orçamento já usado pela mídia capturada e maior
que capas normalizadas atuais. Não é limite do projeto. Preservar metadados próprios
presentes, bytes/hash e tipo; não copiar URL, path, versões Storage, tokens,
contadores ou grants. Uso ativo existente impede exclusão normal; troca de capa
invalida raiz, sem pins/jobs de exportação abandonada.

## I/O e produtor

Adaptador próprio recebe bucket do servidor. HEAD projeta somente campos
necessários; hash integral usa createReadStream da geração fixada com CRC32C
e SHA-256, sem acumular corpo. Range inclusivo tem até 64 KiB e limite de
acumulação; desativar descompressão e destruir stream ao terminar/falhar.
SDK instalado documenta que ranges não têm verificação integral; cliente
confere hash por parte e SHA-256 integral contra o primeiro stream autorizado.

bookCoverBackupRecords emite manifesto book-cover e book-cover-bytes, aguarda
consumo e retorna prova somente ao esgotar. Verificar ao fim e após demais seções,
antes do selo M2. Orquestrador deve exigir prova retornada; framing sozinho não
certifica completude semântica. Erro/abort/retorno interrompido permanecem provisórios.

## Testes e operação

test:media usa Firebase CLI já instalado, emulators:exec público e portas
loopback/configuração temporária próprias para Firestore+Storage. Nenhuma nova
dependência do projeto. WRITER_FIREBASE_CLI permite indicar a entrada JS do CLI.
Suite fica em tests/storage, separada da descoberta Firestore-only de test:rules;
não adicionar skips que ocultem ausência de Storage nesse runner.

A [entrega M9](../entregas/2026-10-21-writer-v2-bytes-da-capa-no-backup.md)
registra SDK/Rules de Storage reais e Chromium decodificando PNG, além dos
avisos observados em teeny-request e no encerramento do runtime Java.
Não suprimir avisos ou afirmar prova de produção/ausência de vazamento.
Schema/leitor, arquivo persistente, revisão e restauração ainda estão em P1.
Sem Rules, permissões, créditos ou dependências novas; somente local, sem CI/push.
