# ADR 0248 — semântica derivada e revisão composta do backup

- Data: 2026-10-29.
- Estado: implementado internamente; materialização/ativação pendentes.
- Complementa [ADR 0246](0246-campaign-own-backup-semantics.md) e
  [ADR 0247](0247-campaign-backup-utf8-fields-v2.md).

## Contrato derivado

campaignBackupDerivedContent valida DTOs fechados por domínio, reaproveitando
validItem/validateCapturedFields e entityInput. UTF-8 e representação JSON são
canônicos. Snapshot, origem/sourceKey, pais, manifestos, structured, imagem,
links/ledger, variantes e âncoras têm projeções explícitas. O índice conserva
somente metadata necessária aos joins, descartando título/sinopse/prosa.

onDerivedUnit é provisório e separado de onOwnUnit. Só entrega a unidade depois
de conferir bytes/SHA; arquivo inteiro ainda precisa ser autenticado. JSON de
uma unidade tem limite de 4 MiB. Campos usam decodificação UTF-8 por fluxo;
imagens/campos não são concatenados. V1/v2 conservam suas regras de framing.

## Índice e vínculos

Índice temporário injetado write/seal/read/lookup/reverse/dispose, sem adaptador
padrão. MAC vincula UID, ordinal, namespace, chave, posição e payload. Metadata
até 64 KiB por registro, páginas de 25, autenticação/desprendimento da página
inteira antes de callbacks/lookups. Chave efêmera só em RAM, zerada/dispose sempre.

Namespaces de itens/recursos/variantes são estritos e ordenados. Uma ausência
opcional em base:item ou variant precisa de vizinhos MAC consecutivos, mesma
família, posições adjacentes e limites corretos; coleção vazia usa contagem
conferida durante a leitura. Não confiar só em null retornado pelo índice.
Reverse devolve testemunha positiva autenticada de bloco/imagem ou link/ledger.

Após autenticar arquivo/assinatura, conferir base/evidência e snapshot,
unidades/evidências de itens e variantes nos dois sentidos, parentesco/tipo,
origens, campos em ordem/cobertura exata e corpos físicos por chave/índice.
Principal compartilha somente content com sua cena e manifesto idêntico.
Cada imagem tem bloco, cada lore disponível tem ledger e vínculo; referências
disponíveis precisam do alvo correto e ledger. Omissões legítimas permanecem.

Variantes e âncoras ligam sourceKey, anchorKey, base/origem/nascimento inline e
campos; legadas dispensam a base antiga no banco. Relações de variantes/base
são conferidas contra os namespaces presentes. A âncora histórica pode conter
referências para outra ficha antiga ausente do arquivo atual: provar a ausência,
contar externalAnchorTargets e preservar a declaração, sem conceder acesso.
A futura projeção/materialização deve mantê-la não resolvida até haver um alvo
com prova e autorização; não transformar a declaração available em grant.

## Revisão composta

campaignBackupReview captura leitor/tamanho e usa fábrica interna de índices
temporários por etapa: próprios, derivados, origens atuais. Cada etapa descarta
seu índice. Cadeia, tamanho e manifesto devem ser idênticos; trocar por outro
arquivo válido entre etapas recusa. A última etapa reconfere autorização e chave.

campaign-derived-semantics-only e campaign-backup-review-only são provas
efêmeras de revisão, não ativação nem autorização futura. Não existe adaptador
persistente, callable ou interface nova. Bytes emprestados devem ser conferidos
contra a mesma identidade ao materializar. Não compor provas de arquivos distintos.

## Limites e evidência

61 cenários iniciais passaram; o reforço final de tipo do namespace levou a
62/62 novos, mais 151 regressões pertinentes. A evidência e a validação integral
do bloco estão em [entrega parcial](../entregas/2026-10-29-writer-v2-revisao-completa-do-arquivo-de-campanha.md).

Materialização deve usar os bytes conferidos e normalização/rasterização da
biblioteca para imagens. Vínculos ausentes preservam suas chaves opacas; o DTO
portátil de link não carrega a referência nativa completa quando o alvo falta.
Preparar leitores/consumidores de procedência restaurada antes de gravar isso.

Antes de produtores persistentes, fechar inventário/cleanup C4 v1–v4. Depois
upload/retomada, nova cópia/remapeamento, materialização/ativação e Estúdio/ciclos.
P3/D/F2-09 e macro 8/35 permanecem abertos; sem CI/push/deploy/subagentes.
