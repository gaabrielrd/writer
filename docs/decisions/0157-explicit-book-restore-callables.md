# ADR 0157 — comandos explícitos de restauração

## Estado e contexto

Aceita em 2026-10-25.
[Plano 136](../tasks/writer-v2/execucao/136-transporte-da-restauracao.md).
O serviço composto contém comandos serializáveis e ports internos. Somente
upload/integridade/validação tinham exports Functions; o restante do pipeline
precisa de transporte antes do driver e da revisão no cliente.

## Decisão

BOOK_RESTORE_METHODS é uma lista literal imutável de 31 comandos públicos:
dez existentes e 21 de preparação, revisão, ativação, mídia e limpeza.
index.mjs declara cada export literalmente, com o mesmo callable existente:
App Check obrigatório, região us-central1, 512 MiB, maxInstances 5 e timeout
120 s, exceto validação com 540 s.

Selecionar a restauração cedo pela lista, usando invokeBookRestoreCallable.
A fronteira pura autoriza UID e exige nome permitido e função própria no serviço.
Não escolher método pelo payload e não procurar propriedades arbitrárias de
bookRestore no fallback geral. Os comandos mantêm seus contratos fechados,
provas nativas, CAS e recibos, sem lógica de persistência nova no transporte.

openVerifiedBookRestoreSource, openVerifiedBookRestoreContent e
openPreparedBookRestoreLore permanecem internos. Helpers de cleanup privados e
a chave não entram na allowlist. getBookRestoreRecoveryKey conserva o HTTP
separado, Auth/App Check, limites e no-store anteriores.

Todos os comandos da lista recebem Cache-Control private, no-store e
Vary Authorization ao entrar no handler autorizado. Rejeições do middleware
anterior ao handler seguem o comportamento do SDK Functions. Não mudar o
protocolo para contornar essa verificação.

## Validação e consequências

Testes verificam a lista fechada, ausência dos ports nos exports, forwarding
literal, autorização, erros e execução real de consulta/mídia/limpeza.
HTTP loopback usa o middleware real de Functions e verificadores de identidade
restritos ao teste: identidade válida sintética com App Check ausente/inválido
falha; App Check sintético válido não dispensa Auth nem entrada fechada.
Não há bypass no código de produção ou prova de credenciais reais.

Sem novo armazenamento, dependência, deploy ou mudança da opção indexada
padrão. Registrar funções no código não as torna disponíveis remotamente.
Driver/recuperação cifrada/tela/roundtrip integral e demais P1/fases/gates
continuam obrigatórios.
[Evidência](../entregas/2026-10-25-writer-v2-transporte-da-restauracao.md).
