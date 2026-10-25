# P1 / M38c — Consumidores e mutações do lore completo

## Objetivo e requisitos

Todo consumidor deve usar o lore lógico completo, independentemente de estar
inline ou em payloads. Não converter stub em nome/texto vazio, não perder
ausências/ordem/relações, não editar apenas metade de uma representação.

O fluxo completo ainda exige lista/assinatura, leitura, criação/edição/exclusão,
contextos de IA/referências/publicação, backup e exclusão/coleta do livro ativo.
A saída portátil que cresceu após remapeamento e a certificação/ativação de P1
continuam requisitos independentes; uma API de leitura não fecha M38c.

## Mapeamento atual

- loreService usa getDoc/getDocs/onSnapshot e orderBy(name), o que omite stubs
  sem nome. Criação com ID já existente também retorna o documento diretamente.
- Edição/exclusão local são transações cliente, com localLoreVersion e revogação
  de publicação. Precisam de geração nova/CAS/recibos e coleta para payloads.
- EditorChatContextRead, loreAnalysis, scenes e narrativePlanning leem dados ou
  metadata do lore diretamente. Devem resolver o objeto lógico na sua fronteira
  autorizada, respeitando budgets de contexto sem alterar os dados de origem.
- BookBackupResourceRead projeta o documento nativo. Precisa de captura lógica
  consistente e leitura em faixas, sem recompor cada item inteiro por página.
- Índice/nascimento dos segmentos usam sealBirth explícito; o nascimento do lore
  pode ser anterior aos payloads por causa da migração de prefixos.

## Sequência

1. M38c1: API privada de leitura própria, sem UI ou novo produtor. Lista limitada
   por IDs com token de coleção; abertura de um lore e leitura de uma parte por
   operação. Reautorizar livro/dono/estado em cada unidade. Compatibilidade inline,
   payloads, ausente/vazio e nenhuma permissão direta nova nas Rules.
2. Conectar get/list/assinatura dos serviços cliente, hidratando dados completos
   antes de mapear LoreEntity ou ordenar por nome. Concorrência limitada, guards
   de conta, revisão/token, resposta tardia e unsubscribe. Não retornar lista
   parcial; tratar carregando/erro no contrato atual. Leituras globais seguem suas
   autorizações. Criação idempotente existente precisa retornar o objeto lógico.
3. Integrar escritores/Rules: impedir alteração cliente de ponteiros/stubs e
   escritas parciais. Produzir gerações novas por unidades, trocar por CAS e
   preservar datas, localLoreVersion, privacidade, recibos e rollback. Não
   reenviar/truncar campos grandes intocados só por salvar outro campo. Relações
   extensas precisam de alterações delimitadas, não de um request gigante.
4. Integrar todos os leitores backend de contexto/referências/publicação e
   capturas. Nenhum consumidor usa a ausência de campos do stub como ausência
   de conteúdo. Conferir revogação/origem na fronteira apropriada.
5. Backup lógico em faixas com prova de geração/segmentos e limites de leituras
   por página. Não aceitar custo quadrático como encerramento. Integrar a
   representação portátil ampliada quando o JSON remapeado passa de 8 MiB.
6. Exclusão do lore/livro e coleta de gerações por consultas limitadas, inclusive
   cancelamento tardio, versões ainda referenciadas e preservação de recriados.
7. Browser/Node/Vitest/SDK/Rules/roundtrip conforme as mudanças. Validate integral
   no fechamento de P1. Documentar e fazer commits locais por incremento.

## Contrato de M38c1

listBookLoreRead, getBookLoreRead e readBookLorePart serão APIs privadas próprias.
A lista lê no máximo 50 IDs por página, sem bytes de corpos ou fichas; cursor
fechado vincula dono/livro/token. ListToken inclui nascimento do livro e
localLoreVersion. ReadToken inclui esse token e nascimento/última alteração do
documento lore. Abertura pode exigir o token obtido na lista.

Header retorna modo e descriptors de transporte, sem conteúdo, ponteiros físicos
ou snapshots. Cada parte retorna até 64 KiB e o mesmo manifest/hash/escopo. Para
relações, a primeira parte também permite conhecer o descriptor da página,
offset e quantidade. O cliente futuro confere SHA/UTF-8/JSON e reconfirma a
origem antes de entregar o objeto. Nenhum teto de 128 partes ou de número de
relações é acrescentado.

