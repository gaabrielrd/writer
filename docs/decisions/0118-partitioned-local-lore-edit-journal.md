# ADR 0118 — Journal local cifrado da edição de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem host visual habilitado ou implantação.
- Plano: [103 / M38c5e](../tasks/writer-v2/execucao/103-journal-cifrado-das-edicoes-de-lore.md).
- Antecedente: [ADR 0117](0117-private-lore-edit-recovery-keys.md).

## Decisão e fronteira

Aplicar a política aprovada de preservar rascunho e pedido pendente no
dispositivo, recuperáveis pela mesma conta após reautorizar a ficha original.
Este incremento implementa armazenamento e recuperação literal e de unidade
RPC; o snapshot do coordenador existente é status, não checkpoint restaurável.
A reconstrução completa do coordenador e o host continuam pendentes.

## Identidade, chave e conteúdo

Identidade fechada fixa versão, UID/writeId, livro/ficha/sourceToken,
intentHash, requestHash da reserva, jobToken e keyId. A sessão captura o objeto
Auth e o guard do host, verificando-os antes/depois de I/O. Descoberta paginada
por conta retorna somente headers, sem chave ou decriptação.

Chave vem somente do HTTP privado existente com Auth/App Check/no-store.
Validar envelope, identidade, fase, algoritmo, base64 canônico de 32 bytes e
fingerprint antes de importar AES-GCM 256 não extraível. Não persistir chave,
tokens Auth/App Check ou credenciais. Cópia Uint8Array temporária é zerada;
isso não promete apagar strings ou o heap JavaScript.

Leitura pede autorização fresca antes de decrypt e novamente depois da
validação assíncrona, antes de devolver conteúdo. Revogação durante a leitura
descarta o resultado. Revisão autorizada posterior não altera o CAS original.

Serializer JSON do codec é reutilizado em passagem linear, com partes até
64 KiB. Não criar JSON/ArrayBuffer completo ao gravar, teto de 8 MiB/128 partes
ou normalização de valores, ordem, presença, BOM, Unicode e CRLF. Na recuperação,
o texto decodificado e o JSON reconstruído ocupam memória do navegador.

Cada parte usa AES-GCM com nonce aleatório independente. AAD liga domínio,
versão, identidade inteira, seção, geração, tamanho, contagem e índice. O
manifesto com SHA-256 dos bytes fica cifrado no índice -1. Headers contêm
controles, contagens, estados e fingerprints operacionais; não contêm prosa,
hash direto do corpo do journal ou sua chave.

## IndexedDB, atomicidade e concorrência

Banco writer.book-lore-journal separa heads e frames. Headers por UID/writeId;
frames por UID/writeId/seção/geração/índice. Descoberta lê somente heads,
com faixa da conta e páginas até 50. Frames nunca são varridos para listar.

Cada alteração de header e seus frames compartilha transação e só confirma
em oncomplete. Web Lock curto por identidade e stamp CAS impedem aba antiga
de sobrescrever. Abrir explicitamente reclama o journal e invalida handles
anteriores, sem enviar/decriptar. Sem lock durante rede ou await de crypto
dentro de transação. Sem fallback desprotegido.

Selagem incompleta permanece descoberta/preservada. Prefixo parcial só aceita
continuação com o mesmo manifesto cifrado. Se todas as partes já foram
gravadas e o último commit de selagem falhou, a leitura verifica AES/AAD,
tamanho/SHA/UTF-8/JSON/schema/intenção e autorização fresca; então conclui a
selagem local por CAS/oncomplete antes de expor texto ou unidade pendente.
Partes ausentes/corrompidas não são descartadas nem declaradas salvas.

## Pedidos, resposta perdida e cancelamento

Wire fechado reutiliza a whitelist dos métodos manuais. Validar campos e
controles, congelar o pedido antes de await, cifrar a unidade inteira e
confirmar armazenamento antes de chamar o port. Unidade tem limite de 256 KiB,
compatível com RPC limitado; rascunho não herda esse teto.

Fingerprint operacional da unidade não substitui a comparação exata de bytes:
o manifesto cifrado recusa outro corpo mesmo com controles idênticos.
Nunca substituir pedido incerto por outro. Pedido confirmado pode ceder lugar
a nova unidade; confirmação explícita pelo consumidor só depois de validar a
resposta, sem tratar commit local como recibo nativo.

Produção e cleanup têm slots separados; diagnóstico metadata tem slot próprio,
para consultar sem sobrescrever cancelamento cuja resposta se perdeu.
Get/cancel/cleanup são reconstruídos só de controles fechados, sem chave.
CancelRequested é monotônico, bloqueia produção e preserva cleanup mesmo
com signal abortado; guard de conta/contexto continua obrigatório.

Nada envia ao abrir/recuperar. Não há descarte automático, revoke automático
ou reconstrução de todo o coordenador. O consumidor ainda precisa persistir
checkpoints e controles de todos os jobs e provar fechamento nativo antes de
oferecer coleta local. A integração da remoção física da chave na exclusão do
livro também continua pendente. Nenhuma autorização de rollout decorre disso.

## Evidência e portões

Vitest usa WebCrypto real e harness de eventos/atomicidade para IndexedDB.
Chromium usa IndexedDB/Web Locks reais, reinício do processo e reload, com
serviços servidor reais sobre double transacional e identidade fictícia.
Isso não certifica login/App Check reais, Rules ou interface final.

Demais writers/consumidores/backup/ativação, P1/F2-09/V2, fases 3–5 e condições
humanas/comerciais continuam abertos. Validate integral no fechamento de P1;
somente commit local, sem CI/push/deploy.
