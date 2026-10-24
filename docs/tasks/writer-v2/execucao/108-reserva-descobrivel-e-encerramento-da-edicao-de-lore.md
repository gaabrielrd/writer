# P1 / M38c5j — Reserva descobrível e encerramento da edição de lore

## Objetivo e fronteira

Compor reserva nativa, journal e coordenador persistido numa sessão utilizável
pelo futuro formulário. Tornar reserva com resposta perdida descobrível após
recarga antes de existir ciphertext; fechar jobs antes de revogar a chave.
Preservar cópias locais. Host visual e descarte local são a sequência seguinte,
sem habilitar geração v2 antes dos writers/readers/Rules coordenados.

## Constatações e suposições

A reserva devolve identidade, não a chave; HTTP separado reautoriza a origem.
Não é possível prometer recuperação do texto antes da primeira gravação cifrada.
Nessa janela manter input em memória, persistir somente ticket metadata e não
iniciar produtores. Após recarga, ticket permite confirmar/cancelar a reserva;
sem draft completo, não reconstruir texto ausente nem reiniciar um produtor.

## Requisitos e tarefas sequenciais

1. Contrato fechado de intenção/ticket metadata com UID, hash do pedido,
   identidade reservada e lanes independentes de reserve/revoke. Nunca prosa,
   manifesto de texto, base64, chave, Auth/App Check ou erros livres.
2. Store preparations no IDB do journal, upgrade v1 → v2 sem apagar heads/frames.
   CAS/Web Locks/oncomplete, paginação por conta até 50 e takeover explícito.
   Bloquear versões antigas com orientação de recarga, sem fallback plaintext.
3. Preparar input imutável e intentHash; gravar ticket antes do reserve RPC.
   Persistir resposta validada antes de criar/abrir journal e iniciar cópia.
   Replay usa intenção/hash originais; falha de ACK deixa ticket descobrível.
4. Sessão Auth captura UID/contexto e usa somente callables regionais existentes
   para reserva/revogação e port manual. Factory conserva input/handle após erro;
   initialize/advance/apply explícitos, snapshot sem conteúdo e leitura privada
   somente via journal reautorizado. Nenhuma chamada ao criar/abrir handle.
5. Cancel fecha os jobs e conserva chave/cópias para recuperar o rascunho.
   releaseRecovery é intenção explícita e durável de encerrar a recuperação.
   Ambas marcam core sincronamente e ticket antes de rede. Não espera reserva,
   produtor ou chave em voo. Na liberação explícita sem journal/produtor,
   revogar reserva por hash cria
   fence; com jobs conhecidos, fechar worker primeiro, uma unidade por passo.
   Respostas tardias não retiram cancel nem substituem prova de revogação.
6. Revogação é passo separado, pedido exato durável antes de RPC e resposta
   fechada por identidade/origem. Adoção vencedora conserva corpos ativos.
   Não apagar draft/checkpoint/ticket/recibos. Não declarar descarte permitido
   somente porque a chave ficou indisponível; legado contraditório é preservado.
7. Testar serviços reais/double: reserva perdida, ACK local abortado, cold reload
   antes/depois de draft, cancel contra reserve/key/produtor pendentes, key denial,
   adoção vencedora, downgrade, paginação/conta/CAS/corrupção e literais grandes.
   Chromium prova upgrade real, restart e encerramento sem decrypt.
8. Revisão, ADR, docs/evidência e commit local. Testes dirigidos/checks afetados;
   validate integral no fechamento de P1. Sem CI/push/PR/merge/deploy.

## Arquivos e riscos

Novos contratos/store-coordenação de preparação, integração no DB/sessão/barrel,
requestCancel síncrono no controller existente, testes e docs. Sem mudança de
backend/Rules/dependências. Migração é aditiva e deve preservar dados v1 reais.

Reservation replay não concede acesso à prosa. Ticket sem draft confirmado é
recuperação de controle, não recuperação de texto. Cancel/revoke têm lanes
independentes para não sobrescrever reserva incerta. Controle de conta e stamp
é obrigatório antes/depois de await e RPC; locks nunca ficam durante a rede.

## Critérios de aceite

Primeiro RPC somente com ticket durável; resultado observado/ACK atômicos no
store; recarga descobre intenção original e nunca inventa texto/CAS. Journal
existente retoma por chave reautorizada, sem reservar de novo. Cancel funciona
independente de waits privados e fecha jobs antes de revogar. Chave revogada
não destrói cópias locais ou corpos adotados. Bootstrap utilizável pelo host,
mantendo UI/descarte/ciclo de exclusão do livro, demais consumidores/writers/
backup/ativação/rollout, P1/F2-09/V2 e fases 3–5 explicitamente abertos.

## Resultado do incremento

Bootstrap, ticket metadata paginado e sessão Auth implementados, com migração
aditiva IDB v2, replay/ACK e fechamento antes da liberação explícita da chave.
Cancel comum conserva a recuperação do draft. 208 Vitest distintos em rodadas
e três cenários Chromium positivos; checks dirigidos.
Veja [ADR 0123](../../../decisions/0123-discoverable-lore-recovery-reservations.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-reserva-descobrivel-da-edicao-de-lore.md).
Host visual/purga local/ciclo da chave e demais gates continuam pendentes.
Validate integral no fechamento de P1; somente commit local.
