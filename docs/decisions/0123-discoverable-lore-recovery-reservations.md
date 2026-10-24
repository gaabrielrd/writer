# ADR 0123 — Reserva descobrível e encerramento da recuperação de lore

- Data: 2026-10-24.
- Estado: aceito internamente; host visual/rollout pendentes.
- Plano: [108 / M38c5j](../tasks/writer-v2/execucao/108-reserva-descobrivel-e-encerramento-da-edicao-de-lore.md).
- Antecedente: [coordenador persistido](0122-persisted-coordination-of-manual-lore-edits.md).

## Problema e decisão

A reserva da chave pode ser aceita antes de o cliente observar sua identidade.
Sem um ticket prévio, recarregar nessa janela torna a reserva desconhecida.
Guardar ticket metadata antes do primeiro RPC, compor reserva/journal/controller
e disponibilizar criação, retomada e listagem pela sessão Auth capturada.

bookLoreEditSession.manual cria handle sem I/O, congela input/UID e conserva
o mesmo handle após erro. resumeManual recebe somente writeId; preparations
pagina a conta atual. initialize confirma a reserva e grava a cópia; advance
dirige unidades, apply continua explícito. Produtor passa pelo checkpoint
e ledger já existentes, após identidade da reserva confirmada localmente.

## Persistência e concorrência

IDB writer.book-lore-journal migra de versão 1 para 2 adicionando preparations.
Não altera ciphertext, AAD, heads ou frames existentes. Upgrade verifica stores
antes de criar; downgrade é recusado, versões antigas precisam ser fechadas/
atualizadas. Nenhuma migração destrutiva ou fallback plaintext.

Ticket fechado contém UID/escopo/intenção/hash, identidade reservada, stamp,
intenção monotônica de cancelamento/liberação, confirmação da reserva e
pedido exato de revoke em lane independente. Sem prosa, manifesto de texto,
base64, chaves, Auth/App Check ou erros livres. Jobs/tokens são metadata de
controle e não concedem leitura. Hash nativo da reserva inclui UID e intenção.

CAS/Web Locks/oncomplete confirmam ticket e ACK. Locks não atravessam rede.
Takeover explícito impede handles antigos; identidade, fechamento e pedido
pendente não podem ser substituídos. Reply tardio é comparado à identidade
mais recente, inclusive quando a liberação concorrente já a confirmou.

Falha de ACK repete intenção original sem novo CAS/sourceToken. Se a reserva
confirmou e o journal não nasceu, retry não reserva outra vez. Associação do
controller pode ser refeita após falha transitória sem perder input.
A conta/contexto é conferida antes/depois de await, RPC e leitura privada.

## O que a retomada pode afirmar

Antes da primeira gravação cifrada completa, existe recuperação dos controles,
mas não há como prometer texto recuperável. Input permanece em memória no handle;
após recarga sem draft completo, retornar awaiting-draft/requiresInput e permitir
encerramento. Não inventar texto vazio, rebasear origem ou iniciar produtor.

Quando há draft confirmado, chave HTTP reautoriza a origem e a retomada
reconstrói o controller. Abrir handle não envia. Inicializar uma reserva já
confirmada e uma cópia existente não envia reserve/produtor. Leitura privada
continua exigindo as verificações frescas de chave antes/depois do journal.

## Cancelar e encerrar recuperação são ações distintas

cancel marca o core sincronamente e persiste intenção antes da rede. Fecha jobs
conhecidos, preservando chave e cópias. Pode recuperar o draft depois, pela mesma
conta e com origem autorizada. Ausência de permissão/chave não prova limpeza.

releaseRecovery registra intenção explícita e monotônica de encerrar a
recuperação. Primeiro fecha jobs; somente depois envia revoke, com pedido
exato durável. Na ausência comprovada de journal/produtor, hash da reserva
permite fence mesmo se a resposta de reserve ainda está em voo.
Encerramento faz no máximo um RPC por passo e não espera reserva, chave ou
produtor pendentes. Bloqueio/legado contraditório conserva os controles.

Resposta de revoke precisa provar revoked e corresponder ao escopo/identidade;
ACK perdido deixa o mesmo pedido para replay. Adoção própria vencedora é
reconhecida sem limpar corpos ativos. Uma chave revogada externamente não
é tratada como prova de que jobs fecharam; cleanup continua necessário.

Nenhuma destas APIs apaga dados locais. canDiscard exige prova confirmada de
revogação mais fechamento dos jobs. A futura purga deve reassumir/fencear o
journal antes de remover frames, inclusive se uma escrita privada antiga
ainda estava em voo. Revogar chave é irreversível; não fazê-lo no cancel comum.

## Evidência e pendências

Veja a [entrega](../entregas/2026-10-24-writer-v2-reserva-descobrivel-da-edicao-de-lore.md).
Testes dirigidos usam serviços reais sobre double; Chromium prova upgrade real,
restart de reserva incerta e cancel sem decrypt, com recuperação posterior e
liberação explícita. Não certificam interface, Firebase SDK/App Check ou produção.

Host visual/purga local, ciclo da chave na exclusão do livro, writers Admin/
Rules coordenados e drenagem de versões antigas, consumidores, backup/ativação/
rollout e P1/F2-09/V2 seguem abertos, assim como fases 3–5 e gates humanos/
comerciais. Validate integral no fechamento de P1; sem CI/push/deploy.
