# Incremento 35 — Captura de preparação histórica e notas próprias

Estado: implementação interna local; testes preparados, sem execução. Nenhum produtor, callable ou restauração v2 habilitado.

## Preparação com autorização antes do corpo

bookEditorialPreparationCapture lê inicialmente apenas metadata: identidade nativa, capítulo, revisão, datas, manifesto, hashes e flags de estado. Confere a origem do item e o ID nativo da versão. A cabeça e a cópia imutável de mesma revisão devem ter metadata coerente; o alias não oculta uma divergência de corpo.

O manifesto passa pelo normalizador e pelo autorizador nativo de escrita literária antes de qualquer get do corpo do gate. Fonte retirada/recriada gera um documento indisponível source-revoked. Schema não suportado gera unsupported-legacy-schema. Nenhum critério, parecer, nota ou citação do gate é lido nesses caminhos. Isso preserva a fronteira do getter nativo de preparação, que bloqueia todo o corpo quando perde autorização.

Com autorização, a captura valida o gate e seu digest nativo, preservando os literais do registro. Resolve novamente as referências e vincula as identidades/versões observadas à prova privada da projeção. Alteração/revogação entre partes ou antes da rechecagem final invalida a prova anterior.

O resultado é um grupo de até 43 artefatos e 1 MiB: documento de preparação e até três evidências por critério. Esse envelope é transporte interno, não um record novo do `.writer`; o futuro produtor precisará separar e validar seus artefatos. As partes continuam limitadas a 64 KiB.

## Histórico estruturado sem autorização ativa

BookEditorialDocument admite preparation somente no papel preparation. O objeto fechado preserva capítulo, notas, os 14 critérios, resultados, justificativas e IDs de evidência. historicalAcceptance/historicalReady são declarações históricas. A semântica exige o conjunto de critérios, resultados válidos e referências a artefatos evidence reais; não aceita um decision no lugar de uma evidência.

As citações mantêm source lógico e observação de revisão. Não recebem offset ou hash do conteúdo original inventado; a classificação é unclassified, pois a cópia não certifica novamente a integridade literal da fonte histórica. Origem não registrada fica explicitamente indisponível. A data da preparação permanece no documento; evidências sem data independente ficam com datas nulas.

A linhagem passa a aceitar documentos versionados, com papel imutável entre revisões. O remapeamento preserva relações capítulo/evidências e exige revisão, execução desabilitada e publicação privada. Um ponteiro local de arquivo marcado unavailable também recebe o ID novo do arquivo, mantendo unavailable; isso não chama o resolvedor de recursos nativos nem cria o alvo.

## Notas de progresso são conteúdo próprio

A captura adiciona progress-current/version. Preserva etapa, bloqueios, próximo passo, datas, versões e texto literal da anotação. O vínculo ao artefato original só é resolvido para contrato/ficha quando a prova nativa original e a versão observada ainda conferem. Fonte alterada/retirada, ou família ainda sem projetor, recebe descritor histórico indisponível. Não adota uma cabeça nova pelo mesmo ID.

O recurso de manuscrito associado é conferido por metadata, sem ler seu corpo. Ausência não descarta a anotação. O leitor de metadata de progresso foi exposto somente como função interna de servidor, com autorização prévia do livro exigida do caller; não é uma nova ação pública.

A distinção é deliberada: notas próprias são preservadas independentemente da fonte; pareceres/citações da preparação continuam sujeitos ao manifesto original. Não se amplia o acesso a caches derivados após revogação.

## Integração interna

O leitor agora cobre oito famílias: contrato atual/versão, ficha atual/versão, nota atual/versão e preparação atual/versão. Seu relatório é saved-editorial-records-only. Metadata/cursores continuam ligados a UID/livro/família/tokens; cada parte/rechecagem reautoriza a origem. A preparação entra por um caminho protegido separado, antes do get genérico do corpo.

Os grupos autorizados e as versões idênticas usam alias sem bytes duplicados. Grupos indisponíveis carregam somente o documento-placeholder. Não há sessão, corpo, chave ou job de captura persistido, nem novo recurso que exija cleanup.

## Casos preparados

23 casos novos, todos sem execução: 14 de serviços nativos locais, 2 de schema, 2 de remapeamento, 2 de semântica e 3 com SDK real no emulador demo. Um título de teste anterior foi realinhado à linhagem de documentos.

Incluem texto próprio com CRLF/Unicode, anotação órfã, origem alterada, reautorização antes do corpo, identidade de cabeça, versões/aliases, critérios e relações de evidência, leitura metadata-only sob revogação, schema desconhecido, corpo divergente e revogação entre partes. Os observadores de get usados pelos testes são locais aos fixtures e somente de leitura; não alteram transações de produção.

Não houve testes, typecheck, lint, formatter, build, navegador, cobertura, validate ou diff-check neste incremento. As provas de SDK estão preparadas, não confirmadas.

## Continuação

Completar captura de decisões próprias, propostas, relatórios/evidências de revisão/integração, guias/publicação e checkpoints históricos, com os leitores nativos de autorização. Resolver vínculos de notas às famílias quando seus projetores existirem, sem rebasear observações antigas.

Depois compor os grupos/artefatos e os sete streams existentes com pressão de consumo, enumeração/rechecagens, footer/selo e arquivo temporário confirmado só no sucesso. Completar inventário/cleanup da restauração, materialização utilizável de contrato/fichas, arquivo histórico privado, ativação atômica e interface de revisão. Até lá, exportação e restauração v2 continuam desabilitadas.

O objetivo integral segue ativo, com 0/5 etapas formalmente encerradas. Buscar/incorporar novamente a principal antes dos testes finais. Sem commit, merge de retorno, push ou deploy.
