# ADR 0275: Dependências do guia por versão nativa

Status: implementação local e testes preparados; validação e orquestração públicas pendentes.

## Contexto

O guia contém citações e relações dentro de arrays com texto literal. Um inventário
metadata não deve carregar essas citações para descobrir IDs, nem confundir o hash
literal da entrada com uma prova da origem do capítulo citado.

## Decisão

Criar `literaryPublicationGuideDependencies`, privada, com ID derivado de edição,
entrada e revisão. O produtor salva a versão imutável, o índice sem prosa e o
marcador dependencyIndexHash na mesma transação da entrada e do clock nativo.
O índice conserva IDs de capítulos e alvos explícitos, hash da entrada e revisão;
não conserva nomes, citações, descrições, credenciais ou grants.

Para versões novas, reconferir os nascimentos nativos conjuntos do índice e da
versão, o índice sem alterações e o marcador do header. A correspondência de
timestamps deve ser comprovada pelos testes com SDK real no fechamento.

Para versões legadas, separar preflight metadata de backfill explícito. Fixar o
token da versão, validar a cópia integral e canônica, e criar índice/marcador/clock
na mesma transação. O nascimento do índice coincide com a atualização do header;
o nascimento e stamp anteriores da fonte ficam preservados como procedência.
Retentativa original confere o token privado salvo e não regrava nada. Um índice
nativo ausente ou incoerente não é recriado pela recuperação legada.

O mapa confere a associação registrada, com origem do índice vinculada aos stamps
nativos atuais. Sem captura da encarnação/revisão do capítulo no momento da citação,
identidade e versão históricas dessa fonte continuam desconhecidas. O índice não
certifica leitura, qualidade, spoilers ou publicação; esses gates permanecem próprios.

## Consequências

Rules recusam SDK direto, índices automáticos ficam desabilitados e a exclusão do
livro coleta essa coleção antes de remover as versões. Não há nova Function ou
callable neste incremento. O controlador público deve autorizar a preparação de
índices separadamente da consulta, concluir o backfill antes de congelar o fence
do mapa e relatar lacunas. Não executar backfill ao montar/ler a interface.

Rollout exige writers, inventário de exclusão, Rules e índices coordenados,
com drenagem dos handlers antigos. Não transportar tokens/nascimentos em backup
como grants: uma restauração privada precisa criar suas próprias identidades e índices.

Detalhes e limites: [incremento 26](../tasks/producao-literaria/26-indice-das-dependencias-do-guia.md).
