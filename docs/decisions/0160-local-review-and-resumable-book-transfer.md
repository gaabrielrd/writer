# ADR 0160 — revisão local e transferência retomável de livros

## Estado e contexto

Aceita em 2026-10-25, implementação parcial do
[plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md).
A aplicação precisa inspecionar o arquivo e preservar um início sem resposta
antes que exista a chave de recuperação do servidor.

## Decisão

Inspecionar Blob por intervalos, com formato reconhecido pelo header, validadores
atuais/legados e índice temporário existente. Congelar guard/signal/fonte e produzir
somente metadados da revisão, ausências e políticas aprovadas. Hash completo
vincula os bytes; revisão não guarda nome do arquivo, título, prosa ou imagens.
Revisão positiva local não autoriza criação da raiz.

Antes de start, guardar em writer.book-restore.starts um registro fechado:
schema/stamp e intenção com UID/operationId/origem/reviewHash. Essa metadata
não é uma cópia do manuscrito ou credencial; antecede a chave servidor e fica
separada do journal cifrado da preparação. CAS compara o registro inteiro.
Paginar por conta/ID, recusando dados locais inválidos sem apagá-los.

Sessão persiste antes de RPC, reenvia start exato após perda de resposta e limpa
somente por confirmação original ou fence próprios. Se resolveStart retornar
um job já existente, não chamar isso de cancelamento: esse job exige protocolo
durável de cancelamento separado. Leitura de job/página projeta metadata e
confere identidade derivada de origem/fingerprint, UID, token, datas e contadores.

Upload verifica arquivo/fingerprint contra a origem e revisão do job, cria a
chave quando necessária e envia até 64 KiB por unidade. Enquanto uploading,
checkpoint original é o índice do append; chave não muda checkpoint.
OperationId deriva de namespace versionado, identidade completa e índice.
Recibo original precisa confirmar sequência, checkpoint, bytes e ação.

Durante a instância, pedido sem resposta é repetido exatamente antes de
selecionar outro. Após recarga, exigir arquivo correspondente, conferir hash e
consultar o prefixo nativo autorizado; não guardar chunkBase64 no dispositivo.
Duas cópias atrasadas do mesmo índice usam o mesmo fingerprint e não duplicam
bytes. Cancelamento/conta inválida impedem novos efeitos. Nunca ativar a raiz.

Ao retomar job existente, conservar seu reviewHash original; reabrir o mesmo
arquivo verifica descritor/hash, não substitui a confirmação anterior por um
novo hash de apresentação. Revisão final de ativação continua explícita.

## Consequências e limites

Inspector, sessão inicial/getters e driver de upload são APIs públicas da feature.
Default Firebase só inicializa ao chamar transporte. Guards suprimem respostas
tardias; CAS perdido não apaga controle de outra tentativa.

Navegador real percorre arquivo, dois reinícios, respostas perdidas, HTTP da chave
e preparação até revisão, com OPFS/IndexedDB/Web Locks reais. Identidade/SDK
callable são simulados; serviços/handler HTTP de chave são reais com banco em
memória. Não é prova de credenciais, latência ou implantação de produção.

Não há UI ainda nem controlador durável de revisão/ativação/mídia/limpeza/cancel
de job. Roundtrip integral e demais P1/fases/gates continuam.
[Evidência](../entregas/2026-10-25-writer-v2-inspecao-inicio-e-envio-de-backups.md).