Payload exige manifest e birth exatos, corpos imutáveis e partes com provas de
Merkle. Página de relações exige segmento fechado, dono/livro/lore/geração,
offset/count exatos, nascimento/imutabilidade antes de sealBirth e corpo anterior
ao segmento. A raiz pode ser anterior ao segmento; não usar lore.createTime
como sealBirth. Inline preserva a projeção lógica atual com campos opcionais.

## Aceites e riscos

- Dono ausente/incorreto, livro removido/deleting, lore removido/deleting,
  mudança de clock/token ou recriação invalidam a leitura.
- Lista não transfere texto nem impõe um total máximo de entidades.
- Múltiplas páginas não misturam encarnações; índice inválido não lê bytes.
- Corpo/parte/segmento trocado ou recriado falha, sem fallback para vazio.
- API não libera job sem raiz nem cria/ativa a raiz. Harness de leitura não
  representa ativação. Sem alteração de inventário/crédito/publicação.
- Token não substitui autorização. Cache HTTP privada/no-store.
- Legacy sem localLoreVersion usa baseline zero; não significa coleção vazia.
- Somente M38c1 será encerrado com seus testes. Etapas 2–7 e Writer V2 continuam
  abertos até existir evidência correspondente.

Assumir só o escopo book neste protocolo; universo e aventura já têm contratos
próprios e não recebem autorização implícita. Nenhuma dependência nova.
CI ignorada, somente commits locais, sem push/PR/deploy.

## Estado e evidência de M38c1

Etapa 1 tecnicamente validada: [entrega](../../../entregas/2026-10-23-writer-v2-leitura-privada-do-lore-completo.md)
e [ADR 0091](../../../decisions/0091-private-complete-lore-reads.md).
118 backend distintos e três cenários SDK positivos; o cenário Unicode
corrigido percorreu 141 partes, com 130 relações em três páginas.
Limites medidos de quatro/seis leituras nativas e um chunk por unidade.

A etapa 2 foi implementada e validada em M38c2: hidratador, get/list/assinatura
e criação existente. Próxima etapa 3: escritores/Rules com geração/CAS/recibos e
coleta. Etapas 3–7, P1/F2-09 e Writer V2 permanecem abertas.

## Execução da etapa 2 — leitor cliente

Primeiro implementar bookLoreReadClient e seu contrato puro de transporte dentro
da feature lore. Reutilizar o schema lógico portátil puro pela declaração TS,
sem duplicar regras de campos. Receber uma função RPC e uma guarda de contexto
para conferir autorização de conta/cancelamento antes e depois de cada await.
Sem cache persistente. Montar bytes por até quatro chamadas concorrentes,
validar base64 canônico, tamanho/hash integral, UTF-8 estrito e JSON canônico.
Validar todo o domínio sem teto de 8 MiB; preservar ausências e duplicados.

A base payload deve declarar o mesmo bookId e não conter relações inline;
relações devem chegar em páginas de 64 com offset/count exatos. Header final
precisa ser igual ao inicial sob o mesmo token. Lista completa usa todas as
páginas, abre cada entidade com o token listado e repete a varredura metadata
para comparar IDs/tokens antes de retornar. Cursor repetido/IDs duplicados,
falha parcial ou alteração de origem rejeitam a operação inteira.

Testes dirigidos do cliente cobrirão conteúdo literal >8 MiB/128 partes,
relações opcionais/paginadas, corrupção, escopos/tokens/manifest/índices, conta,
cancelamento e respostas tardias, lista completa/alterada e concorrência real.
O adaptador Firebase e get/list/assinatura/criação existente foram conectados,
com testes de serviço e hosts. Livros totalmente inline mantêm SDK servidor;
payload presente usa protocolo completo, sem fallback em erro. Assinaturas
aguardam raiz/coleção confirmadas e ignoram cache/escritas pendentes, recebendo
metadata-only. O lote concorrente é drenado mesmo em erro antes de outro refresh.
Escritores legados recusam payload, mas segurança/edição plena ainda exigem
escritores/Rules/contextos/backup/coleta das etapas 3–7.

