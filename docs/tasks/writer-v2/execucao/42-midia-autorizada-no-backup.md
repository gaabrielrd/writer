# F2-09 P1 M9 — Bytes autorizados da capa

Contrato em 2026-10-21 sobre 78ca367. P1/F2-09 abertos.
Grafo consultado primeiro; índice antigo incompleto, fontes atuais conferidas.

## Inventário e objetivo

Book possui coverImageId/coverUrl. RichEditor usa prosa sem extensão de imagem;
sanitizeRichText não preserva imagens remotas. Lore próprio/cenas de livro não
têm ilustrações gerenciadas. Ilustrações de blocos pertencem à aventura/P2.
P1 captura portanto a capa gerenciada atual, sem inferir ativos de URLs na prosa.

Geração normaliza para PNG 1200x1800 e usa book-covers/UID/imageId.png. Biblioteca
ativa mantém contador/uses por livro. Storage aceita leitura própria somente com
metadata accepted true; escrita é de servidor. Não modificar esses contratos.

## Captura e autorização

Três leituras: getBookBackupCover, readBookBackupCoverChunk e verifyBookBackupCover.
Input somente bookId/sourceToken/coverToken/índice; nenhum path/URL/imageId
arbitrário. Livro próprio ativo, coverImageId válido, biblioteca ativa própria,
useCount positivo, uso com bookId correto e path canônico precisam concordar.

Descriptor portátil none, legacy-unavailable ou library. Somente coverUrl sem ID
produz marcador de ausência de bytes, sem URL/fetch. Referência de biblioteca
quebrada falha, sem omissão silenciosa. Metadados portáteis próprios: imageId,
nome/datas presentes, image/png, bytes, partes e SHA-256. Caminho, geração,
tokens/download URLs e contadores nunca entram no arquivo.

Autorizar Firestore antes/depois de cada I/O Storage. Token privado fixa origem
M3b, biblioteca/uso nativos e generation/metageneration/size/type/accepted do
objeto. Recriação, desvinculação, exclusão, troca de bytes ou metadata invalidam,
inclusive ABA accepted false/true por metageneration. Somente PNG aceito,
tamanho positivo até 16 MiB (orçamento já usado para mídia capturada e suficiente
para capas normalizadas atuais). Não é limite total do livro.

Fonte calcula hash integral em stream da geração fixada, sem buffer de imagem
inteira. Adotar adaptador próprio via bucket fornecido pelo servidor: HEAD
projetado, stream com CRC32C e SHA-256, range inclusivo de até 64 KiB. SDK instalado
confirma CreateReadStreamOptions start/end/decompress; ranges não têm validação
integral. Adaptador limita bytes e destrói streams em falha; não usar download
irrestrito. Ler pixels fora de transação mutável e reautorizar antes da resposta.

Cada parte fixa geração e confere HEAD/DB depois do I/O. Hash por parte e hash
integral cliente detectam corrupção. Verificação final é somente metadata/DB,
sem baixar imagem inteira novamente. Cabeçalhos HTTP private,no-store nos métodos.

## Cliente e composição

bookCoverBackupRecords usa origem M3b e retorna prova somente ao esgotar fluxo.
Emite manifesto book-cover e partes book-cover-bytes com ID da imagem; 64 KiB,
hash incremental e pressão do consumidor, sem arrays/projeto inteiro.
Verificar conteúdo exato e assinatura PNG; reautorizar ao fim e novamente após
demais seções/antes do selo M2. Abort/contexto/troca/erro/retorno antecipado deixam
captura provisória sem selo. Não consultar Storage diretamente no cliente.

## Sequência e arquivos

1. bookBackupCover(.mjs/.d.mts) puro; bookBackupAssetStorage adaptador e testes de
   streams/ranges; bookBackupCoverRead serviço, dispatcher/check e headers.
2. Functions com biblioteca/uses e Storage injetado: todos os estados, path próprio,
   fronteiras/hash, troca de geração/meta/permissão antes/depois de I/O, falhas,
   oversize, assinatura e corrupção. Sem writes/pins/recibos novos.
3. Cliente/adaptador/API pública e testes de partes/hash/abort e ausência explícita.
4. SDK Firestore com writers reais de biblioteca/vínculo; verificar também I/O do
   SDK Storage em emulador local quando disponível, sem alegar produção.
5. Chromium compõe M3b–M9, vetor PNG independente e falha sem selo por mutação.
6. Checks dirigidos/build, revisão, ADR/docs/entrega/AGENTS e commit local.

## Limites

Não migra capa legada por URL, não importa mídia/restaura imagem e não cria pins.
Uso ativo já impede exclusão normal; troca de capa invalida sourceToken, sem
segurar exportações abandonadas no servidor. Manutenção Admin respeita versão/
propriedade/contador. Schema integral/leitor legado, sink persistente, revisão,
preparação/remapeamento/ativação/cleanup/recuperação continuam em P1.
Sem dependências/Rules/permissões/créditos novos. Validate ao fechar P1; sem CI,
push, PR ou deploy. Não fecha tarefa ampla nem promete UI.

## Resultado local

Implementados contrato, adaptador Storage, três leituras autorizadas e produtor
cliente. Functions 12/12; cliente 17/17 incluindo 16 MiB/256 partes; SDK real
Firestore+Storage cinco casos, repetidos pelo novo test:media com saída 0.
Chromium compõe 168 registros em 20 cenários e decodifica PNG com hash independente.
Build e checks dirigidos positivos; [entrega M9](../../../entregas/2026-10-21-writer-v2-bytes-da-capa-no-backup.md)
e [ADR 0053](../../../decisions/0053-book-cover-bytes.md) registram avisos reais
de listeners SDK e EOF do runtime Java. Sem supressão ou prova de produção.
Sem schema integral/UI/sink/restauração anunciados; P1/F2-09 abertos, sem CI/push.
