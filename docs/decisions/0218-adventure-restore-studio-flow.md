# ADR 0218 — Restauração de aventuras no Estúdio

- Data: 2026-10-28.
- Estado: implementado com validação dirigida local; integral no próximo bloco integrado.
- Plano: [196](../tasks/writer-v2/execucao/196-restauracao-de-aventuras-no-estudio.md).

## Contexto e decisão

O Estúdio oferece uma ação própria para restaurar aventura e um painel de
retomada com remoto, inícios e efeitos locais. Usa somente a interface pública
de adventure-portability. O diálogo monta uma sessão por conta/restauração;
abrir/listar apenas lê. Criar a cópia exige revisão local e confirmação final
separadas, com o kit shared/ui e temas existentes.

A inspeção usa snapshot Blob nativo, validador semântico e SHA completo.
A revisão congelada contém fonte, contagens/avisos e políticas aprovadas;
não guarda nome, arquivo, texto ou segredo. Livros/JSON não são interpretados
como aventura. O arquivo permanece em memória e precisa ser selecionado
novamente se um upload incompleto for retomado após recarga.

O hook combina os serviços de 191–195. O keyId de envelope antigo é preservado;
sem envelope, o HTTP privado descobre o contexto inicial. Ler metadata não é
grant: só o journal reautoriza/decifra. Pausa termina a unidade corrente;
desmontagem/conta invalidam resultados tardios e abortam inspeção local.

Se a persistência inicial falhar antes do envio, Retomar conserva a revisão/
ID originais. Somente bootstrap ausente e not-found remoto permitem repetir
begin com o mesmo ID; indisponibilidade não cria outro início. Seleção posterior
não substitui a fonte/revisão já confirmada. Falha de resposta continua usando
o registro original e nunca gera uma operação alternativa.

Após cancelamento/ativação, a UI pode oferecer remoção explícita do envelope
local. O servidor revalida estado terminal/identidade; o envelope fechado é
removido por CAS, sem decifrar ou buscar chave encerrada. Corrupção/conta/CAS
preservam bytes. Efeitos ainda sem confirmação não são removidos por esse fluxo.

A abertura da cópia chama getAdventure no servidor e confere guard/ownerId
depois do await. Job ou recibo histórico não concede acesso à raiz atual.

## Evidência e limites

103 Vitest em oito arquivos e 12 verificações Chromium positivas. O browser
usou exportador, UI e serviços reais sobre bancos/Storage de teste, com
IndexedDB/Web Locks/WebCrypto nativos e Auth/App Check sintéticos.
O cenário inclui PNG por dois usos, recarga de pedido cifrado, ativação única,
finalização/coleta e cancelamento/descarte sem chave. Temas e teclado foram
conferidos em 1280/320 px, com imagens após terminar transições.

Detalhes na
[evidência](../entregas/2026-10-28-writer-v2-restauracao-de-aventuras-no-estudio.md).
Sem dependência, backend/Rules/índice, deploy ou regra global nova.
Geração do backup pela interface, corpus amplo de roundtrip, P2/P3/D/F2-09
e gates permanecem pendentes; macro 8/35 não muda.