## Evidência de M38c2

[Entrega](../../../entregas/2026-10-23-writer-v2-lore-completo-no-cliente.md) e
[ADR 0092](../../../decisions/0092-complete-lore-client.md): 149 testes distintos
em nove arquivos, incluindo 85 novos. Leitor puro, bindings/adaptador, regressões
de serviços/hosts e produtor/API/cliente em memória positivos. Setup suporta
DOM e Node; bundle/smoke e checks dirigidos aprovados. Nenhuma raiz de job foi
certificada ou ativada. Próxima etapa continua a 3; M38c inteiro permanece aberto.

## Execução da etapa 3

O [plano 81](81-escrita-do-lore-completo.md) detalha a escrita completa, do parser
até upload, recibos, geração/CAS, criação/exclusão/GC e cliente. O passo M38c3a
validou parser incremental e guardas nas Rules: 93 Node e sete SDK distintos.
[Evidência](../../../entregas/2026-10-23-writer-v2-validacao-dos-campos-de-lore.md).
O upload privado interno com inventário/cancelamento/cleanup foi validado em
M38c3b: [evidência](../../../entregas/2026-10-23-writer-v2-upload-privado-dos-campos-de-lore.md).
Sem endpoint de escrita, UI ou adoção. M38c3c preparou os leitores v2:
[evidência](../../../entregas/2026-10-23-writer-v2-leitura-das-geracoes-de-lore.md).
M38c3d implementou a inspeção privada da metadata de origem:
[evidência](../../../entregas/2026-10-23-writer-v2-inspecao-da-origem-do-lore.md).
O [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md) detalha a dependência de
inventário/coleta antes da adoção; seu núcleo de fontes foi validado em M38c3e.
Próximos passos: leases/geração em preparação, adoção CAS/privacidade,
criação/exclusão, inventário do livro e cliente. A etapa 3 não está concluída; M38c/P1/F2-09/V2 abertos.

## Contexto da análise — M38c4a / A1

[Plano 94](94-leitura-logica-da-analise-de-lore.md) integra leitor lógico de
inline/v1/v2/criação ao snapshot da análise, com budgets, consulta paginada,
revisão nativa e reautorização de respostas/corpos. Escrita payload/mista é
recusada sem alteração/débito até A2 preparar/adotar o lote atomicamente.

54 Node e seis SDK positivos. Demais leitores, writer A2, backup lógico/indexado,
cliente/recuperação e P1/F2-09/V2 continuam pendentes. Sem endpoint/deploy novo.

## Preparação da etapa 4 — M38c9 A

[Plano 128](128-projecao-logica-do-lore-para-contextos.md) prepara leitura
seletiva para contextos: C1 autorizado, base em fluxo, v2 por campos, projeção
RAM/budget explícito e contagens literais. 156 Node e quatro SDK positivos.
[Evidência](../../../entregas/2026-10-25-writer-v2-projecao-seletiva-do-lore.md).
Marco A não integra chat ou fecha etapa 4. Próximo é matcher/snapshot/proveniência
no marco B. Demais consumidores/backup/restauração/rollout/drain/validate e gates
permanecem necessários.

## Contexto de chat integrado — M38c9 B

[Plano 128](128-projecao-logica-do-lore-para-contextos.md) concluído localmente:
página/snapshot usam C1 lógico, matcher/precedência preservados, budget agregado
por avanço e autorização histórica sem baixar corpos de lore. 99 Node e sete
cenários SDK distintos positivos; [evidência](../../../entregas/2026-10-25-writer-v2-lore-nativo-no-contexto-do-chat.md).
Só o consumidor de chat desta etapa 4 foi integrado. Referências/cenas,
planejamento, publicação e captura de campanhas continuam pendentes, assim como
inventário/escritores/backup/restauração/drain/rollout/validate e demais gates.

## Referências integradas — M38c10

