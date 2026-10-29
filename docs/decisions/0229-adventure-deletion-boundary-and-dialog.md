# ADR 0229 — fronteira privada e diálogo de exclusão de aventuras

- Data: 2026-10-28.
- Estado: dispatcher privado e diálogo isolado implementados; integração aberta.
- Base: 6e5027c. Complementa a [ADR 0228](0228-adventure-deletion-client-recovery.md).

## Decisão

Preparar seis comandos fechados e opções onCall com enforceAppCheck, região
us-central1, timeout de 120 segundos, 512 MiB e até cinco instâncias. UID vem do
contexto auth, nunca do payload. Contexto App Check com appId é obrigatório antes
de construir o serviço; métodos herdados, privados ou não funcionais recusam.
Headers são private/no-store e variam por Authorization/X-Firebase-AppCheck.

O invocador recebe contexto já verificado pelo SDK Firebase. Sua checagem de
presença não verifica criptograficamente tokens: essa responsabilidade permanece
no onCall com enforceAppCheck. O binding em index ainda não foi exportado.
A porta de Storage será a existente de imagens restauradas, sem nova retirada.

Acrescentar hook e diálogo reais na feature folha. Cada abertura recebe nova
sessão de apresentação por UID/aventura, invalidando fonte atrasada antes dos
effects. Fechar conserva a sessão em andamento para confirmar o recibo; reabrir
consulta o diário/servidor em sessão nova, sem avançar automaticamente.
Leituras têm geração e dono; pulso do próprio diário não reinicia uma consulta
que já está em andamento.

Avançar unidades somente após confirmação, recuperação ou continuação explícita.
Ceder o event loop entre unidades e conferir aberto/conta/pausa antes de outra
chamada. Escape, fechar ou pausar não desfazem efeito confirmado nem iniciam a
próxima unidade. Desmontagem ou troca de conta conserva pedido pendente quando
o ACK não puder ser adotado. Não guardar título/prosa no diário.

Comparar recuperação e confirmação aninhada com o envelope que estava na tela.
Outra aba pode mudar a intenção; nesse caso, preservar e recusar, sem resolver
um pedido diferente. Exigir reserva segura também antes do replay de pendência:
ela pode ter sido gravada antes de qualquer envio e ainda produzir o primeiro
efeito. Não enviar apenas porque uma intenção antiga existe no dispositivo.

Notificar revogação após validar o recibo/progresso e antes do CAS local.
Falha de quota posterior não deve manter a apresentação original ativa.
Respostas forjadas e conta/alvo trocados não notificam. O hook limita a
notificação a uma por sessão de apresentação, com invalidação da aventura.

Usar Dialog/Button/Alert/LoadingState do kit e tokens existentes. A confirmação
descreve o que será retirado e o que permanece, com fonte atual, progresso,
pausa, retry, encerramento do início e resolução de conflito. Perguntas próprias
continuam preservadas conforme o motor atual; política final permanece pendente.

## Evidência e limites

67 Vitest dirigidos, 12 Node da fronteira e 18 jornadas Chromium passaram.
São três jornadas repetidas em desktop/celular nos três temas: confirmação e
foco por teclado, pausa/reabertura e reload com repetição do pedido exato.
Web Locks/localStorage/componentes são reais; autenticação e transporte remotos
são fictícios na configuração visual isolada. Não houve exclusão de dados reais.

Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-fronteira-e-dialogo-da-exclusao-de-aventuras.md).
Catálogo de retomada, composição em adventures/Estúdio, binding/export de
endpoints, prova HTTP/Auth/App Check e ciclo restaurado integrado ainda faltam.
Validate integral continua no fechamento do bloco; plano 199 e macro 8/35 abertos.
