# ADR 0130 — Executor durável da criação de lore

- Data: 2026-10-24.
- Estado: implementado/validado localmente; host e entrada no compêndio pendentes.
- Plano: [115 / M38c5q](../tasks/writer-v2/execucao/115-executor-duravel-da-criacao-de-lore.md).

## Composição

Sessão Auth oferece createLore/resumeLoreCreation, com UID/actor/host capturados
e input congelado antes de await. Novo executor compõe preparação, draft,
checkpoint e coordenador puro pelo mesmo handle local. Não cria outro claim.

Proxy de produção confirma bundle com wire privado antes de cada RPC. Resultado
validado gera ponte metadata e nova cópia cifrada. Dívida initial/before/after
conserva bundle/resultado em RAM após falhas; retry de dívida after só confirma
a gravação, sem enviar outro produtor. Nova instância reabre a base/ponte e
reconstrói o mesmo pedido, conferindo prefixo incompleto antes de enviá-lo.

Ready mantém a cabeça ausente. Apply incerto não é reenviado por advance ou
initialize; pode ser confirmado por GETs ou repetido por apply explícito se o
evento ainda não ocorreu. Há mutex para produtor e lanes de cancel independentes.
Inicialização reconcilia reservas/chaves e GETs quando necessários, sem append/
apply automáticos. Metadados não substituem a cópia inicial ausente.

Advance também reconcilia um apply pendente no mesmo handle por consultas
nativas, sem depender de recarga ou reenviar apply. Confirmação desabilita canApply,
inclusive se o core em memória ainda conservar o checkpoint anterior ready.

## Intenção e prova própria de aplicação

Persistir ownApply opcional antes do primeiro envio de apply. A intenção exata
(editId/startHash/jobToken/revisão/operationId) deve corresponder ao wire do
checkpoint ativo, cifrado, reaberto e validado com o input original. Não aceitar
intenção apenas porque IDs/operação parecem próprios ou foram fornecidos pelo host.

Consulta da reserva usa o criador/token originais. Sua adoção deve corresponder
a editId/operationId e geração derivada do editToken original. Depois consultar
a edição pelo startHash original, conferindo token, revisão, operação, timestamp
e localLoreVersion com a prova do pai. Ambos os serviços existentes validam suas
origens/provas nativas; não certificar sucesso por checkpoint/outcome local.

Pedidos de GET ficam determinados pela intenção/estado metadata antes do I/O;
resposta perdida mantém a mesma consulta. Estado confirmado é imutável. Adoção
com outro hash/token/geração mantém conflito e não autoriza liberar/purgar.
Resposta inválida preserva a etapa pendente para reconciliação, sem conceder leitura.

Confirmação é somente metadata, inclusive após revogação da origem ou indisponibilidade
da chave; não recupera prosa nem adota corpo atual como rascunho. Nova instância
com resultado confirmado reconfere as provas nativas sem abrir o texto.

## Encerramento e privacidade

jobsClosed continua representando cancelamento nativo. creationJobsClosed aceita
também ownApply confirmado; só essa prova adicional permite liberar a chave e
purgar a recuperação de criação aplicada. Não cancelar ou coletar cabeça,
geração ou leases adotadas ao descartar a cópia local.

Cancel persiste intenção antes da RPC e não espera produtor/chave/crypto.
Se apply vence, confirmar o evento próprio por metadata antes de encerrar.
Resposta tardia não salva outro checkpoint ou recria frames após release/discard.
AbortSignal não impede fechamento com actor válido; troca de actor/host/posse
bloqueia operações e retorno de texto.

Descarte completo reaberto reconfere ausência física antes de anunciar copyDiscarded,
preservando o resultado histórico aplicado. Estado privado continua sujeito a
chave fresca; metadata de confirmação não concede acesso ao conteúdo.

## Limites e continuidade

Não há nova UI ou ativação no compêndio. Implementar host e exclusão nativa do
cliente antes da entrada; completar lifecycle de chaves, writers/consumidores/
backup/ativação/rollout e validate integral de P1. P1/F2-09/V2, fases 3–5 e gates
humanos/comerciais continuam abertos. Sem backend/Rules/dependências/env novos.

Testes usam serviços Functions reais sobre fixtures de banco/identidade. Chromium
comprova API durável/IndexedDB/WebCrypto/Web Locks e reinício de processo;
não comprova SDK/Auth/App Check reais, interface ativada ou deploy.
Somente commit local, sem CI/push/PR/merge/deploy.