[Plano 129](129-lore-logico-nas-referencias-de-cenas-e-planejamento.md) integra
scenes/narrativePlanning: origem autorizada para vínculos/índices sem chunks,
labels lógicos completos e cursores observando relógio/nascimento nativos.
60 Node e oito SDK positivos; [evidência](../../../entregas/2026-10-25-writer-v2-lore-nativo-nas-referencias.md).
Preserva IDs, índices/recibos e remoção de referências indisponíveis. Próximos
consumidores: publicação/capturas de campanhas e demais leituras ainda cruas.
Etapa 4 inteira, inventário/escritores/exclusão/backup/restauração/drain/rollout/
validate de P1 e demais fases/gates continuam abertos.

## Publicação nativa, marco A — M38c11

[Plano 130](130-publicacao-com-lore-nativo.md) integra captura C1 e servidor para
cópia pública/ativação, preservando consentimento/sombra local/global/staging.
36 Node, 135 Vitest e 19 SDK positivos; [evidência](../../../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md).

Escala ainda pendente: cópia por chamada é limitada a 32MiB/512 partes; marco B
usará inspeção incremental/certificado/ranges existentes. Plano 130 e etapa 4
continuam abertos. Captura de campanhas não aceita lore de livros: usa universo/
aventura e seus leitores próprios, sem migração ou grant entre escopos.
Inventário de outros leitores, escritores/exclusão/backup/restauração/drain/
rollout/validate de P1 e demais fases/gates permanecem necessários.

## Publicação nativa, marco B — M38c11

[Plano 130](130-publicacao-com-lore-nativo.md) implementado/validado localmente.
Inspeção incremental compara candidato público por unidades, preserva prova
nativa e certifica somente a projeção fechada; cópia reautoriza sem reler chunks.
V1 e override v2 acima de 32 MiB positivos; retomada/CAS/recibos/fence/cancel e
exclusão do livro cobertos, sem namespace novo ou prosa no checkpoint.
139 Node distintos, 98 Vitest, cinco SDK e tipos/build/smoke/checks positivos.
[Evidência B](../../../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-b.md).

A pendência de escala do plano 130 foi resolvida pelo novo fluxo; chamada antiga
sem certificado mantém seu budget e não é fallback. Captura cliente continua
integral. Inventário dos demais consumidores e etapa 4 inteira, writers/
exclusão/backup/restauração/drain/rollout/validate de P1 e fases/gates continuam.

## Descoberta e início da etapa 5 — M38c12 A

Inspeção dos leitores atuais orientou o [plano 131](131-backup-logico-indexado-do-lore.md):
chat de cenas, análise lógica, referências e publicação possuem integração própria.
O contrato 29/30 preserva o chat clássico, alimentado por lore cliente hidratado,
sem migração/proveniência retroativa. Capturas de campanhas não consomem livros.
Isso não certifica todo o inventário de escritores/namespaces ou encerra P1.

Backup de recurso ainda serializa snapshot físico; cliente/validação recompõem
JSON com limite de 8 MiB/128 spans. A integração deve preservar a fonte lógica
sem custo quadrático e cobrir o crescimento após remap. Núcleo A do índice
portátil implementado: campos/ranges/datas/contagens e IDs por unidade, sem
prosa/lista no estado; não conectado ao produtor. 335 Node distintos, três
jornadas Chromium, bundle browser e declaração TS positivos.
[Evidência](../../../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md).
Próximo passo B do plano 131; C/D, etapa 5 inteira e demais P1/fases/gates abertos.

## Composição individual da etapa 5 — M38c12 B

[Plano 131](131-backup-logico-indexado-do-lore.md): produtor C1 em unidades
implementado/validado, sem montar/reler ficha inteira. Token de coleção original,
SHA de cada corpo, domínio/spans da saída, header final e pressão de consumo.
Inline/v1/v2/criação, >8 MiB/128 partes e relações grandes positivos.
147 Node, 114 Vitest distintos, cinco SDK e três Chromium; build/checks.
[Evidência B](../../../entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md).

Arquivo final/validadores/restauradores ainda usam o caminho anterior: C/D são
próximos e obrigatórios, inclusive JSON ampliado após remap. Etapa 5, inventário
geral/writers/exclusão/coleta/legacy/roundtrip/rollout/validate de P1, fases e
gates continuam abertos. Sem recurso remoto novo, CI, push ou deploy.

## Envelope da etapa 5 — M38c12 C1

