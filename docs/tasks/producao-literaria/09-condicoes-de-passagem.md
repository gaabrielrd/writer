# Condições nativas de passagem entre capítulos e atos — núcleo servidor

Incremento de E4 sobre a principal incorporada b9fc03c. O plano integral permanece
ativo. Este bloco implementou os pré-requisitos nativos. A
[seleção na interface](10-selecao-de-passagem.md) foi conectada no incremento seguinte;
o coordenador de execução entre múltiplos capítulos continua pendente.
A política tipada de publicação anterior obrigatória também permanece pendente; texto
livre no contrato não é interpretado como autorização ou regra executável.

## Contrato

getLiteraryWorkflowScope e startLiteraryWorkflow aceitam passage opcional, com
previousWorkflowId e actIntegrationId opcional. O autor escolhe o predecessor; não há
número fixo de capítulos/atos nem detecção por nome. Ciclos independentes existentes
mantêm seus fingerprints e seu comportamento. A opção não constitui autorização global
para escrever outros capítulos.

O preflight captura no servidor os nascimentos do ciclo anterior, capítulo, revisão e
das duas versões preservadas. Confere ator, livro, contrato, conclusão integral das duas
camadas de revisão, aceite e origem atual do manuscrito. A ordem nativa de capítulos e
atos deve avançar. Esses dados entram no expectedScopeToken congelado antes do registro;
retry e confirmRegistration não trocam as fontes observadas.

Ao sair de um ato, a passagem exige uma integração integral aceita desse ato, sem
bloqueios não tratados, com unidades e análises verificadas e síntese final confirmada.
A origem nativa do capítulo/ato cobertos é reconferida pelo registro de integração do
capítulo, além do fence conservador da raiz. Um ato recriado com o mesmo ID não herda a
aprovação. O relatório não é iniciado ou aceito automaticamente por este pré-requisito.

## Execução e recuperação

As condições são reconferidas antes da passagem preparação → primeira versão e nos
guards dos filhos, inclusive antes do commit de prosa/crédito. Alterar o predecessor ou
recriar seus recursos impede uma aplicação tardia e leva o ciclo a stale. Cancelar ou
pausar a instância original continua possível quando a condição de passagem se invalida;
nenhum desses controles concede nova execução ou reconcilia silenciosamente a fonte.

A integração do ato é um certificado da entrada: precisa estar atual até cruzar essa
fronteira. Depois dela, as próprias gravações do próximo capítulo podem avançar o fence
global sem desfazer a entrada já confirmada. Isso não declara o relatório anterior como
análise atual do livro modificado. O predecessor imediato e as identidades/posições
continuam sendo conferidos; não se alega auditoria transitiva de todo o livro. Consultar
o ciclo anterior após uma gravação de histórico no novo capítulo pode solicitar uma
reconferência de preservação, sem invalidar uma entrada já confirmada quando a prosa e
as versões observadas continuam as mesmas.

O leitor de origem da revisão foi extraído para literaryReviewSource.mjs, com o reexport
original preservado. A identidade de nascimento foi extraída para
literaryWorkflowOrigins.mjs. literaryWorkflowPassage.mjs reutiliza esses leitores; não
há cópia da lógica de hash de revisão, varredura sem paginação, leitura de prosa para a
condição ou chamada ao provedor. Sem nova coleção, índice, dependência ou callable:
422 ações nos mesmos setores.

## Evidência e trabalho restante

A suíte do ciclo cobre passagem real entre dois capítulos, passagem real entre atos
após leitura/aceite da integração, replays sem novo débito, fonte alterada durante o
provedor, origem recriada, ordem reversa, payload extra e cancelamento após invalidação.
Os resultados finais e logs estão no [relatório](validacao-local-2026-11-02.md).

A seleção legível e paginada das condições está disponível pelo incremento10.
Próximo requisito: execução coordenada de múltiplos capítulos com autorização, orçamento agregado, pausa,
checkpoint e recuperação sem ampliar o consentimento. Depois concluir os aceites de
E4, auditorias E1/E2/E3 e E5 (impacto e restauração editável como nova cópia privada).
O rulebook também exige bloquear a próxima unidade quando a política obriga publicar a
anterior primeiro. Esse critério deve ser ligado a uma política explícita e à confirmação
terminal nativa, sem inferência por texto livre nem publicação automática.
Nenhuma das cinco etapas está formalmente encerrada; o gate global continua pendente.
