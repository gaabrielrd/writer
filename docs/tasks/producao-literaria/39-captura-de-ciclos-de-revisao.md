# Incremento 39 — captura interna dos ciclos de revisão

## Critérios e limite

Preservar solicitação, cobertura técnica e associações históricas dos ciclos de
revisão por capítulo. Não duplicar os achados/citações dos pedidos de prosa,
reativar execução ou usar metadata como autorização para abrir texto derivado.

As famílias internas review-job, review-unit e review-analysis elevam a captura
a dezessete famílias. bookEditorialReviewCapture não é endpoint público. Produtor,
upload e restauração editorial v2 continuam fechados; o objetivo inteiro mantém
0/5 etapas formalmente encerradas.

## Gate sem mutação

inspectLiteraryReviewSource compartilha a inspeção nativa de origem sem retirar
ou alterar o job. O fluxo interativo continua marcando stale e retirando aceite
quando a origem muda; o backup somente representa a indisponibilidade. Cada parte
e conferência final repetem autorização e projeção pelo capturador existente.

O relatório agregado só fica disponível quando a origem do capítulo ainda é a
registrada. A mudança dessa origem não revoga automaticamente cada relatório
histórico de prosa: essas referências passam pelo gate independente de Prose.
O leitor de associações não abre o cache de prosa nem copia suas citações.

## Identidade e vínculos

Novas unidades recebem a identidade de nascimento nativa do job. Novas análises
registram os nascimentos de job, unidade e pedido de prosa na mesma transação que
registra a análise e os contadores. Ausência de pedido é explicitamente null;
ela não autoriza observar uma encarnação futura como se fosse a original.

captureBinding é privado e aditivo. A lista pública de análises mantém o DTO
anterior por projeção explícita. Os testemunhos nativos não entram no arquivo,
não são grants e não substituem autorização vigente. Não há backfill com os
nascimentos observados hoje para registros antigos sem vínculo.

IDs portáteis incluem livro e seu nascimento, nascimento do registro, família e
papel. O helper de identidade de Prose foi extraído sem alterar seu digest.
Associações com o pedido usam o mesmo ID do relatório na família prose. Antes de
ler o cabeçalho do pedido, o capturador compara seu nascimento por leitura somente
de schemaVersion. Pedido recriado mantém a referência original indisponível;
ausência explícita de testemunho nem sequer consulta o pedido atual.

Referências a job/unidade conferem nascimento e metadados de associação originais.
IDs legados sem prova recebem referência desconhecida e indisponível. O estado
recorded de uma associação continua sendo procedência, não grant de conteúdo.

## Artefatos e cobertura

Cada registro gera no máximo três artefatos em 1 MiB, transferidos pelas partes
existentes de 64 KiB. O futuro host deve desmembrar os bundles.

- Job: checkpoint desabilitado, documento com instrução/configuração e decisões próprias, relatório técnico agregado ou indisponibilidade.
- Unidade: checkpoint desabilitado ligado ao job e à cena registrada.
- Análise: relatório técnico de leitura ligado ao job, unidade e relatório original de Prose, sem duplicar evidências.

O checkpoint admite o contador analyses. A cobertura agregada usa chapter-scenes;
se o censo não terminou, o total pode ser apenas o prefixo enumerado. Cobertura
não certifica qualidade literária, aceite autoral ou permissão de publicação.
A análise preserva os limites exatos do segmento nativo, sem sourceToken portátil.
Configuração efetiva é histórica e pública, sem credenciais ou controles.

O cancelamento anterior ao primeiro envio gera somente checkpoint canceled, sem
capítulo, instrução ou resultado fabricados. Todos os artefatos ficam privados,
sem lineage adotada e com execução desabilitada na futura restauração.

## Casos preparados e estado

Foram preparados quatorze casos Node e dois de SDK real, sem execução. Cobrem o
fluxo nativo com duas camadas, identidade entre famílias, censo parcial, deriva do
capítulo sem escrita, revogação, legado sem vínculo, recriação de job/unidade/
pedido, testemunho ausente, cancelamento anterior ao envio, IDs inconsistentes,
privacidade, reconferência final e remapeamento sem reativação.

Houve leitura e revisão manual das alterações. Nenhum teste, typecheck, lint,
formatter, build, browser, coverage, validate ou diff-check foi executado neste
incremento. A rodada anterior sobre b666233 não valida os incrementos 37–39.
Não há commit literário, integração de volta, push ou deploy.

## Continuidade obrigatória

Capturar Integration/RequestRead, ReaderGuide/publicationManifest e os checkpoints
históricos restantes de redação, marcos, workflows, sequências e impacto conforme
seus gates nativos. Resolver vínculos sem inventar origens. Compor o host produtor
com stream, pressão de consumo, censo, provas finais, footer/selo e arquivo
provisório. Implementar restauração útil com inventários, cleanup, ativação atômica
e revisão da UI. Auditar os aceites E1–E5, incorporar novamente a principal antes
da rodada final e executar os gates integrais, incluindo cobertura de 90% e Rules
completas. Estes passos permanecem dentro do objetivo original.
