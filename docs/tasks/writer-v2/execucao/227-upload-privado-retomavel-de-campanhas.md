# P3 — Upload privado retomável de campanhas

- Data: 2026-10-29.
- Base: bf6bb14; [inventário C4](226-inventario-c4-das-campanhas-restauradas.md) e validate integral 219–226 verdes.
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK; sem ativação/UI.

## Entrega e aceite

Persistir um arquivo de campanha por blocos, retomar por identidade nativa,
conferir SHA-256 completo e permitir cancelamento/coleta limitados. Compor a
fonte persistida com o revisor existente em teste real assinado. Não ativar
campanha nem conceder origem por upload, hash ou assinatura.

## Contrato fechado antes do produtor

- users/UID/campaignRestores/RID guarda job fechado e seus chunks cifrados.
  users/UID/campaignRestoreOperations/OID guarda recibos imutáveis mínimos.
  users/UID/campaignRestoreKeys/RID guarda chave privada de servidor.
  users/UID/campaignRestoreStartFences/RID fecha start desconhecido.
  campaignRestoreReservations/CID reserva permanentemente o alvo derivado
  no servidor. campaigns/CID é marcador privado pending/retired, sem ownerId,
  título ou conteúdo: não aparece no Estúdio nem permite escritores nativos.
- Job, reserva, marcador e recibo inicial nascem atomicamente. Leituras
  conferem nascimentos exatos, imutabilidade dos recibos/reserva/chunks,
  atualização do job contra o recibo mais recente e jobToken por encarnação.
  Toda mutação ativa consulta a reserva C4. Criação nativa consulta também
  a reserva de restauração, inclusive se o marcador desaparecer.
- Upload aceita somente formato writer-campaign-backup/framing 1, bytes >=16,
  SHA-256 e operationId fixos. CID é derivado no servidor, nunca enviado.
  Limite de tamanho segue contagem uint32 de blocos de 64 KiB, sem truncagem.
- Um append escreve exatamente o próximo bloco e recibo, com hash de bloco
  e bytes base64 canônicos. SHA incremental usa hash-wasm já instalado;
  estado e bytes ficam cifrados por AES-GCM com AAD de conta/job/encarnação/
  unidade. Nenhum segredo ou payload vai a recibos/progresso.
  Último bloco resulta em bytes-verified ou rejected; não certifica conteúdo.
- Get retoma por RID e token opcional. Replay confirma recibo original e
  progresso atual sem repetir efeitos. Conflito não troca pedido silenciosamente.
  Fonte interna de leitura usa somente bytes-verified, offsets limitados e
  reconfere job/key/chunk/recibo; cancelamento invalida leituras subsequentes.
- Cancel revoga chave antes da coleta, sem ler payload. Cleanup retira até
  25 chunks por etapa com metadata/recibo e confirma ausência final; preserva
  estrangeiros/inconsistências sem avançar. Terminal conserva marcador/reserva
  e recibos mínimos. Resolver start desconhecido cria fence que vence atraso.
- Rules negam SDK às famílias novas e filhos. Sem endpoint público neste
  incremento; a composição de Functions/cliente e revisão têm entregas próprias.

## Sequência

1. Contratos puros, identidade, reserva/guard e inventário de coleta.
2. Store/recibos/cifra e cancelamento/coleta antes do produtor de append.
3. Start/status/fence/append e fonte interna; guards Studio/captura.
4. Testes de serviços reais: upload pequeno/múltiplos blocos, retry/CAS,
   reinício de serviço, rejeição de hash, arquivo assinado revisado, corrupção/
   recriação nativa, cancelamento/fence sem payload, coleta paginada/órfãos,
   isolamento/rollback/barreira C4 e Rules.
5. Checks dirigidos, revisão, ADR/AGENTS/inventário/evidência e commit local.

## Relação com C4 e limites

Nesta etapa não existe campanha ativa: C4 público não inicia sobre marcador
sem ownerId. Recursos temporários têm cancelamento/coleta e reserva próprios
antes da primeira gravação; mutações consultam a barreira C4. Não alterar C4
1–4. Antes da futura ativação, integrar a coleta destes jobs à nova versão
C4 apropriada e provar seu encerramento após excluir uma campanha ativa.
Esta etapa não declara os novos recursos cobertos pelo layout v4.

Ainda faltam revisão persistida/autorização atual, remapeamento/materialização,
mídia, ativação e Estúdio/ciclos. Macro 8/35 e P3/D/F2-09 abertos. Testes
dirigidos; próximo validate integral no fechamento do novo bloco persistente.
Sem agentes/CI/push/PR/merge/deploy; preservar servidor manual e master.

## Ajuste de leitura do framing antes da validação

O leitor do contêiner solicita metadata e payload juntos. A fonte persistida
aceita até maxMetadataBytes + maxPayloadBytes por leitura (278.528 bytes),
composta de poucos chunks cifrados; append continua limitado a 64 KiB.
Isso preserva frames válidos sem reunir o arquivo inteiro em memória.
Recibos ganham testemunha imutável mínima em job/receipts/OID para conferir
nascimento/hash do recibo sem depender da ordem das propriedades de mapas.
Essas testemunhas não guardam payload e permanecem no terminal mínimo.

## Compatibilidade do checkpoint de hash

O job fixa sha256/hash-wasm@4.12.0 como codec do estado incremental cifrado.
Presença desconhecida falha fechada, sem reinterpretar bytes de outra versão.
Contas mantêm o limite existente de 128 caracteres Unicode, sem encurtar IDs.

## Resultado local

Núcleo descrito implementado, sem callable/UI. 49 novos e 50 regressões passaram
(99/99), mais 19 casos SDK/Rules distintos; três novos SDK revalidados no codec
final. Fonte cifrada passou na revisão completa de arquivo real assinado/UTF-8 longo.
ESLint dirigido e sintaxe de 457 módulos positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-upload-privado-retomavel-de-campanhas.md)
registra escopo, resultados e limites. Suite integral fica para o novo bloco;
9.710 testes de bf6bb14 são baseline anterior, sem atribuição ao código novo.
Próximo: revisão persistida/autorização, materialização e ativação com C4 próprio,
Estúdio e ciclos. Macro 8/35 continua aberta; somente commit local.
