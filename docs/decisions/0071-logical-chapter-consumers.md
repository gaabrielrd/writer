# ADR 0071 — Consumidores do texto lógico de capítulo

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M27](../tasks/writer-v2/execucao/60-chat-e-conversao-com-texto-logico.md).

## Decisão

O aceite do chat legado lê o texto lógico antes do CAS e delega a
prepareLegacyChapterTextWrite. Usa operationId interno derivado dos IDs existentes
do chat, sem mudar payload público. Corpo, ponteiro, referências, contagem,
crédito, mensagem paga e recibo são confirmados juntos. Autorização e modo
continuam anteriores à confirmação histórica; capítulo em remoção é indisponível.
Provedor/modelo, primeira aplicação paga, BYOK e replay mantêm seus contratos.

getSceneGroup devolve prosa/hash lógicos para legado ativo e sourceVersion do
documento nativo observado. Detalhe de agrupador em remoção conserva metadados e
legacy null, permitindo retomada depois da liberação/coleta do corpo.

## Conversão e remoção

convertChapterToScenes lê o conteúdo completo, valida os envelopes existentes e
cria cena e fonte inline autossuficiente. Retira contentStorage da fonte copiada;
conserva o texto congelado no capítulo e limpa seu ponteiro externo. Libera só o
pin do capítulo no mesmo commit de cena/fonte/modo/ledger/recibo. Versões anteriores
continuam referenciadas. Após coleta dos bytes antigos, a fonte permanece íntegra.

deleteSceneGroups também é usado para capítulos legados em livros mistos. Libera
o pin durante a primeira revogação, uma única vez; retomada só limpa metadados e
cenas. Não apagar versões ou tentar reabrir um corpo já liberado nessa retomada.

Manter limites aprovados em F2-02/chat: até 800.000 bytes por cena/resultado e
envelopes nativos existentes. Excesso recusa a operação sem truncar, dividir
automaticamente ou cobrar. O legado completo permanece disponível. Isso não
reduz o limite do formato de backup nem amplia quotas de cena ou IA.

## Campo congelado de capítulo composto

A preparação P1 pode conservar o campo legado congelado em um corpo externo,
mesmo quando contentMode já é scenes. bookService resolve a composição canônica
pelas cenas e não baixa/usa o campo congelado como fallback. readBookBackupStructure
hidrata esse campo quando externo, preservando o item lógico e o formato do arquivo.
Um caso SDK usa essa representação válida de cópia composta sem afirmar ativação P1.

## Evidência e limites

143 Node e 144 Vitest distintos passaram em lotes dirigidos. Três SDK distintos
positivos, com repetição do caso afetado pelo campo congelado. Falha nativa por
parte ocupada manteve crédito/ledger/pins/recibo; replay concorrente cobrou uma vez.
Sugestões foram semeadas na fixture: não houve geração de IA paga nem teste BYOK
externo. Emulador não comprova wrapper Auth/App Check ou entrega Eventarc produtivos.

Faltam demais recursos/campos grandes, personas/mídia, autorização/ativação e
host/UI/roundtrip/validate integral. A ordem de implantação da ADR 0070 continua:
consumidores e exclusão compatíveis antes dos produtores, drenando binários antigos.
P1/F2-09 seguem abertos. Somente commit local; CI ignorada, sem deploy.
