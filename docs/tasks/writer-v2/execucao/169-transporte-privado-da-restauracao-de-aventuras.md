# P2 — transporte privado da restauração de aventuras

Base: f3704a0. Objetivo: receber um arquivo privado com reserva exclusiva,
upload retomável, hash integral independente e cancelamento/limpeza verificáveis.
Não habilitar UI, endpoint ou ativação de projeto neste bloco interno.

## Descoberta e decisão de raiz

Grafo writer-v2 consultado, insuficiente. Conferidos studio/scenes, importação,
Rules, backup source/history, transporte/integridade de livros e testes SDK.
Studio filtra ownerId; get/prosa/backup exigem dono. Escrita SDK de aventura
é proibida e os criadores usam create/recusam raiz existente.

Reservar raiz mínima sem ownerId junto do job/reserva/operação inicial.
Não copiar o protocolo de livro que só cria a raiz na ativação: versões nativas
da aventura precisam nascer depois dela. Stub e reserva têm nascimento comum
com o job, sem prosa/nome/estado de autoria. Testes reais devem provar que não
aparece no Estúdio nem é acessível por SDK, backup ou edição normais.

Cancelamento mantém raiz mínima aposentada e reserva permanente, sem prosa ou
dono humano. Isso bloqueia criação/importação futura do mesmo ID e evita adoção
por replay. Limpar somente artefatos cujo contexto, nascimento e operação
imutável sejam conferidos; nunca apagar raiz/filho estrangeiro ou recriado.

## Contrato e implementação sequencial

1. Inputs/saídas fechados e erro próprio da operação. Fonte só formato
   writer-adventure-archive v1, tamanho/SHA e hash da revisão privada.
   UID/IDs/hash/inteiros/datas validados antes de I/O; limites explícitos.
2. Domínio próprio para fingerprints, targetId e jobToken por nascimento nativo.
   Reserva/stub/start-op em mesmo commit; recusar colisão, presença órfã ou
   origem recriada. Nenhum vínculo automático ao universo/persona/imagem.
3. start e resolver de start com fence de cancelamento desconhecido. Replay
   distingue recibo histórico e progresso atual; token não migra entre contas.
   get/list privados limitados, com cursor ligado à conta/filtro, sem conteúdo.
4. Append de 64 KiB por índice/checkpoint, base64 canônico e SHA, encadeamento
   próprio, recibo atômico e contexto no chunk. Repetição não duplica bytes;
   disputa de checkpoints só confirma uma operação.
5. Integridade independente em lotes até 16: reler bytes reais, SHA retomável
   e provas fixadas ao nascimento/versão do chunk. Estado privado imutável por
   operação; último hash do estado ligado ao job e recibo. Bytes verificados
   continuam diferentes de conteúdo validado.
6. Resolver de operação e cancelamento; cleanup em páginas até 50 de chunks,
   provas e estados. Verificar operação/artifact hash/nascimento antes de apagar.
   Não certificar limpeza com conteúdo autoral inesperado sob stub.
   Job/reserva/marcador mínimo persistem como fence, sem arquivo ou SHA state.
7. Contexto interno reutilizável pela próxima coordenação semântica, sem copiar
   serviço de livro por cast ou criar framework genérico. Provas dos bytes e
   checkpoint deverão ser revalidadas antes de qualquer escrita autoral.
8. Rules explícitas para job/filhos/operações/fences/reservas, sem permissão SDK.
   Testes Node de contrato, concorrência/rollback/retry/ABA e SDK real de reserva,
   invisibilidade, bytes, recibos e limpeza. Usar somente emulador demo local.
9. Checks dirigidos, revisão, ADR/docs/evidência e commit local; validate integral
   no fechamento do bloco maior remoto. Sem CI/push/deploy/subagentes.

## Privacidade e limites

Estado incremental de SHA pode conter uma cauda limitada dos bytes processados;
é sensível e nunca pertence ao metadata público, recibo de UI ou arquivo exportado.
Checkpoint não contém projeto/prosa integral; isso não torna seu estado SHA público.
Manter job/estados/partes privados. Metadados de resposta são projeção fechada.

O módulo interno ainda não implementa chave/journal do dispositivo nem coordenação
semântica: ligar recuperação cifrada e os gates necessários antes de expor a UI
ou permitir um cliente real iniciar envio. Não afirmar restauração utilizável.
Fonte externa/grants permanecem sujeitos à autorização atual na etapa própria.

P2 restante: validação persistente, revisão/remap/estrutura/mídia, draft como versão
separada, contadores/ativação privada, recuperação/UI, roundtrip e consumidores.
P3/D/F2-09, gates humanos/comerciais e contagem 8/35 seguem abertos.

## Aceites

- [x] Reserva nativa e stub invisível com colisões/fences e contexto conferidos.
- [x] Upload/integridade independentes, limitados e idempotentes, sem conteúdo em views.
- [x] Cancelamento/limpeza sem adotar ou remover artefatos estranhos/recriados.
- [x] Node e SDK pertinentes positivos, revisão/checks/docs/commit locais.