Índice do envelope e prefixo com orçamento de referências implementados/validados:
consumed exato, <=64 referências, checkpoint sem prosa/lista e domínio portátil.
260 Node distintos, 26 Vitest, três Chromium, bundle browser e declarações TS.
[Evidência C1](../../../entregas/2026-10-25-writer-v2-envelope-incremental-do-lore.md).
C2/C3 ainda devem integrar validadores/captura/selo; D remap/materialização.
Etapa 5, plano 131, P1 e demais fases/gates permanecem abertos.

## Validação da etapa 5 — M38c12 C2

Lore novo é validado por unidades no cliente/servidor, com EOF/endereço/hash,
referências limitadas e ponteiro constante. Checkpoints/reader pequenos antigos
continuam compatíveis. 232 Node, 13 Vitest, seis SDK distintos e três Chromium
positivos; build/smoke. [Evidência C2](../../../entregas/2026-10-25-writer-v2-validacao-incremental-do-lore.md).

C3 deve ligar captura/revalidação/selo. D deve ler/remapear/materializar grande,
sem usar o orçamento da API integral pequena como limite de autoria. Etapa 5,
plano 131/P1/fases/gates continuam abertos, sem rollout ou operação de produção.

## Captura e selo da etapa 5 — M38c12 C3

Arquivo completo captura lore por C1 e revalida loreDigest/metadados v1 antes do
selo, sem lista de provas em RAM ou stub físico. Guarda de ator inclui selo/
close, preservando o limite real do commit. 27 Node, 75 Vitest distintos, três SDK
distintos, cinco Chromium e build/smoke positivos.
[Evidência C3](../../../entregas/2026-10-25-writer-v2-captura-logica-e-selo-do-backup.md).

A/B/C do plano 131 integrados; D (leitor/remap/materialização/roundtrip grandes)
é o próximo requisito. Etapa 5/P1/fases/gates ainda abertos, sem rollout.

## Leitura da etapa 5 — M38c12 D1

[Plano 131](131-backup-logico-indexado-do-lore.md): leitor interno de lore C2
por ranges/campos de 64 KiB, sem catálogo de spans nem ficha/provas integrais.
Framing canônico permite seek direto; ponteiro/recibo/origem nativos são
reconferidos no verify da unidade. Metadata/ausência não certificam corpo.
69 Node, 13 Vitest, três SDK distintos e três Chromium dirigidos positivos;
veja a [evidência D1](../../../entregas/2026-10-25-writer-v2-leitura-indexada-do-lore-restaurado.md).

D2 remap/medição da saída e D3 materialização/rollback/roundtrip ainda obrigatórios.
Etapa 5 inteira, inventários/writers/exclusão/legacy/drain/rollout/validate de P1
e fases/gates permanecem abertos. Sem novo namespace, CI ou operação remota.

## Projeção da etapa 5 — M38c12 D2

[Plano 131](131-backup-logico-indexado-do-lore.md): remap incremental por campo,
ID partido até fechar, prosa literal, resolução nativa local qualificada e
hash/bytes finais. Até 64 KiB/64 alvos por entrada, fragmento de até 80 KiB e
cursor privado limitado; não é parte nativa ou prova acumulada.
255 Node distintos, 13 Vitest, dois SDK e três Chromium positivos; veja a
[evidência D2](../../../entregas/2026-10-25-writer-v2-remap-incremental-do-lore-restaurado.md).
D3/materialização/retomada/rollback/roundtrip e inventários/legacy/drain/rollout/
validate de P1 e fases/gates permanecem obrigatórios.

## Materialização da etapa 5 em andamento — núcleo D3

[Plano 131](131-backup-logico-indexado-do-lore.md): gravador de corpos por
estágios com inventário/journals/recibos, memória limitada e codec nativo.
Fronteira estrutural corrigida para metadata de lore. 84 Node distintos e três
SDK positivos; limites na [evidência](../../../entregas/2026-10-25-writer-v2-gravador-incremental-de-corpos-de-lore.md).
Ainda integrar geração, páginas, Resources/Counts, drenagem e roundtrip.
Etapa 5/D3/P1/validate/fases/gates permanecem abertos.
