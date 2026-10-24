# ADR 0120 — Persistência cifrada dos checkpoints de lore

- Data: 2026-10-24.
- Estado: aceito internamente; sem host ou write-ahead automático habilitado.
- Plano: [105 / M38c5g](../tasks/writer-v2/execucao/105-persistencia-cifrada-dos-checkpoints-de-lore.md).
- Antecedentes: [ADR 0118](0118-partitioned-local-lore-edit-journal.md) e
  [ADR 0119](0119-restorable-manual-lore-edit-checkpoints.md).

## Decisão e contrato

Capturar checkpoint e controles de uma operação em bundle privado versionado,
imutável, com root, páginas até 50 e confirmações locais opcionais. Captura
síncrona não intercala avanços; percorre metadata e congela wires, sem gravar
em storage. Formato fechado confere identidade/intenção, fases/cursores,
progressos, digest encadeado e whitelist dos pedidos. Credenciais/extras
não entram. A reconstrução completa ainda confere codecs/manifests/input
original com o contrato de M38c5f; bundle não é prova nativa de autorização.

Journal grava o bundle inteiro por partes até 64 KiB, com manifesto SHA
cifrado e AES-GCM/AAD na seção checkpoint. Reutiliza codec/crypto e banco
writer.book-lore-journal versão 1; sem teto total de 8 MiB/128 partes.
Headers contêm somente descritores de gerações, contagens e cursor de coleta,
sem root, páginas, prosa, digest do corpo ou chave.

## Gerações e atomicidade

Header opcional checkpoint mantém active, pending e garbage. Headers antigos
sem o campo são lidos como checkpoint nulo; não inventar estado restaurável.
Cada parte e contador compartilham transação, confirmada em oncomplete.
Guard de conta e CAS/Web Lock do journal continuam obrigatórios.

Nova cópia é escrita em geração independente. Não substituir active até
concluir todas as partes. Troca de ponteiro, registro da geração antiga para
coleta e confirmações locais são um único commit. Exclusividade de escrita
permanece até esse commit terminar, inclusive na falha.

Prefixo parcial aceita somente retry do mesmo bundle/manifesto. Cópia
divergente é recusada e preservada. Partes completas com commit final abortado
podem ser verificadas e promovidas na leitura após chave fresca; active
anterior pode ser lido explicitamente. Corrupção não dispara fallback silencioso
ou exclusão. Uma próxima escrita diferente aguarda coleta da geração substituída.

Confirmações opcionais ficam dentro do bundle cifrado: até um hash por canal.
Troca exige unidade correspondente e já selada; confirmação local segue
dependendo de o consumidor validar a resposta. Não vira recibo nativo ou
sucesso presumido de cancelamento recusado. Replay de bundle ativo é local
e idempotente, sem reabrir unidade confirmada.

## Leitura, reconstrução e coleta

Chave não extraível não é persistida. Leitura obtém grant fresco antes de
decrypt e ao fim da validação; ler partes ou ter um header não concede grant.
readCheckpoint reconstrói JSON em memória. restoreCheckpointOperation lê
draft e bundle protegidos, reconstrói codecs/coordenador sem RPC e reautoriza
após awaits. Guard extra e signal são respeitados; mudança de stamp durante
reconstrução recusa resultado. Cancelamento monotônico do journal é aplicado
mesmo se o checkpoint anterior não o continha; ready não adota.

Coleta remove somente frames da geração antiga substituída, até 50 por
transação, com cursor/CAS no mesmo commit. Nunca alcança draft, pedido,
active/pending ou chave. Pode avançar sem chave, mantendo guard de conta.
Essa coleta local não fecha jobs nativos nem substitui cleanup completo.

## Evidência e pendências

19 testes novos e 31 regressões positivas em rodadas dirigidas; Chromium real
recupera somente do IDB cifrado após reload, inclusive falha nativa do último
commit. Servidor no harness usa serviços reais sobre double/Auth fictícia,
sem certificar tokens ou Rules. Capacidade acima de 8 MiB/128 partes usa
metadata sintética, sem alegar uma intenção nativa de 55 mil uploads.

Próxima composição deve salvar checkpoints/controles antes do RPC, reconciliar
acks após resposta, manter mapa completo de jobs metadata para cleanup sem
chave e ligar reserva/sessão/host. Também faltam fechamento antes de descarte,
ciclo de vida da chave na exclusão, demais writers/consumidores/backup/
ativação/rollout e P1/F2-09/V2. Fases 3–5 e condições humanas/comerciais seguem
abertas. Validate no fim de P1; somente commit local.
