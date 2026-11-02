# ADR 0121 — Controles e cancelamento de lore sem chave

- Data: 2026-10-24.
- Estado: aceito internamente, sem host visual ou write-ahead automático.
- Plano: [106 / M38c5h](../tasks/writer-v2/execucao/106-controles-e-cancelamento-de-lore-sem-chave.md).
- Antecedente: [ADR 0120](0120-encrypted-persistence-of-lore-checkpoints.md).

## Decisão

Persistir mapa completo de IDs/hashes dos jobs e máquina de cancelamento em
metadata, legíveis pela conta original sem chave de conteúdo. Não guardar
prosa, manifestos de texto, Auth/App Check ou chave nesse mapa. Tokens de jobs
e recibos de adoção são controles operacionais, sem conceder leitura do draft.

captureBookLoreControlMap obtém identidade/
intentHash e todos os uploads em páginas até 50, com digest. Fonte e IDs são
determinísticos por UID/writeId/livro/ficha. Captura reconhece edição conhecida
ou start incerto do coordenador legado; não inventa hash de pai desconhecido.

## Armazenamento e envio

Namespace controls no store existente mantém páginas e lookups por ID,
separados de ciphertext pelos tipos/keys. Header opcional controls conserva
geração, count/digest, progresso de gravação, inspeção/edição e worker.
Headers antigos continuam com controls nulo; banco permanece versão 1.

Página, seus até 50 lookups e written/ready compartilham transação/CAS/
oncomplete. Lookup por ID é conferido contra a página; cada avanço lê um
número limitado de records, sem varrer todo o mapa. Prefixo parcial só aceita
a mesma captura; mapa é congelado antes do primeiro await.

Com mapa presente, produção exige ready, worker idle, cancel falso e ID/hash
conhecidos. Pai é registrado antes de seu start; inspeção e todos os uploads
referenciados no start/reserva devem pertencer ao mapa. Registro novo de pai
após início de cleanup é recusado. Captura de pai já observado permite
backfill controlado do coordenador antigo.

API interna antiga sem mapa conserva comportamento, sem promessa de cleanup
completo após recarga. O novo host deve criar mapa obrigatoriamente antes dos
RPCs; esta compatibilidade não autoriza ativar a edição visual recuperável.

## Máquina de cancelamento

advanceControlCleanup grava intenção monotônica e pedido metadata exato antes
de chamar o port. Um avanço faz no máximo um RPC. Não mantém lock durante rede
e não depende de produtor, getKey, decrypt ou signal abortado; guard de conta/
contexto e CAS continuam em todo I/O. Sessão Auth oferece cleanup(journal),
confere UID e usa a callable privada regional existente.

Pai conhecido é consultado antes de limpar filhos. Ausência (null ou not-found)
leva a fence, nunca a sucesso presumido. Cancel em conflito preserva wire
original e consulta metadata antes do retry. Adoção própria exige operationId
determinístico e recibo válido; encerra como applied sem limpar corpos ativos.

Após pai cancelado, fecha uploads por cursor e inspeção. Progressos/tokens/
contagens e blockedReason são conferidos. Bloqueio legítimo permanece visível;
razão arbitrária ou resposta malformada é recusada sem perder pedido.
Confirmação local e progresso do worker compartilham commit: falha mantém a
requisição para replay idêntico após recarga.

Worker tem ledger próprio para GETs frescos e cleanup. Pendências legadas
cleanup/diagnostic conhecidas são repetidas exatamente e confirmadas juntas
com o estado; replay fora do cursor não o avança. Não sobrescrever legado
desconhecido. Produtor incerto permanece cifrado/pendente, bloqueado por cancel,
até o fechamento nativo; não é rotulado como cancelamento bem-sucedido.

## Consequências, evidência e portões

Cancelamento não remove draft/checkpoint/chave ou recibos. Metadata não é
grant de conteúdo; revogação da origem continua impedindo recuperação do texto.
Coleta local, fechamento nativo e revogação da chave são ações distintas.

114 Vitest distintos positivos em rodadas e dois cenários Chromium com
IndexedDB/Web Locks reais. Harness leve da mesma origem isola armazenamento/
RPC, com serviços reais sobre double e Auth fictícia; não certifica UI ou
tokens/Rules reais. Primeiro ensaio da aplicação completa esgotou recursos
na navegação; não foi contado como smoke positivo.

Próximo: composição automática de write-ahead/acks, reserva/sessão/host,
fechamento antes de descarte e ciclo de vida da chave na exclusão. Demais
writers/consumidores/backup/ativação/rollout e P1/F2-09/V2, fases 3–5 e
condições humanas/comerciais seguem abertos. Validate no fim de P1; só commit local.
