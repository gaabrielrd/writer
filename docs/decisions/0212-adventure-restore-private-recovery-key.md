# ADR 0212 — Chave privada da retomada de aventuras

- Data: 2026-10-28.
- Estado: implementado; validação dirigida registrada na evidência.
- Plano: [190](../tasks/writer-v2/execucao/190-chave-privada-da-restauracao-de-aventuras.md).
- Antecedentes: [0210](0210-adventure-activated-source-collection.md) e
  [0211](0211-adventure-restore-callable-boundary.md).

## Decisão

Criar chave AES-GCM de 32 bytes e keyId aleatório em
users/UID/adventureRestoreRecoveryKeys/restoreId, atomicamente com o início.
A chave pertence ao mesmo nascimento nativo do job/reserva/recibo. O efeito
recovery-key do recibo inicial fixa os metadados, incluindo fingerprint SHA-256
do segredo, revisão, aventura, proprietário e fingerprint do início.
Exigir imutabilidade/nascimento e formato fechado; a recuperação também
valida os bytes contra esse fingerprint. Não usar datas lógicas como prova.

Recuperar por getAdventureRestoreRecoveryKey, export HTTPS separado da lista
de 29 callables. POST text/plain;charset=utf-8, JSON fechado, até 8192 bytes,
UTF-8 estrito. Auth e App Check precedem análise do corpo; token do job,
revisão e eventual expectedKeyId precisam corresponder. Respostas têm
private, no-store e Vary Authorization; erros não refletem corpo, stack,
credenciais ou segredo. Região us-central1, 512MiB, maxInstances 5,
timeout 120 s, cors false, sem segredo de IA ou bypass em runtime.

Somente esse protocolo privado retorna keyBase64. Job/progresso/recibo público
e callables não carregam a chave nem seu identificador. Não há criação tardia,
rotação automática ou substituição de chave perdida. Jobs legados sem efeito
de nascimento continuam utilizáveis, mas a recuperação devolve indisponível;
documento estranho em seu caminho impede adoção/remoção.

## Encerramento

Cancelar remove chave junto da mudança para cancelling. Repetição com mesmo
pedido usa recibo; outro cancelamento no checkpoint atual exige ausência da chave.
Coleta após mídia concluída remove chave junto da primeira unidade/controle.
Recuperação lê esse controle e recusa coleta já iniciada. Transações concorrentes
conflitam sobre os mesmos documentos; replay nunca recria chave ou job.

Remoção usa máscaras não vazias de metadados, prova nativa imutável e o efeito
do início, sem hidratar keyBase64. Recusar port sem getAll. A limpeza final
confirma ausência canônica por máscara restoreId; a coleta mantém também sua
busca de chaves pendentes. Isso preserva a regra de não ler material secreto
para descartar a fonte. Job ativado, recursos autorais e cópia cifrada local
não são modificados. Chave já obtida em memória não pode ser revogada remotamente.

## Validação e limites

Testes cobrem AES-GCM utilizável, retry, UID/token/revisão/keyId, corpo fechado,
documento ausente/alterado/recriado, legado, rollback, metadados sem leitura do
segredo, cancelamento repetido, coleta e replay. Host HTTP exercita Auth/App
Check, UTF-8/tamanho, headers e erros sanitizados. O SDK demo usa export HTTP
real e Rules reais, com verificadores sintéticos somente no teste.
Não comprova credenciais, IAM, atestação ou disponibilidade de produção.

Resultados e limitações na
[evidência](../entregas/2026-10-28-writer-v2-chave-privada-da-restauracao-de-aventuras.md).
Cliente/journal cifrado/controlador/UI/roundtrip, P2/P3/D/F2-09 e macro 8/35
continuam abertos. Sem dependência, índice, Rules, CI, push, merge ou deploy.
Validate integral no próximo grande bloco, conforme orientação do operador.
