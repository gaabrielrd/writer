# ADR 0191 — transporte privado de restauração de aventuras

Data: 2026-10-27. Estado: aceito para implementação interna local.
[Plano 169](../tasks/writer-v2/execucao/169-transporte-privado-da-restauracao-de-aventuras.md).

## Raiz e identidade

Reservar job, reserva global, raiz mínima e recibo inicial na mesma transação.
TargetId tem domínio próprio e tamanho aceito pelos criadores nativos. JobToken
depende do nascimento nativo da instância, UID e fingerprint do início.

A raiz mínima usa restoreOwnerId, sem ownerId/title/status/prosa. Studio/SDK e
leitores normais exigem ownerId; essa raiz não aparece nem permite edição/captura.
Existência bloqueia createAdventure e criação por importação. Assim o nascimento
da raiz antecede versões históricas futuras sem disponibilizar cópia incompleta.

Raiz, reserva e início têm nascimento comum; reserva/recibos são imutáveis.
O job atual precisa do recibo exato de lastOperationId/checkpoint, hash integral
do registro e updateTime compatível com o nascimento do recibo. Um recibo antigo
válido confirma somente sua operação, nunca o estado atual. Ler metadata da raiz
antes de qualquer leitura integral; recusar origem recriada/estranha.

## Bytes e cancelamento

Chunks de 64 KiB têm índice/checkpoint, base64 canônico, SHA e cadeia do domínio,
com artefato e recibo no mesmo commit. Verificação independente relê até 16 chunks
por chamada, em ordem completa de IDs, calcula SHA integral retomável e fixa
provas na identidade nativa dos chunks. bytes-verified não é conteúdo aprovado.

Estados SHA privados são imutáveis por operação; artefatos ligam contexto,
nascimento e digest ao recibo criador. Podem conter uma cauda limitada dos bytes
processados. Não expor estado interno em views/recibos de UI nem tratar base64
como proteção. Metadata é projeção fechada; SDK não lê/escreve jobs ou filhos.

Resolver de início desconhecido cria fence e marcador mínimo aposentado quando
o início ainda não venceu. Cancelar job invalida novos passos; limpeza limitada
até 50 registros por chamada confere contexto/recibo/birth/hash antes de remover.
Recusa órfãos, faltas e conteúdo inesperado, inclusive reaparecimento antes do
cursor. Só fecha depois de reconferir todos os namespaces e ausência de autoria.

Aposentadoria conserva raiz mínima e reserva permanentes, sem dono humano ou
prosa. Preserva nascimento e impede reuso do ID. Não excluir esse marcador por
TTL sem outra proteção equivalente nos criadores. Operações/metadados ficam como
fences; arquivo, provas e estados sensíveis são removidos.

## Validação e continuidade

22 Node distintos e seis SDK distintos positivos em seleções, com emulador demo
local. A revisão reproduziu checkpoint adulterado aceito por recibo histórico;
vínculo exato foi corrigido e validado no Node/SDK, preservando replay histórico.
Lotes reais de 16 e páginas de 50 exercitados com arquivo de 54 chunks.
Detalhes e falhas iniciais ficam na evidência.

Serviço permanece interno, sem endpoint/UI/index exportado. Recuperação cifrada
do dispositivo, fonte imutável para validação persistente, gates semânticos,
remap/mídia, ativação e roundtrip ainda faltam. Atualizar schemas e cleanup ao
adicionar namespaces/estágios; não adotar prefixo parcial como prova global.
P2/P3/D/F2-09, gates e contagem 8/35 permanecem abertos.
