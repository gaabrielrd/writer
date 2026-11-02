# ADR 0215 — Controlador da preparação de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado dirigidamente no código local.
- Plano: [193](../tasks/writer-v2/execucao/193-controlador-da-preparacao-de-aventuras.md).
- Antecedente: [0214](0214-adventure-restore-encrypted-preparation-journal.md).

## Decisão

Executar uma unidade por step, com identidade/contexto próprios da aventura.
O progresso nativo não traz ownerId/keyId; conferir restoreId/adventureId/
jobToken/reviewHash e derivar proprietário do contexto autorizado. Se ownerId
aparecer, precisa corresponder. Projeção devolve só estado/checkpoint e metadata
necessária, sem fonte, prosa, resumo ou tokens de ativação.

Reutilizar validAdventureStagingView e validAdventureValidationView puros,
com declarações TS estreitas. Validar versão/fases/pendências e consistência
do estado; isso é leitura de metadata pública, não prova nativa de grant.
Staging da aventura usa version 1 e fases próprias, sem cast do livro.

audit-ready sem libraryImages ainda exige instalar a biblioteca, inclusive
quando não há imagens. image-library-ready inicia nova auditoria. Somente
audit-ready com instalação completa e armazenamento preparado pausa para
revisão. Não ativar, cancelar ou coletar automaticamente.

Se há intent pendente, repeti-lo antes de buscar progresso ou gerar ID.
Se não há, buscar/validar progresso, escolher um comando, persistir o intent
por CAS e só então enviar. Guard em awaits e bloqueio de reentrada por instância.
Falha ou conflito preserva pendência; não replanejar ou repetir automaticamente.

Confirmar schema/kind/action/ID/checkpoints/estado e views do recibo antes de
limpar por CAS do intent completo. Replay pode devolver progresso atual posterior;
no mesmo checkpoint, estado e metadata devem coincidir integralmente.
Um recibo malformado não quita a pendência. Chave revogada não autoriza apagar
registro ilegível; resolução/descarte terminal permanece contrato separado.

Adaptador callable contextual expõe getter e 14 comandos explícitos. Entrada
fechada e capturada antes de await, Firebase tardio e conta/guard antes/depois
da chamada, região us-central1. Timeout cliente de 600 s na validação e
180 s no getter/demais comandos dá margem aos limites servidor de 540/120 s. Não escolher método pelo payload, expor chave,
acionar IA/cobrança ou executar os efeitos posteriores.

## Evidência e limites

Vitest cobre portas, recibos/CAS/guard/replay e pipeline real sem imagens.
Chromium usa journal/IndexedDB/Web Locks/WebCrypto reais, com pipeline/handler
do servidor em banco de teste e Storage em memória; HTTP passa por ponte de
mesma origem restrita ao teste. A resposta perdida é simulada após confirmação
do serviço. Prova recarga/replay exato, imagem, duas auditorias e pausa privada.
Não é Firebase SDK no navegador, credencial/App Check real ou Firestore nativo.

Resultados na
[evidência](../entregas/2026-10-28-writer-v2-controlador-da-preparacao-de-aventuras.md).
Sem consumidor de UI ainda; start/upload/bootstrap/revisão/efeitos/roundtrip,
P2/P3/D/F2-09, gates e macro 8/35 continuam abertos. Validate integral no
fechamento do bloco do cliente. Sem dependência, CI, push ou deploy.
