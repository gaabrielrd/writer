# P3 — Revisão semântica própria com índice persistido

- Data: 2026-10-29.
- Base: c56c720; integridade retomável do plano 228 validada.
- Estado: núcleo implementado e validado por testes dirigidos/SDK, sem campanha ativa/endpoint público.

## Objetivo, requisitos e limites

Persistir índice privado autenticado e conferir os vínculos próprios da campanha
em chamadas limitadas. Não repetir o revisor inteiro em uma chamada nem diminuir
o suporte dos DTOs de 4 MiB. Reutilizar os checks de metadata, envelope e vínculos
do revisor próprio existente, com prova final equivalente ao arquivo real.

Primeiro preparar inventário/coleta da nova família reviewRows, depois produtor.
Cada linha tem ordinal contíguo, chave lógica em hash, metadata limitada,
ciphertext AES-GCM e prova nativa vinculada ao recibo/testemunha que a criou.
Lookup por hash usa query limitada a dois resultados e recusa duplicatas; consulta
de página/cleanup usa IDs ordinais, incluindo órfãos/estrangeiros sem index.
Não colocar nome, prosa ou descriptor de origem nos caminhos/recibos.

## Solução e módulos

campaignBackupOwnChecks extrai regras compartilhadas do revisor temporário.
campaignRestoreReviewIndex guarda linhas do estágio own, metadata/identidade
nativa e cifra; não expõe um produtor de linhas arbitrárias ao cliente.
campaignRestoreOwnReview indexa o arquivo autenticado por frames e depois
confere até 25 linhas por chamada, com lookup dos vínculos no índice selado.
OwnReview cifrado fica no job; reviewIndex guarda contadores de produção/coleta.
Jobs antigos sem ambos continuam válidos. FileReview concluído é preservado
com seu checkpoint original, menor ou igual ao checkpoint global.

Indexação avança até 25 frames; ao concluir um DTO próprio, lê aquele único DTO
a partir de seu cursor em até 64 blocos/4 MiB para o parser existente. Não guarda
corpo no checkpoint nem faz coleta do arquivo inteiro. Esse custo adicional
limitado é explícito; não declarar teto de 25 leituras para esta fase.
Derivados são percorridos como frames sem acumular partes. Fim exige mesmo selo/
EOF da prova integral. Ordem/família/ID e universo organizacional mantêm contrato.

## Cancelamento antes do produtor

Cancel limpa estados cifrados e revoga a chave atomicamente. Contadores de índice
permanecem para coleta limitada por metadata antes de chunks; linhas devem ser
imutáveis, da mesma encarnação e nascidas com recibo que prova seu metadata hash.
Remover até 25 linhas por passo, preservar estranhos e falhar sem avanço. Mesmo
após coletar todas as linhas, confirmar ausência antes de coletar chunks/finalizar.
Recibos mínimos não retêm ciphertext/prosa. Temporário pré-ativação continua
separado do C4; integrar nova família ao C4 antes de ativar campanha, sem mudar os layouts 1–4.

## Sequência e aceite

1. Compartilhar checks próprios, preservando os revisores existentes.
2. Contratos/índice e coleta antes do primeiro produtor de linhas.
3. Indexação e conferência retomáveis com CAS, recibos, chave e barreira C4.
4. Prova interna própria comparável à revisão real completa; revalidar assinatura
   atual sem conceder origem, derivado ou ativação.
5. Testes: arquivo real rico, retomada, DTO acima de 64 KiB, vínculos inválidos,
   limite/paginação, corrupção/recriação/duplicatas, concorrência/rollback/cancel
   e SDK Firestore. Rodar checks dirigidos, revisar e registrar commit local.

## Riscos, não escopo e próximos gates

Queries de igualdade em identityHash usam índice automático de campo único;
nenhum composto novo. Autenticar linhas antes de qualquer lookup dependente.
Um índice provisório não é grant. Ao cancelar, ler somente metadata das linhas,
sem chave/corpos. Coleta é necessária mesmo no meio da indexação.
Semântica derivada e origens persistidas, remapeamento/materialização/mídia,
C4 dos jobs antes da ativação, UI e ciclos continuam necessários. Macro8/35 e
P3/D/F2-09 abertos. Sem agentes/CI/push/PR/merge/deploy. Fullvalidate no fechamento
do bloco persistente; preservar servidor manual e master.

## Resultado local

Núcleo descrito implementado e validado: 271 testes dirigidos (21 novos) e
cinco SDK/Rules positivos, com jornada real ampliada de sessão/pista/vínculo,
CAS, assinatura, retomada e coleta. Prova própria coincide com revisão completa
no arquivo rico, no DTO acima de 2 MiB e no legado assinado v1. ESLint dirigido
e sintaxe de 462 módulos positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-revisao-propria-persistida-de-campanhas.md)
registra resultados/correções/limites.

Próximo: semântica derivada e origens persistidas, com inventário/coleta antes
dos produtores. Materialização/ativação, C4 dos jobs/índice, UI e ciclos continuam
obrigatórios. P3/D/F2-09 e macro 8/35 abertos; somente commit local.
