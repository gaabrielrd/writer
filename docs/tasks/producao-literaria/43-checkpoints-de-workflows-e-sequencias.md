# Incremento 43 — checkpoints históricos de workflows e sequências

## Critérios e limite

Preservar instrução própria, configuração pública, limites, fases autorizadas no
histórico, contagens e associações dos ciclos de capítulo e sequências. Não chamar
controladores mutáveis, avançar trabalho ou transportar autorizações operacionais.

Implementado bookEditorialOrchestrationCapture com workflow-job e sequence-job,
totalizando 30 famílias internas. Não há endpoint novo, produtor ou restauração
editorial v2 habilitados. O objetivo integral continua ativo e 0/5 etapas estão
formalmente encerradas.

## Identidade antes de conteúdo

A primeira leitura usa somente schema, jobId, ator, nascimento do livro, registro
e nascimento próprio do ciclo. Ator e origem do livro precisam corresponder ao
contexto autorizado. Para registros active, o nascimento próprio registrado precisa
corresponder ao documento nativo atual. Schema desconhecido fica explicitamente
indisponível; registros de outro ator ou outra encarnação não abrem configuração.

Somente após essa conferência o capturador seleciona instrução, limites e demais
campos próprios. A identidade nativa precisa permanecer igual entre as leituras.
A mesma separação é aplicada aos registros associados: origem/ator primeiro,
metadata de associação somente depois. Não são selecionados bookTitle/chapterTitle
em cache nem corpos de prosa, persona, lore ou resultados de IA.

A captura não chama getLiteraryWorkflow/getLiterarySequence ou drivers. Esses
fluxos podem reconciliar estado e continuar trabalho. O novo leitor usa inspeção
metadata, sem escrita, débito ou nova geração. Cada parte e conferência final
repetem autorização/projeção pelo capturador comum.

## Artefatos históricos

Cada registro gera checkpoint privado com controlsDisabled true e nextAction null,
mais documento com instrução própria, modo de colaboração, modelo/raciocínio
solicitados, snapshot efetivo público e limites/fases historicamente registrados.
Limites e fases são texto do documento; não são DTOs de autorização reutilizáveis.
Pausa e stop são condições históricas, sem comandos executáveis.

Workflow conserva passos registrados. Contagens de aplicações/créditos anteriores
ficam identificadas como anteriores; o capturador não as apresenta como total atual
nem inventa saldo a partir de filhos cuja identidade não foi congelada.

Sequência conserva ordem dos capítulos selecionados, posição e lista concluída
coerentes, aplicações/créditos/passos agregados registrados e decisão histórica de
continuidade entre capítulos. O limite nativo de 25 capítulos é por execução;
não impõe limite de capítulos ao livro. Referências de capítulos exigem nascimento,
pertencimento e modo scenes compatíveis. Ausência/recriação fecha a referência,
sem apagar instrução ou decisões próprias já autorizadas.

## Associações conferidas e desconhecidas

IDs dos artefatos incluem livro/nascimento, nascimento nativo do registro, família
e papel. Workflows pertencentes a sequência usam a identidade de sequência que o
binding nativo congelou. A disponibilidade exige ator/livro, capítulo/index e
associação atual ou concluída correspondente. Sequências concluídas guardam a
identidade original de cada workflow; a captura compara esse nascimento antes de
selecionar a associação recíproca e usa o mesmo ID arquivístico do workflow.

Workflow recriado não substitui o ID original da referência concluída: a referência
fica unavailable. O mesmo vale para sequência ausente/recriada no binding do filho.
Essa conferência é procedência histórica, não reautorização de corpos ou execução.

Os ponteiros nativos de draft/review/marco do workflow e currentWorkflowId da
sequência não contêm, por si, nascimento congelado do filho. A captura preserva
essas intenções como descritores opacos e indisponíveis, sem adotar o documento
observado hoje como se fosse a encarnação original. Não fabrica backfill ou sucesso.
Completar relações quando houver prova original suficiente permanece na composição
do host; ausência da prova continua uma limitação explícita do histórico nativo.

Pins metadata acompanham capítulos, pais e filhos conferidos. Native IDs,
births, originToken/scopeToken, fingerprints, busyStep, revisões de controle e
DTOs de autorização não são serializados. O remapeador existente conserva
história privada/desabilitada e troca referências disponíveis pelas identidades
verificadas da nova cópia.

Bundles têm no máximo dois artefatos/1 MiB, transferidos em partes de 64 KiB.
O host futuro deverá desmembrar os registros e compor as associações conferidas.

## Casos preparados e evidência

Preparados 14 casos Node e dois de SDK real, nenhum executado. Fixtures nativas
cobrem registro, instruções/limites sem gerar texto, ordem/contagens, conclusão e
associação recíproca, recriação de workflow concluído, ponteiros sem nascimento,
perda de capítulo, ator errado/livro recriado, identidade própria, schema
não suportado, conclusão incoerente, privacidade, recheck final e remap privado.
Casos SDK conferem ausência de avanço/mutação e ordem do gate antes da seleção
de instrução/limites. O gerador do cenário SDK falha se for acionado.

Leitura e revisão manual somente. Nenhum teste, typecheck, lint, formatter, build,
browser, coverage, validate ou diff-check executado neste incremento. A rodada
anterior sobre b666233 não valida os incrementos 37–43. Sem commit literário,
merge de volta, push ou deploy. Nenhum processo de teste iniciado.

## Continuidade

Capturar os controles/checkpoints históricos de impacto pelos seus gates nativos
e completar associações com prova suficiente. Implementar host produtor com stream,
pressão de consumo, censo, provas finais, footer/selo e arquivo provisório confirmado.
Implementar restauração útil de contratos/planos e histórico privado com inventários,
cleanup, ativação atômica e revisão da UI. Auditar E1–E5, incorporar novamente a
principal antes da rodada final e obter gates integrais, cobertura 90% e Rules
completas. O objetivo não está restrito às fundações do backup.
