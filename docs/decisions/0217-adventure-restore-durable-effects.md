# ADR 0217 — Efeitos retomáveis da restauração de aventuras

- Data: 2026-10-28.
- Estado: implementado com validação dirigida local; integral no próximo grande bloco.
- Plano: [195](../tasks/writer-v2/execucao/195-efeitos-retomaveis-da-restauracao-de-aventuras.md).

## Contexto

Início/upload/preparação já têm serviços cliente próprios. A chave privada
é removida no cancelamento e na primeira coleta da fonte. Registrar esses
efeitos no journal cifrado impediria recuperar a própria confirmação após
o servidor encerrar a chave. Livros possuem outro protocolo: a aventura usa
mídia por ativo, checkpoints próprios e resposta unresolved no resolver.

## Decisão

Manter cinco intents fechados de metadata: ativação, cancelamento, cleanup,
avanço de mídia e coleta. Cada registro tem identidade de cinco campos,
operação/checkpoint, stamp e reviewToken somente na ativação. Não armazena
título, resumo, texto, arquivo, chave, URL ou grant. O namespace IndexedDB
writer.adventure-restore.effects usa conta/restoreId e CAS inteiro do serviço
da própria feature; preparação cifrada permanece separada.

A sessão persiste antes de mutar, confirma recibo antes de limpar e repete
pedido exato após resposta incerta. Métodos finais contextualizados completam
os 29 callables públicos no helper SDK, com guard/conta, captura antes de await
e inputs fechados. Chaves/helpers continuam fora da lista pública.

advance executa uma unidade. A preparação final pausa para revisão; somente
activate(review) pode ativar. A revisão é copiada antes dos awaits e vincula
checkpoint/reviewToken; o servidor reautoriza as origens. Erro explícito
activation-review-changed aposenta o pedido original pelo mesmo ID/fingerprint.
Timeout ou offline preservam a pendência. Recibo aposentado não é ativação.

Resolver geral usa domínio/fingerprint próprios; unresolved no mesmo checkpoint
preserva. Avanço monotônico prova que um pedido não confirmado foi ultrapassado.
Mídia/coleta confirmam por replay do comando original; conflito explícito mais
leitura posterior avançada permite limpar pedido ultrapassado. already-complete
é resultado nativo sem recibo inventado. Mídia verifica checkpoint antes de
complete; coleta admite complete antes de recusar checkpoint antigo.

Leitores projetam revisão/status com campos próprios da aventura, incluindo
oito contagens, seis avisos, mídia por ativo e fases/counters de coleta.
No mesmo checkpoint, recibo e progresso precisam coincidir em estado/validação/
staging. Ativação confere fingerprint/revisão e metadata do job congelado;
coleta também confere contexto/primeira operação e monotonicidade.

## Consequências e evidência

Cancelamento/primeira coleta podem remover a chave e ainda permitir a retomada
local da confirmação. Recibo histórico não concede acesso atual, recria raiz
ou altera heads. CAS/conta/falhas conservam a operação que ainda pode ter efeito.

136 casos dirigidos e 13 verificações Chromium positivos; tipos/lint/arquitetura/
build/smoke positivos. Detalhes e limites na
[evidência](../entregas/2026-10-28-writer-v2-efeitos-retomaveis-de-aventuras.md).
Não há UI nova, deploy, dependência, backend/Rules/índice ou política de produto
nova. As regras já vigentes das ADRs 0214–0216 cobrem a separação; AGENTS.md não
é alterado por este incremento. P2/P3/D/F2-09, macro 8/35 e gates continuam abertos.
