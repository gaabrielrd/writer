# Incremento 40 — captura interna da integração literária

## Escopo e critérios

Preservar solicitações próprias, cobertura técnica, relatórios, citações e
associações de síntese da integração de ato/livro e da auditoria arquitetural.
Aplicar os gates do leitor nativo antes de abrir resultados. Não transformar
síntese em nova leitura do manuscrito nem evidência de intenção em fato observado.

Implementados bookEditorialIntegrationCapture e as famílias integration-job e
integration-request, totalizando dezenove famílias internas. Não há novo endpoint
público, produtor, upload ou restauração editorial v2 habilitados. Checkpoints
continuam históricos, privados e com execução desabilitada.

## Origem e leitura sem escrita

inspectLiteraryIntegrationSource compartilha o gate nativo de sourceFence sem
alterar o job. A interface conserva sua transição stale e retirada de aceite.
O backup mantém a instrução e decisões próprias, mas representa o agregado e os
resultados como indisponíveis quando a origem muda. Esta regra é mais restritiva
que a leitura histórica de Prose e não é substituída pelo gate daquele fluxo.

O leitor de pedido usa metadata para conferir schema, estado, pai e configuração
de origem. Exige origem atual do job e authorizeLiteraryIntegrationRequest antes
de abrir literaryIntegrationResults. Essa função reautoriza unidades, manifestos,
guia e fonte arquitetural conforme o fluxo existente. Estados running/error/
canceled não abrem resultados; síntese arquitetural também exige job done.
O corpo precisa corresponder ao requestId/jobId/schema originais.

Cada parte e conferência final repetem a projeção. Pins incluem pai, origem,
resultado e identidades das dependências consultadas. Não há débito, nova chamada
à IA, escrita de estado ou reativação de pedidos na captura.

## Associações e nascimentos

Novos pedidos registram captureBinding privado com nascimento do job. Novas
sínteses registram os nascimentos dos pedidos de origem antes de criar o pedido.
Essas leituras precedem as escritas da transação. IDs portáteis usam livro e seu
nascimento, nascimento do registro, família e papel; testemunhos não entram no
arquivo nem concedem acesso ao conteúdo.

Um job recriado não autoriza o pedido com vínculo antigo. Uma dependência recriada
mantém o ID portátil original indisponível, sem copiar a encarnação atual. Registros
legados sem testemunhos usam referências desconhecidas e indisponíveis; não há
backfill pela cabeça observada hoje. Seus resultados ainda passam pelos mesmos
gates nativos, mas a configuração do pai não é atribuída como snapshot original
sem testemunho suficiente. DTOs públicos existentes não expõem captureBinding.

## Conteúdo preservado

- Job: checkpoint, documento de solicitação/configuração e aceite histórico próprio, agregado técnico ou indisponibilidade explícita.
- Leitura: relatório de achados, matriz e evidências com citações/offsets UTF-16 efetivamente registrados.
- Transição: relatório de janela entre capítulos, sem inventar cobertura de segmentos ou capítulos inteiros.
- Auditoria arquitetural: evidências no texto de JSON canônico fornecido, preservando certeza como interpretação/incerteza.
- Síntese: relatório com associações por achado e conclusão aos relatórios fornecidos, sem fabricar citações literais.

O contrato portátil permite reportSources em cada achado/observação. São referências
a artefatos report do próprio livro, distintas de evidenceIds. O verificador
semântico compartilhado exige alvo report e o remapeador preserva as associações
na nova identidade privada. Referências indisponíveis conservam essa condição.

O contexto de evidência admite plain ou canonical-json, com documentId histórico
e base de offset nativa. Esses campos não são loaders ou grants. As citações são
os registros normalizados pelo produtor nativo; a captura não inventa novo offset
por indexOf. O manuscrito inteiro não é duplicado. Evidências iguais no mesmo
relatório são reutilizadas sem alterar vínculos dos achados/matriz.

Para fontes editoriais sem identidade portátil conferida, a referência fica
indisponível, preservando a citação autorizada e seu contexto lógico sem promover
IDs físicos a autorização. Cobertura unit-segment, chapter-boundary,
architecture-segment e evidence-synthesis permanece distinta. Limites de segmento
registrados omitem sourceToken. Síntese preserva a contagem de relatórios fornecidos
e não soma essa contagem à prosa lida. O agregado registra censo parcial quando
incompleto e não certifica qualidade, aceite vigente ou publicação.

Configuração pública efetiva é congelada a partir do job original conferido.
Seleção solicitada automática é representada como tal; não há chaves, budgets,
recibos, inputHash, cursores ou controles no arquivo. Cancelamento anterior ao
primeiro envio gera apenas checkpoint, sem conteúdo ou alvos inventados.

Bundles de revisão de integração são limitados a 242 artefatos e 2 MiB, comportando
até 240 citações nativas dos achados/matriz, com partes de 64 KiB. O futuro host
precisa desmembrá-los em registros editoriais individuais.

## Casos preparados e limite da evidência

Preparados 23 casos Node e três de SDK real, sem execução. Cobrem fluxo nativo,
cobertura/solicitação, citações/offsets, transições, sínteses e relações por linha,
deriva de origem sem escrita, gate das unidades, estados sem resultado,
cancelamento antes de envio, legado, recriação de pai/dependência, restrição de
síntese arquitetural, censo parcial, schema/identidade inválidos, privacidade,
recheck final, remapeamento privado, alvo semântico report, partes e JSON canônico.

Leitura e revisão manual somente. Nenhum teste, typecheck, lint, formatter, build,
browser, coverage, validate ou diff-check executado neste incremento. Resultados
da rodada anterior sobre b666233 não validam os incrementos 37–40. Não há commit
literário, merge de volta, push ou deploy. Nenhuma das cinco etapas é declarada
formalmente encerrada.

## Trabalho restante

Capturar ReaderGuide/publicationManifest e checkpoints históricos restantes de
redação, marcos, workflows, sequências e impacto com seus gates nativos. Completar
associações com fontes já capturadas sem inventar origens. Implementar o host
produtor com stream/pressão de consumo, censo, provas finais, footer/selo e arquivo
provisório confirmado. Implementar restauração útil de contrato/planos e histórico
privado com inventários, cleanup, ativação atômica e revisão da UI. Auditar E1–E5,
incorporar novamente a principal antes dos testes finais e obter os gates integrais,
incluindo cobertura 90% e Rules completas. O objetivo original permanece ativo.
