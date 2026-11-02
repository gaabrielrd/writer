# ADR 0122 — Coordenador persistido da edição manual de lore

- Data: 2026-10-24.
- Estado: aceito internamente; bootstrap e host visual pendentes.
- Plano: [107 / M38c5i](../tasks/writer-v2/execucao/107-coordenador-persistido-da-edicao-de-lore.md).
- Antecedentes: [checkpoints](0120-encrypted-persistence-of-lore-checkpoints.md)
  e [controles sem chave](0121-keyless-cleanup-of-manual-lore-edits.md).

## Decisão

Compor o core, journal, mapa e port em createPersistedBookLoreEditOperation.
Caller conserva o handle após erro e dirige initialize/advance/apply/cancel.
bookLoreEditSession.persistent vincula um journal já reservado à conta capturada
e ao transporte regional privado, sem enviar durante o vínculo.

Congelar input antes de await. Inicializar mapa completo antes da chave/draft;
confirmar draft e checkpoint inicial antes de qualquer produtor. Status distingue
input ainda não salvo, cópia de recuperação existente, draft confirmado e
resultado aguardando persistência. Snapshot não expõe input ou wires.

## Protocolo e retomada

Port intercepta o pedido do core e salva checkpoint privado com wire pendente
antes de j.send. O journal persiste também a unidade exata antes de RPC.
Após o core validar a resposta, guardar uma ponte metadata do resultado:
root sem wires/prosa, geração base, no máximo uma página de controles alterada
(até 50), confirmação do produtor e identidade aleatória local.

A ponte usa parsers fechados, IDs/escopo/intenção e referências do mapa.
Não contém prosa, manifestos de texto, base64, Auth/App Check ou chave.
Progresso e recibos são operacionais; a ponte não autoriza leitura nem
substitui recibo nativo. Banco/stores continuam versão 1; headers antigos
normalizam campos opcionais como null.

Gravar a ponte antes do checkpoint posterior. Troca active, confirmação do
produtor, remoção da ponte e receipt local id/hash compartilham a transação
final/CAS/oncomplete. Idempotência do receipt não grava outro header.
Falha de salvamento conserva dívida em memória e bloqueia outro produtor;
retry dessa dívida conclui somente a persistência local.

Após recarga, recompor o resultado exato da ponte e páginas da geração base,
ou mapa estático no primeiro checkpoint. Nenhum RPC é necessário para essa
recomposição. Sem ponte, pedido incerto conserva bytes/CAS e repete a unidade
original. Staging pre parcial precisa corresponder ao checkpoint recomputado;
legado produtor sem checkpoint não reinicia cursores por presunção.

Verificar ciphertext de cada prefixo reaproveitado e de active idempotente
contra os bytes fornecidos antes de anunciar salvo. Verificar active antes
de coletar sua antecessora no retry de confirmação sem resposta. Somente o
erro específico de coleta pendente autoriza coletar e tentar uma nova geração;
corrupção mantém as cópias e interrompe a tentativa.

## Cancelamento e autorização

Cancel marca o core sincronamente, persiste intenção monotônica e dirige o
worker metadata independente de produtor/chave. Reply tardio não confirma
produtor cancelado. Adoção que venceu é reconhecida pelo worker sem limpar
corpos ativos. Se mapa ainda não terminou, cancel permanece pendente e não
inventa sucesso ou controles ausentes.

Signal bloqueia produção; não impede persistência local necessária ou cleanup.
Journal da sessão usa guard de conta/contexto, sem signal de produção.
Guard permanece em todo I/O e snapshot, inclusive após await. Retomada privada
continua dependendo da chave com origem reautorizada. Em encerramento, abrir
controller não lê draft/checkpoint nem pede chave.

## Evidência e portões

Testes dirigidos cobrem respostas nativas perdidas, init/pre/post/ACK abortados,
reabertura, metadados inválidos, corrupção, literal multipart, ready/apply,
conta/signal e cancel concorrente. Três jornadas Chromium usam IDB/Web Locks/
WebCrypto reais e serviços reais sobre double; não comprovam UI, Auth/App Check
reais ou produção. Veja a [entrega](../entregas/2026-10-24-writer-v2-coordenador-persistido-da-edicao-de-lore.md).

Bootstrap da reserva/chave, host visual, fechamento antes de descarte e ciclo
de vida integrado seguem pendentes. Também demais writers/consumidores/
backup/ativação/rollout, P1/F2-09/V2, fases 3–5 e condições humanas/comerciais.
Validate integral no fechamento de P1; commits locais, sem CI/push/deploy.
