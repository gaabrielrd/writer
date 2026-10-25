# Writer V2 — limpeza retomável após ativação

## Resultado e aceites atendidos

Serviço interno remove o arquivo original e a preparação privada após ativação
e conclusão da mídia. Progresso, exclusões e recibo são atômicos; retomada usa
revisão e cursor do servidor. Replay conserva confirmação antiga e mostra o
progresso atual. Operação nova depois da conclusão não repete writes.

Preserva livro, textos, fontes/corpos, histórico, lore, universo, biblioteca,
personas e provas originais de ativação/mídia. Journals dos recursos ativos são
removidos sem consultar ou modificar esses recursos. Chunks, provas, itens e
operações têm totais exatos; unidades usam páginas limitadas e até 18 writes.

Capa originalmente retirada pelo dono pode concluir mídia como unavailable,
sem I/O Storage ou reconstrução. Imagem ausente/recriada/em exclusão continua
recusada. Uma retirada durante o I/O invalida aquela tentativa; repetir somente
depois observa a remoção confirmada.

## Arquivos e contratos

Quatro módulos bookRestoreArchive separam serviço, contratos, armazenamento e
unidades; composição em bookRestoreUpload e leitor dedicado do journal em
bookRestoreArtifacts. Três módulos de mídia recebem o resultado unavailable.
Rules negam bookRestoreArchiveOperations. Testes/fixtures cobrem serviço,
compatibilidade e SDK. [ADR 0156](../decisions/0156-activated-book-archive-cleanup.md)
e [plano 135](../tasks/writer-v2/execucao/135-limpeza-pos-ativacao.md).

## Testes Node dirigidos

32 casos distintos positivos em seleções, sem uma rodada única global:

- Dois casos iniciais da limpeza, 2987.2175 ms: todas as famílias, totais exatos,
  metadata limitada, leitores normais, preservação de provas, retomada e replay.
- Dezoito casos negativos, 24642.0403 ms: conta/entrada/token/CAS/operação,
  controle/recibos/journals/alvos/chunks/provas/índices/itens/estado recriados,
  origem estrangeira, totais faltantes, órfão, livro editado/excluído,
  rollback/retry e resposta perdida sem executar a próxima página.
- Um caso nativo grande, 4151.619 ms: lore indexado de 600 KB e duas fontes
  congeladas próximas de 1 MiB; conteúdo ativo e perfis preservados.
- Seis formatos JSON legados v1–v6, 3191.781 ms: pipeline real até ativação,
  mídia e limpeza; recursos normalizados ativos permanecem iguais.
- Cinco casos de mídia, 4926.7514 ms: fluxo normal, ausência de capa, retirada
  durante espera, retirada confirmada e recusa de imagem recriada/em exclusão.
  Dois são novos; os demais foram repetidos pelo comportamento afetado.

Uma primeira tentativa de acrescentar testes foi recusada pelo helper de edição
porque o literal de import não coincidiu; nenhum arquivo foi alterado. A seleção
seguinte não encontrou os novos casos e não é evidência. Após aplicar a edição
correta, os 18 casos negativos acima foram efetivamente executados e passaram.

## Firestore SDK real

1/1 positivo, zero skipped, 189098.287 ms. Firestore Emulator 1.22.0 verificado,
projeto demo isolado em loopback; Admin, serviços e Rules reais.

Remoção normal da capa conclui unavailable sem I/O; edição da raiz pelo SDK
permanece após limpeza. Job, raiz, lote, perfis e conclusão de mídia conservam
dados e updateTime. Controle tem updateTime igual ao nascimento do último
recibo; 13 namespaces ficam vazios. Dono, outro e anônimo não leem controle ou
recibo por SDK. Leitores normais funcionam; replay de ativação/mídia permanece,
inclusive consulta histórica depois da exclusão normal da raiz. Controle
recriado é recusado sem mutar dados incertos.

Bucket em memória; não comprova Storage/Auth/Callable/App Check de produção ou
piloto humano. Runner/log QA externos m43-archive-sdk, sem artefatos grandes no Git.

## Verificações e limites

Formato, lint dirigido, arquitetura, documentação e diff verificados no
fechamento local. Revisão conferiu limites, autorização nativa, exclusões só sob
o job e preservação de recursos ativos/provas. Sem dependência ou endpoint novo.

Não houve nova UI. Vitest/browser/build/validate global não repetidos;
validate integral permanece no fechamento do grande bloco P1, conforme decisão
do operador. Opção de novas gerações indexadas permanece false.

Implementado o passo de limpeza interna. Host/UI, roundtrip integral de livro,
inventários/writers/exclusão/legados/rollout e validate de P1, fases 3–5 e
condições humanas/comerciais continuam obrigatórios. Compatibilidade v1–v6 acima
não substitui esse inventário completo. Somente commit local, sem CI, push, PR,
merge, deploy, subagentes ou operação de produção.
