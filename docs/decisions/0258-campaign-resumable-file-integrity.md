# ADR 0258 — Integridade de campanha com checkpoint cifrado

- Data: 2026-10-29.
- Estado: aceita para o núcleo interno pré-ativação.
- Continuação: [ADR 0257](0257-campaign-private-resumable-upload.md).
- Plano: [228](../tasks/writer-v2/execucao/228-integridade-de-campanhas-com-checkpoint.md).

## Problema e decisão

O arquivo persistido já permite leitura limitada. A revisão completa anterior,
porém, percorria todo o arquivo em cada chamada; seus callbacks e índices
temporários não constituem revisão retomável. Primeiro persistimos a etapa de
integridade/assinatura. Semântica própria/derivada e autorização atual das
origens continuam necessárias antes de materialização/ativação.

campaignBackupFileScanner passa a ser a única máquina de gramática usada por
validateCampaignBackupFile e pelo coordenador retomável. next lê um frame e
verifica encadeamento, identidade, tamanho, unidades, conteúdo, testemunhas e
raízes. O selo exige EOF exato e assinatura/conta/chave atuais. Conteúdos 1/2/3
e testemunhas 1/2 preservam seus contratos. O modo completo conserva callbacks;
o modo retomável os recusa para não confundir staging provisório com grant.

## Checkpoint e limites

Somente o servidor produz o estado. Cursor, contadores, cabeçalho, pacote de
assinatura e estados SHA ficam no checkpoint com schema 1 e codec fixado
sha256/hash-wasm@4.12.0. O estado de um conteúdo em andamento guarda descriptor,
contadores e hash incremental, sem acumular suas partes. Não serializa
TextDecoder: o modo retomável de integridade não executa callbacks semânticos; a validação
de fronteira UTF-8 nativa 2/3 continua na gramática compartilhada. O revisor
semântico completo conserva seu decoder e coleta JSON limitada.

Checkpoint é host-trusted, não uma entrada de cliente. Sua forma é fechada,
vinculada à conta/tamanho e recusada quando inválida; erro não reinicia em zero.
Os bytes de estado SHA também são sensíveis e ficam cifrados. Um estado
serializado tem limite de 64 KiB, independente do tamanho total da obra.

## Persistência e protocolo

fileReview é campo opcional do job existente; ausente continua válido para
jobs antigos. Guarda metadata limitada e payload AES-GCM com AAD de domínio,
conta, jobToken nativo, identidade e checkpoint CAS. Não há coleção adicional
nem produtor de índice sem coletor. A cadeia nativa job/recibo/testemunha e
hash canônico também vinculam a revisão. Progresso contém somente contadores/
estado; recibo contém apenas efeito mínimo e hash do job, nunca checkpoint/
assinatura/ciphertext ou prosa.

advanceCampaignRestoreFileReview recebe apenas identidade, operação, CAS e
limit de 1–25 frames. Retoma no offset autenticado e não relê o prefixo. Cálculo
ocorre fora da transação de gravação; cada leitura de fonte reconfere barreira,
job, chave e chunks. A transação final reconfere encarnação, CAS e job original
antes de gravar checkpoint/recibo. Concorrência ou cancelamento vence resultado
tardio. Retry confirma recibo original e progresso atual.

getCampaignRestoreFileIntegrity é porta interna: exige etapa concluída e
reconfere a chave de assinatura atual a partir do checkpoint, sem reler arquivo.
Retorna campaign-file-integrity-only; não é revisão semântica, disponibilidade
atual dos chunks, autorização das fontes nem grant. Consumidores posteriores
continuarão lendo a fonte autenticada e revalidando acesso às origens.

## Cancelamento e compatibilidade

Cancel limpa fileReview e remove a chave atomicamente, sem decifrar o estado nem ler
payload de chunks. A leitura do job inclui ciphertext para conferir recibos.
A coleta pré-ativação v1 continua retirando chunks; não houve nova família
física, portanto não inserimos fases em versão antiga. Recibos/testemunhas
mínimos preservam história. Marcador continua sem ownerId, invisível no Estúdio.
C4 1–4, Rules e entradas públicas permanecem. Antes de campanha ativa, integrar
os jobs ao C4 apropriado e provar coleta, como exige ADR 0257.

## Consequências

Há revisão persistida da integridade, com pausa/retomada entre chamadas e
reinícios. Ainda não há índices semânticos duráveis, revisão final de origens,
remapeamento, materialização, mídia, ativação ou UI. Próxima etapa precisa de
índice autenticado e cancelamento/coleta antes do primeiro produtor, com
checkpoints limitados; repetir o revisor inteiro não comprova retomada.
