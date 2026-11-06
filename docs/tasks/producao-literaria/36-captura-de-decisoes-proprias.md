# Incremento 36 — Captura de decisões próprias de achados e impacto

Estado: implementação interna local e testes preparados, sem execução. Nenhuma nova ação pública, Function, exportação ou restauração v2 habilitada.

## Campos próprios e campos derivados

bookEditorialDecisionCapture lê máscaras fechadas dos campos próprios. Decisões de achados preservam ação, estado nativo, justificativa, revisão, datas e nota/data de correção quando registradas. Não lê resultados da integração, rótulos em cache de baseline, sucessores, fences ou épocas para serializá-los como conteúdo.

Decisões de impacto preservam estado, justificativa e notas de evidência do autor. Essas notas viram evidências de interpretação, com quote vazio e offsets não registrados; não são apresentadas como citações de uma fonte. Checks, witnesses, rótulos e corpos do grafo não são abertos por esse leitor.

Essa política acompanha os getters nativos: a justificativa própria permanece disponível sem transformar o achado/check antigo em conteúdo novamente autorizado. Fontes não comprovadas ficam como descritores históricos indisponíveis.

## Histórico estruturado

O DTO decision admite references e annotation fechados. Annotation registra família finding/impact, ação, estado e tipo de destino. A correção histórica admite nota/data nulas quando ausentes; não cria uma confirmação vazia nem assume estado atual.

Os estados nativos investigating/planned/retained/deferred/correctionConfirmed são preservados sem conversão com perda para outro estado. reviewed/dismissed de impacto exigem evidências próprias. Combinações incoerentes de ação/estado e campos como effectiveRetention/confirmationCurrent são recusados.

Decisões versionadas recebem linhagem e IDs remapeados por nova cópia. A semântica preserva família, cabeça e revisão; referências de contexto não deslocam as posições tipadas de supersedes/evidenceIds. Todos os artefatos restaurados continuam privados, históricos, com execução desabilitada e revisão obrigatória.

## Referências e hashes

O vínculo ao relatório/check original é um descritor lógico indisponível, derivado em namespace próprio dos identificadores e provas originais. Isso não lê nem reautoriza o corpo derivado. Projetores das fontes precisarão reconciliar os vínculos sem promover um contexto recriado ou uma análise nova.

Destinos locais, lore e versões são conferidos somente por metadata. Contrato/ficha exige encarnação e revisão originais; fontes nativas exigem identidade/versão originais. Alteração mantém a observação antiga como indisponível, sem rebase. Ponteiros de histórico exigem metadata de versão do livro e hash/recurso compatíveis.

Foi conferido o contrato nativo de contentHash: proofKind reference usa um versionToken nesse campo. Esse valor não vai para o contentHash portátil. Somente hashes declarados de conteúdo textual/editorial são preservados; os demais ficam nulos, sem alegar integridade literal.

sceneLink/narrativeLink/narrativeControl preservam tipo e ID originais como referências exclusivamente unavailable. Não são convertidos em outro recurso nem passam pelo mapper de identidade nativo. Assim, o arquivo mantém a relação para reconciliação sem inventar sua adoção. Os marcos de arco mantêm seu pai explícito.

## UID e paginação

Impacto verifica uid por metadata antes de solicitar justificativa/evidência. A enumeração usa select(uid), omite registros de outra conta e avança o cursor pelo último item examinado, inclusive quando uma página não emite registros. Um leitor não pode parar apenas porque a página está vazia se há próximo cursor.

Uma versão antiga própria não lê ou adota uma cabeça atual de outra conta. Cabeça/cópia imutável próprias de mesma revisão precisam ser coerentes; o alias não oculta uma justificativa divergente.

## Integração interna

Foram adicionadas finding-current/version e impact-current/version. O leitor soma 12 famílias internas com relatório saved-editorial-records-only. Decisões usam grupos de até nove artefatos e 1 MiB, com partes de até 64 KiB e provas privadas de projeção, rechecagem e autorização do livro. Não existem sessões, corpos ou chaves persistidos por essa captura.

## Casos preparados

22 casos novos, sem execução: 13 de leitor local, 3 de schema, 2 de semântica, 2 de remapeamento e 2 com SDK real no emulador demo. Cobrem justificativa sem fonte, campos proibidos, estados nativos, linhagem/alias, hashes de referência, destinos/versionamento, notas de correção, UID antes do corpo, páginas vazias, cabeça estrangeira, rechecagem e descritores estruturais.

Não foram executados testes, typecheck, lint, formatter, build, navegador, cobertura, validate ou diff-check. A prova em SDK está preparada, não confirmada.

## Continuação obrigatória

Completar captura de propostas e relatórios/evidências de Prose/Review/Integration/Geração, guias/publicação e checkpoints históricos. Usar os autorizadores nativos antes dos corpos derivados; resolver vínculos de notas/decisões às fontes somente quando a prova original permitir.

Compor os grupos e sete streams existentes com pressão de consumo, enumeração/rechecagens e selo; depois completar cleanup/materialização/ativação e interface de revisão da restauração. Exportação e restauração v2 permanecem fechadas. Buscar/incorporar novamente a principal antes dos testes finais.

O objetivo integral segue ativo, com 0/5 etapas formalmente encerradas. Sem commit, merge de retorno, push ou deploy.
