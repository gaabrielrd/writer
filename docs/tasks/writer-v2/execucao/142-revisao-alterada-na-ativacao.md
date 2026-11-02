# P1 — recuperação após mudança da revisão de ativação

## Objetivo e descoberta

O plano 31 exige reapresentar revisão quando o vínculo de universo muda.
EffectSession preserva corretamente pedido incerto, mas activation-review-changed
não gera recibo nem avança checkpoint; reconcile unknown no mesmo checkpoint
não pode apagar intenção. Isso prende revisão/cancelamento no host atual.

Grafo falhou na indexação fast anterior; descoberta pelos arquivos reais
bookRestoreActivation/Upload/Callable/Contracts, EffectSession e useBookRestore.
Sem reduzir garantias de pedido original, conta ou CAS.

## Contrato antes do código

1. Novo comando fechado retireBookRestoreActivation recebe exatamente o pedido
   original de activateBookRestore (ID, jobToken, operationId, expectedCheckpoint,
   reviewToken). Ele arbitra com ativação pela mesma operação e transação nativa.
2. Se operação original já tem recibo, devolver esse recibo autenticado (ativação
   ou retirada), sem nova escrita. Caso contrário exigir content-verified,
   activation-ready/schema13 e o mesmo checkpoint; avançar checkpoint e gravar
   recibo action retireBookRestoreActivation, sob o mesmo operationId e fingerprint
   da ativação original, atomicamente. Estado/preparação permanecem privados.
3. Nenhuma raiz/contagem/universo/capa/perfil/chave é alterada. Nova revisão terá
   novo checkpoint e token. Replay da ativação antiga recebe o recibo da retirada,
   nunca executa posteriormente. Token/hash diferente com mesmo ID falha.
4. Comando só recebe o próprio pedido, não fingerprint arbitrário. Servidor deriva
   fingerprint original. O recibo usa campos existentes e ação explícita distinta;
   leitor de operações aceita essa ação content-verified e valida preparação.
   Resolver original e ativação reconhecem o mesmo desfecho histórico.
5. Cliente chama retirada somente após erro definitivo activation-review-changed
   da ativação original. Rede/timeout/erro diferente preservam intenção. Mesma
   metadata local basta: comando usa o pedido original, não cria segunda intenção.
6. Só apagar journal por CAS após recibo de ativação/retirada conferido ou prova
   monotônica já existente. Se resposta da retirada perder, restart repete ativação
   original e encontra recibo; não duplica efeito nem troca operationId.
7. Host reapresenta revisão atual e exige clique explícito de ativação. Nenhum
   unknown no mesmo checkpoint, isoladamente, autoriza apagar intenção.

## Sequência e arquivos

- [x] Serviço servidor/contratos/callable/registro e leitor de recibos.
- [x] EffectSession/contrato callable e testes de retomada/conta/CAS.
- [x] Testes Node e SDK da arbitragem/replay/isolamento e UI da revisão renovada.
- [x] Checks dirigidos, revisão, ADR/docs/evidência e commit local.

Arquivos previstos: functions/src/bookRestoreActivation.mjs, bookRestoreUpload.mjs,
bookRestoreUploadContracts.mjs, index.mjs; EffectSession/EffectCallables e testes
existentes, harnesses de cliente que fornecem API simulada, sem storage/schema
novo no navegador. Ajustar registro em contrato de comandos e testes existentes.

## Aceites, riscos e limites

Conferir os dois vencedores da corrida (ativação/retirada), repetição idêntica,
resposta perdida/cold restart, conta errada, ABA/CAS, origem que volta a ficar
disponível e revisão nova confirmada explicitamente. Recibo não concede leitura.
Não limpar dado próprio, aceitar hash arbitrário ou reaproveitar ID para outro pedido.

Sem CI, push, PR, merge, deploy, dependência ou subagente. Validate no fechamento
de P1. Inventário geral, migração/certificação v1, coleta, rollout e fases/gates
continuam pendentes; nova API precisa de rollout coordenado cliente/Functions.

## Dependência do selo observada antes da correção

A primeira execução mostrou que avançar checkpoint isoladamente invalida a
igualdade exata do selo de auditoria. Não relaxar igualdade nem ignorar prova.
Extrair verificador interno do selo/âncora já usado pela revisão. Retirada confere
o selo atual, copia preparação e troca somente audit.sealOperationId para a
própria operação, atomicamente com checkpoint e recibo. Esse recibo pode servir
como novo selo somente por ter passado pelo verificador anterior e por conter
a mesma preparação congelada (exceto identidade do selo). Revisão aceita ações
advanceBookRestoreAudit/retireBookRestoreActivation com checkpoint/preparação
exatos e nascimento nativo original. Retirada repetida mantém prova histórica.
Nenhum catálogo é revarrido nem há cadeia ilimitada de leituras.

## Recibos históricos após renovar o selo

A prova no browser chegou à ativação nova, mas a limpeza dos recibos rejeitou o
selo anterior por identidade diferente. Leitor histórico admite essa transição
somente para recibo advanceBookRestoreAudit/retireBookRestoreActivation, ambos
audit done, selo anterior igual ao próprio operationId, checkpoint estritamente
anterior e todo o audit congelado idêntico ao atual exceto sealOperationId.
Demais diferenças/ações/contagens continuam recusadas; arquivamento continua
conferindo nascimento imutável anterior à ativação. A ativação nova já certifica
o selo exato atual; não aceitar apenas um hash fornecido pelo cliente.
