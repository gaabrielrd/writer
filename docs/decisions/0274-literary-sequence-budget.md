# ADR 0274: Orçamento de execução ligado ao commit nativo de prosa

Status: núcleo, driver, outcomes, cliente, recuperação, UI e registro por setor implementados; gate global e aceites integrais pendentes.

## Contexto

Somar recibos no cliente depois de escrever permite ultrapassar um orçamento entre
capítulos, duplicar contagem após resposta perdida ou continuar com um filho após
pausar o conjunto. O ciclo de um capítulo e seus escritores já têm revisão, recibo e
proteção de origem; a coordenação precisa compô-los na mesma fronteira transacional.

## Decisão

Capturar seleção ordenada e identidades nativas em literarySequenceJobs privado.
Separar registro de ativação pelo nascimento real e conservar reserva metadata em
literaryOperations. Vincular cada ciclo por hook interno, com ator, pai, índice,
orientação e snapshot de geração fixos. Conferir o escopo e o saldo no servidor.

Atualizar consumo de aplicações/créditos junto com prosa/débito/recibo, usando o hook de
commit existente. Passos novos dos ciclos consomem o contador compartilhado; replays
não repetem o gasto. Propostas geradas sob esse grant carregam um executionBinding
privado e exigem aplicação pelo ciclo original. Rotas genéricas não podem retirar a
proposta do seu ledger. Pausa/cancelamento fecham pai e filhos atomicamente.

O núcleo não cria nova Function nem ação pública. Só habilitar o driver após integrar
operações identificadas, outcomes e recuperação metadata, controle de respostas tardias
e interface de consentimento. Seleções são limites de execução, sem número narrativo
fixo para um livro. Não restaurar grants em pacotes portáteis.

## Consequências

Há uma coleção privada nova, incluída na exclusão bounded e nas Rules antes de expor
produtores. Limites/fases puros ficam em literaryExecutionContracts, preservando os
reexports atuais. A autorização por capítulo continua disponível; somente os ciclos
explicitamente vinculados compartilham o orçamento. Uma operação autoral independente
não é contabilizada retroativamente como se fosse um filho da execução.

A revisão/integração não é deduzida de contadores de palavras. Completar a unidade
reconfere revisão aceita, versões e origem; a seleção final não inicia outro volume.
Detalhes, pendências e evidência: [núcleo agregado](../tasks/producao-literaria/11-orcamento-agregado-nativo.md).

## Driver serial interno

O incremento12 registra a ação antes do produtor, congela o wire e compõe um avanço
nativo por comando. Controles e fechamento têm recibos atômicos; recuperação não deduz
aceite de texto por metadata atual nem inicia a unidade seguinte pelo replay. A consulta
retorna resultado histórico metadata, sem revelar wire ou rearmar grants. O registro
público continua pendente da bridge cliente/recuperação e interface de consentimento.

## Ponte cliente e retomada explícita

O [incremento 13](../tasks/producao-literaria/13-cliente-e-recuperacao-de-sequencias.md)
acrescenta cliente tipado, diário somente metadata com método/hash e sessão de
recuperação por conta/livro. Vincular requestHash ao fingerprint e ao outcome evita
encerrar uma intenção diferente com IDs/revisão iguais. Recibos sem hash conservam
seu replay nativo e não confirmam uma entrada cliente nova. Retomada recebe somente
IDs e usa o pedido original privado, nunca a seleção atual. A listagem é metadata e
paginada. O registro público das oito ações aguarda a UI explícita; hooks internos
permanecem fora do DTO e do catálogo de setores.

## Composição pública controlada

O [incremento 14](../tasks/producao-literaria/14-interface-e-setores-de-sequencia.md)
registra seis ações metadata/controle em planningApi e dois produtores em generationApi,
sem adicionar Function por ação. A UI exige prévia/consentimento e avanço separado;
checkpoints gerenciados conservam aceites autorais e deixam o avanço no pai. Retomada
em outro dispositivo usa apenas a correlação do outcome reautorizado, gravada localmente
antes da RPC. O catálogo tem 430 ações/16 setores. Policy de publicação prévia e gate
integral continuam pendentes; isso não autoriza rollout ou restauração de grants.
