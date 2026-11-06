# Incremento 34 — Captura nativa de contratos e fichas

Estado: implementação interna local e testes preparados. Não há callable, produtor v2 ou restauração editorial habilitados.

## Identidade lógica e versões

O DTO editorial admite `lineage: { id, role }` somente para contract/plan com revisão positiva. O ID lógico é distinto do ID do artefato de uma revisão; role é current/version. O projetor deriva as identidades de domínio próprio, livro, nascimento nativo, tipo, ID lógico original e revisão. A captura atual e sua cópia imutável da mesma revisão identificam o mesmo artefato. A restauração remapeia a linhagem de forma estável entre as versões e distinta por novo livro.

A semântica compartilhada acrescenta índice metadata: uma revisão por linhagem, uma cabeça atual por linhagem, um único contrato atual e tipo de ficha imutável entre versões. Não aceita versão mais nova que a cabeça declarada. Conteúdo sem lineage continua histórico; não se deve inferir uma ficha ativa apenas por título ou revisão máxima.

Um universo legado cuja identidade não foi registrada pode aparecer com scope universe/id null, exclusivamente em referência de lore unavailable. Não existe ID fictício, resolução para outro universo ou promoção desse descritor durante o remapeamento.

A conferência do escritor nativo mostrou que aliases de escopo podem conter papéis fonte/assunto distintos. O formato portátil preserva papéis, revisões e estados diferentes; rejeita repetição exata. O projetor condensa somente descritores logicamente idênticos depois da resolução do alias. Isso corrige a suposição inicial do incremento 30 que proibia todo alvo repetido. A futura adoção nativa exige revisão/reconciliação dessas referências; não recebe grant pelo arquivo.

## Projeções fechadas

bookEditorialProjection seleciona somente campos próprios salvos de contrato/ficha, decisões, preferências, referências e datas existentes. Campos operacionais extras, snapshots, jobs e tokens não são espalhados no DTO. A procedência fica unknown quando o registro salvo não a informa; não inventa author/ai. Datas não registradas permanecem null, e o texto literal preserva BOM, CRLF e Unicode.

Uma ficha salva é conteúdo próprio do livro. A captura pode preservar esse texto com referências indisponíveis, como a leitura nativa já permite. Isso não autoriza exportar caches de gerações não adotadas ou corpos de fontes revogadas; essas famílias ainda precisam de seus próprios leitores reautorizados.

As referências preservam identidade lógica, revisão observada e finalidade. sourceToken nunca é relabelado como contentHash. Referências de outro volume são decodificadas pelo codec nativo; lore global/local mantém seu escopo original ou sua ausência explícita.

## Leitor interno limitado

createBookEditorialCaptureService oferece cinco operações internas: obter fonte, listar registros, ler partes, reconferir registro e reconferir fonte. Não foi ligado ao registro de ações nem a uma Function.

As famílias atuais são contract-current, contract-version, plan-current e plan-version. Cada página/parte reautoriza o livro e compara o token de backup existente e o marcador editorial privado. Listas usam metadata nativa e ordenação por nome, com cursor fechado ligado a UID/livro/família/ambos os tokens. Não retornam títulos, prosa ou justificativas.

A leitura confere o nascimento/atualização do item, o ID nativo de versão e a coerência com a cabeça atual. Uma versão imutável idêntica à atual retorna current-alias, sem bytes duplicados. Uma divergência entre cabeça e cópia imutável é erro; não é ocultada como alias. Versões anteriores permanecem artefatos independentes da mesma linhagem.

Partes de até 64 KiB trazem SHA, tamanho, índice e prova privada da projeção. Após a primeira parte, a prova original é obrigatória. Cada parte resolve novamente metadata das referências pelos leitores autorizados existentes. A prova privada vincula identidade/versão observadas das fontes; revogação ou mudança invalida a continuação/rechecagem original, mesmo sem mudança no livro alvo.

A rechecagem do registro retorna somente metadata e não prosa. Hashes/tokens privados são transporte de captura; não entram no DTO ou no arquivo. Nenhuma sessão, corpo, chave ou job de captura foi persistido. Uma enumeração vazia não fabrica contrato vazio.

## Casos preparados

31 casos novos, todos sem execução: 3 de schema, 2 de remapeamento, 3 de semântica/linhagem, 7 de projeção pura, 13 de leitor com serviços nativos e 3 com SDK real no emulador demo. Um caso anterior de schema foi corrigido para refletir os papéis aceitos pelo escritor nativo.

Cobrem cabeça/versões/alias, conflito nativo, metadata sem prosa, ausência, paginação, partes e hash, literalidade, item/conta alterados, marcador privado, referências próprias/externas, revogação entre partes e rechecagem final. Não houve execução de teste/check, typecheck, lint, formatter, build, browser, cobertura ou validate. Os casos SDK são preparados, não provados.

## Continuação obrigatória

Completar as projeções e captura das demais famílias: preparação, arquitetura/série, decisões próprias, propostas/evidências/relatórios e checkpoints históricos, com fontes reautorizadas e sem jobs brutos. Conferir todas as mutações efetivamente observadas pelo fence; process-headers-partial não certifica cobertura global.

Compor a enumeração e as rechecagens finais com os sete streams existentes, pressão de consumo, contagens, framing e arquivo temporário confirmado somente no sucesso. Depois completar inventário/cleanup, materialização útil de contrato/fichas e arquivo privado histórico, ativação atômica e revisão da cópia. Até lá, produtor e restauração v2 permanecem fechados.

O objetivo integral continua ativo, com 0/5 etapas formalmente encerradas. Antes da rodada final, buscar/incorporar novamente a principal. Sem commit, merge de retorno, push ou deploy.
