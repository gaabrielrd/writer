# ADR 0129 — Checkpoint protegido da criação de lore

- Data: 2026-10-24.
- Estado: armazenamento implementado/validado localmente; executor e host pendentes.
- Plano: [114 / M38c5p](../tasks/writer-v2/execucao/114-checkpoint-protegido-da-criacao-de-lore.md).

## Bundle privado e protocolo local

Capturar checkpoint do coordenador puro junto de páginas de até 50 controles.
Conferir IDs/intenção/hash encadeado e reconstruir o coordenador para validar
manifesta, progressos, cursores e wire original, sem enviar RPC de edição.
Input é congelado e vem da cópia protegida da preparação, pelo mesmo handle
de posse. A sessão Auth continua capturando UID/actor/host.

Acrescentar campo checkpoint opcional ao ticket v3 e seção checkpoint em
creationFrames. Tickets sem o campo continuam válidos; clientes que desconhecem
o campo fechado recusam o registro novo, preservando dados. Não mudar stores/
formatos nem allowlist do journal de edição; não há migração destrutiva.

Manter active/pending/garbage, outcome e receipt como metadata. Corpo privado,
incluindo bytes do pedido pendente, usa frames AES-GCM de 64 KiB e digest cifrado.
Conferir identidade/AAD/geração, prefixo, tamanho, UTF-8, SHA e schema completo.
Obter grant fresco antes e depois; header sozinho não prova integridade.
Retry idempotente também lê e valida a cifra antes de confirmar sucesso.

## Resultado e confirmação

Antes de chamar o servidor, o futuro executor precisa confirmar o checkpoint
com wire exato. Depois de uma resposta validada pelo core, pode registrar
outcome sem prosa/chave: baseGeneration/requestHash, checkpoint sem wires
pendentes e no máximo uma página de controles alterada. Schema é fechado.

Outcome não concede autorização, não é prova nativa de adoção e não substitui
a base privada. Sua recuperação exige base exata, wire/hash, contagem adjacente,
patch/hash de controles, validação pura e reautorização fresca. Não substituir
outcome divergente ou usar metadata para inventar corpo/rascunho.

Promover pending somente após ler/conferir a cópia completa. Active, remoção
de staging/outcome, ACK/receipt e pointer para antecessora trocam no mesmo
oncomplete. Falha preserva base/ponte/prefixo para nova instância; resposta sem
outcome ainda exige replay exato pela ação apropriada. Apply incerto permanece
dependente de confirmação explícita do executor.

Se surgir outcome enquanto a base é lida, recarregar metadata antes da
reconciliação. Não admitir outro resultado durante gravação concorrente.

## Coleta, cancelamento e descarte

Não iniciar outra geração enquanto houver garbage. Coletar até 50 frames por
lote, somente depois de ler a sucessora válida e fixar sua geração; deletes,
cursor e header compartilham transação. Frames extras/ausentes/inválidos abortam.
A transação de coleta confere stamp/conta/geração e não muda active ou draft.

Cancel impede novas gravações/coleta, conserva leitura privada autorizada e
continua independente da cifra. Release/discard permanecem no bootstrap.
Descarte fixa inventário de até três gerações de checkpoint junto da geração
do draft; após jobs/chave fechados, purga somente esses frames e mantém fence.
Cabeças/contadores e deletes são atômicos; nada de chave para limpar ciphertext.

## Fronteira e continuidade

A preparação oferece checkpointJournal, com write/read/recover/recordOutcome/
collect. É armazenamento, sem loop de produção ou UI. Staging completo pode
ser reaberto/promovido; incompleto sem outcome conserva active e dívida local.
O executor seguinte deve reconstruir o próximo pedido exato e confirmar a
gravação antes de enviá-lo, bloqueando novos produtores com dívida local.

Ainda compor advance/apply, cancel com adoção própria, encerramento explícito
da recuperação e host; confirmar o evento nativo antes de anunciar adoção só
por metadata local. Exclusão/lifecycle, consumidores/backup/rollout e validate
integral de P1 continuam pendentes. P1/F2-09/V2, fases 3–5 e gates humanos/
comerciais abertos; sem backend/Rules/dependências/env novos ou envio remoto.
