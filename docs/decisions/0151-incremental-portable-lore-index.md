# ADR 0151 — Índice incremental do lore portátil

- Status: A/B/C/D1/D2 implementados/validados localmente; D3/fechamento de P1 pendentes.
- Data: 2026-10-25.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md).

## Contexto

Na descoberta, a captura privada serializava a cabeça física de lore. O leitor
e o validador servidor recompunham JSON de até 8 MiB, com até 128 spans por item.
A/B/C integram captura/validação; D1 acrescenta leitura grande por ranges.
D2 acrescenta remap/medição; materialização/roundtrip seguem em D3.
Esse modelo não transporta todas as fontes lógicas atuais nem o JSON que cresceu
após remap. A leitura por faixas depende de índice sem prosa e de validação
incremental; não basta aumentar o limite ou montar o item a cada página.

## Decisão

BookPortableLoreIndex valida o objeto data lógico, não o envelope/framing nem
uma cabeça física. Processa até 64 KiB por unidade, com posições em bytes UTF-8.
Campos são os mesmos do schema portátil: nome/categoria obrigatórios, opcionais
explícitos, datas válidas, aliases/estrutura/relações literais. Nada de defaults,
normalização, nomes globais resolvidos ou ponteiros de armazenamento.

Checkpoint fechado tem teto de 16 KiB e tamanho independente da prosa/quantidade
de relações: sintaxe/UTF-8 parciais, máscara de campos, ranges, flags/datas,
contagens e ID corrente. Não contém strings de nome/resumo/detalhes/descrição,
listas completas ou corpo. IDs/chaves/categoria curtos são metadata de domínio.
Emite referências ordenadas por unidade, sem acumular catálogo. Saída depende
somente dos bytes consumidos e do estado; entrada não é mutada.

Reutilizar a gramática dos campos existente. Sua classe GenerationError agora
vive em módulo puro sem I/O e continua reexportada de generation, preservando
identidade, código e reason. A gramática tem entrada distinta para a coleção
portátil inteira de relações (estado v2); as APIs anteriores aceitam somente
estado v1 e mantêm o contrato de páginas com até 64 relações. O novo modo não
autoriza uploads ou altera limites das páginas nativas.

O índice prova apenas domínio/sintaxe quando percorrido desde a origem; não
prova SHA, bytes externos, encarnação, framing, acesso ou ativação. Ranges/IDs
não são grants. Os próximos marcos precisam vinculá-lo à fonte/arquivo/item/
checkpoint originais, conferir integridade e reautorizar por unidade/ao selar.

## Consequências e limites

O núcleo A não criou endpoint, namespace, Rule, dependência ou produtor remoto.
O parser é compartilhável entre navegador/servidor; bundle e Chromium comprovam
o isolamento. B acrescenta composição individual no cliente C1, descrita abaixo.
Arquivo final/validadores/restauração ainda exigem C/D; não habilitar P1 por A/B.

B integra fonte lógica, leitura única dos corpos e pressão de consumo.
C/D devem integrar arquivo, validação local/servidor e remapeamento/materialização
sem cap artificial.
Inventário/cleanup antecedem qualquer novo recurso persistido. Compatibilidade,
backup de histórico, ativação/roundtrip e validate global continuam obrigatórios.

[Evidência](../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md):
335 Node distintos positivos (47 novos e 288 regressões), três jornadas Chromium,
bundle browser de 12 módulos e declaração TS conferida. Sem SDK/CI/remoto/deploy.

## Composição B — fonte C1 autorizada

WritePortable fixa token C1 da versão 1, com clock da coleção/nascimento do livro
e identidade da ficha, independentemente do modo de tokens do host. Cada unidade
usa as APIs existentes e confere DTO/base64/manifest/escopo, autorização nativa e
SHA completo do corpo. Header original é reconferido ao terminar; VerifyPortable
é somente reautorização de metadata antes do futuro selo, não prova de bytes ou
disponibilidade atual de todos os corpos.

A base é varrida uma vez. Observador RAM de bytes em BookLoreBaseIndex permite
emitir os campos efetivos sem recompor/reler a ficha; datas numéricas continuam
na metadata. Em v2, omitir campos substituídos e anexar overrides presentes/datas.
Páginas de relações são validadas individualmente e concatenadas pelo interior
de seus arrays, conservando ordem/duplicados. Datas e presença são lógicas, sem
defaults de apresentação. Propriedades do objeto podem ter ordem diferente;
strings e ordem das listas não são normalizadas.

O índice A acompanha data e a composição calcula hash/contagens da saída e seu
offset em bytes. Prova é pequena, privada, congelada e só em RAM. Saída contém
somente envelope lógico, sem tokens, storage/job/control. Consumo é aguardado
a cada parte de 64 KiB; parsers/hash/unidade/buffer são limitados, sem catálogo
ou prosa integral. Sem chamada remota de escrita, job, chave ou namespace novo.

Bytes anteriores a EOF/hash/domínio/header são provisórios. Falha/abort/ator
alterado não retorna prova; o compositor C deverá abortar seu sink temporário.
Não há retomada durável do arquivo ou ativação de restauração em B. Reutilizar
leitura de unidade no cliente anterior conserva sua montagem/concorrência.

[Evidência B](../entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md):
147 Node, 114 Vitest distintos, cinco SDK e três jornadas Chromium positivos;
tipos/build/smoke/bundle/checks locais. C/D/P1/fases/gates continuam abertos.

## Validação C — prefixos e envelope com orçamento semântico

O store da validação tem limite de 96 escritas por operação. Uma parte de 64 KiB
não limita a quantidade de referências. Por isso C1 acrescenta consumed exato
e orçamento de 1–64 referências ao prefixo portátil, sem mudar a entrada nativa
ou o consumo integral anterior. O checkpoint retoma no byte seguinte ao limite.

BookPortableLoreItemIndex compartilha o índice de data e a gramática de string
do ID; confere o envelope fechado em qualquer ordem canônica aceita antes.
Estado de até 32768 bytes, sem prosa/lista, entrega ranges/offsets/metadata e
referências provisórias. Erros do ID têm o código invalid-record do backup.

C1 não certifica bytes/SHA/framing/acesso. C2 deve ligar esse estado aos ponteiros
e à validação semântica; C3 à captura/selo e D ao leitor/remap/materialização.
[Evidência C1](../entregas/2026-10-25-writer-v2-envelope-incremental-do-lore.md):
260 Node distintos positivos (43 novos/217 regressões), 26 Vitest do bridge,
três Chromium, bundle browser de 11 módulos e declarações TS conferidas.
Nenhuma fronteira remota nova, SDK ou build geral neste passo puro.

## Integração semântica C2 — arquivo validado sem recomposição de lore

ContentMachine controla o item incremental e bloqueia operações intercaladas.
O nó/contagem do lore só entram após EOF/domínio/endereço. Referências são
indexadas em até 64 por avanço. O validador local usa esse caminho para lore.

No servidor, SHA/cursor/part/último tamanho e um único span/offset pendente
substituem o catálogo de spans do lore novo. O framing avança uma vez por frame;
sufixos densos podem ser relidos por unidades autenticadas limitadas. Metadata
do item contém cursor, partes, SHA e ranges constantes. Não há namespace novo:
provas nativas, transação, recibos e cleanup v3 existentes cobrem o ponteiro.

Checkpoints antigos sem lore ou já coletando spans continuam válidos.
O leitor integral pequeno reconhece o ponteiro e conserva seu orçamento anterior;
não é o leitor grande de D. Instâncias antigas devem ser drenadas com rollout
coordenado antes de emitir novos ponteiros. C3/D/P1 continuam obrigatórios.

[Evidência C2](../entregas/2026-10-25-writer-v2-validacao-incremental-do-lore.md):
232 Node distintos, 13 Vitest, seis SDK distintos e três Chromium positivos;
build/typecheck/smoke (2989 módulos) e checks locais. Fonte de 10 MB/1000 relações
com snapshot de 3313 bytes e ponteiro de 1566 bytes, sem ativar livro.

## Captura C3 — arquivo lógico e revalidação antes do selo

BookResourceCapture usa C1/writePortable para todo lore. Um loreDigest encadeia
ID/token v1 em ordem, sem guardar um catálogo de provas. A varredura final
recalcula por portableMetadata v1, além das provas existentes do livro/recursos.
Leitor físico recusa payloadStorage; nenhum fallback converte stub em conteúdo.

Um port compartilhado fixa ator e guarda captura/conferência/escritas posteriores.
A prova standalone conserva esse port em WeakMap só em RAM. O adaptador padrão
abre a sessão no primeiro uso; import/construção não inicializam Auth/App Check.
O encoder e o sink conferem guarda também após selo/close. Close já concluído
não é reversível; uma troca de ator nesse ponto bloqueia sucesso sem prometer
desfazer o commit. Antes de close, abort preserva o arquivo anterior.

[Evidência C3](../entregas/2026-10-25-writer-v2-captura-logica-e-selo-do-backup.md):
27 Node, 75 Vitest distintos, três SDK distintos, cinco Chromium reais e build/
smoke positivos (2990 módulos). Arquivo real grande chega à validação servidor.
A/B/C concluídos tecnicamente; D/roundtrip/P1/fases/gates continuam obrigatórios.

## Leitura D1 — acesso direto e provas por unidade

O framing canônico permite calcular a posição de uma parte de 64 KiB pelo
comprimento do metadata e soma dos dígitos de part. O codec compartilha a
validação do cursor e lê somente digest anterior/prefixo/corpo/trailer da parte.
O cursor deve vir de arquivo/item validados e autenticados; a aritmética não
substitui hash integral, selo, domínio ou autorização. Não persistir spans extras.

OpenIndexedLore aceita o ponteiro original C2 imutável e retorna metadata
congelada, sourceToken privado e readRange/readField de até 64 KiB. Ausência é
present:false sem bytes. Cada unidade tem observações novas de chunks/provas;
verify(tx) confere origem/estado/recibo/ponteiro e observações antes da escrita.
Metadata tem verify separado, sem garantir corpo disponível. A API integral
anterior conserva o cap; legado permanece um caminho explícito, sem fallback
quando um ponteiro indexado presente é inválido.

Sem endpoint/Rule/namespace/recurso novo. D2 deve remapear por unidades e medir
a saída; D3 materializar sob inventário/retomada/rollback e provar roundtrip.
69 Node, 13 Vitest, três SDK distintos e três Chromium positivos.
[Evidência D1](../entregas/2026-10-25-writer-v2-leitura-indexada-do-lore-restaurado.md).

## Projeção D2 — remap por campo e medida da saída

O parser de campos oferece position opcional em offsets de bytes sem alterar
os callbacks antigos. O transformador retém somente ID parcial até fechar a
string e copia bytes dos demais campos/prosa literalmente. Até 64 KiB e 64 alvos
por avanço; o remapeador existente conserva a precedência de ID local qualificado
por índice original. Externo não resolvido localmente permanece literal.

OpenMappedIndexedLore fixa origem/destino/ID e expõe sourceMetadata original,
não ranges de saída. Cursor privado de até 16 KiB contém sintaxe/ID/offset/
contagens/SHA, sem ficha/lista. Summary mede hash/bytes finais de cada campo.
Cada unidade reconfere D1 e as resoluções nativas no verify do consumidor.
Cursor deve ter journal/recibo original ao persistir; não é prova acumulada.

Fragmentos podem crescer até 80 KiB e não são chunks nativos de 64 KiB. D3 deve
empacotar/atestar, vincular procedência, ampliar inventário antes das escritas e
provar retomada/rollback/roundtrip até ativação. Sem novo recurso ou endpoint D2.
255 Node distintos, 13 Vitest, dois SDK e três Chromium positivos.
[Evidência D2](../entregas/2026-10-25-writer-v2-remap-incremental-do-lore-restaurado.md).

## Materialização D3 em andamento — núcleo de corpos

O gravador usa os conjuntos payload já inventariados para controles, fragmentos,
acumuladores e nós privados com IDs de domínio. O host confirma plano e job/CAS/
recibo nativos juntos. Acumulador parcial fica no artefato, sem prosa no cursor.
SHA da montagem confere D2; árvore é construída por unidades, partes finais são
copiadas imutáveis com provas e header vem após varredura limitada. Native reader
rejeita staging; não existe ponteiro público para esses recursos provisórios.

Leaf/branch e formato do codec original mantidos. Escrita sem mudança do
acumulador é omitida para preservar updateTime/journal reais. A estrutura usa
metadata na fronteira de lore, preservando o caminho integral dos legados.

84 Node distintos e três SDK positivos. O núcleo ainda exige integração de
geração/campos/páginas, Resources/Counts, drenagem de staging e roundtrip.
O harness não é o orquestrador completo.
[Evidência](../entregas/2026-10-25-writer-v2-gravador-incremental-de-corpos-de-lore.md).

## Geração D3 — integração parcial do orquestrador

AdvanceLore prepara v2 sem base por campos/páginas sob controle privado
restore-lore-generation, no inventário existente. O prefixo streamed distingue
jobs novos dos protocolos monolíticos anteriores. A gramática delimita página
após o objeto completo da 64ª relação, sem reter descrições no checkpoint.

Datas físicas permanecem requeridas; portableDates opcional somente sem base
preserva presença das datas originais em C1/leitura lógica/inspeção/recaptura.
Resources usa metadata indexada. O controle só é substituído quando mudou,
preservando updateTime/journal nativos nas etapas exclusivas dos corpos.

Opção de composição indexedLoreBodies inicia false enquanto Counts/drenagem/
roundtrip não foram integrados. Não é opção de request; jobs streamed existentes
retomam mesmo desligada. Habilitação coordenada continua obrigatória em D3.
Raiz ausente e gates de P1 continuam. [Evidência parcial](../entregas/2026-10-25-writer-v2-geracao-indexada-de-lore-restaurado.md).

## Reconciliação D3 — fonte projetada e corpo nativo

Counts distingue a cabeça v2 sem base dos protocolos anteriores. Controle
privado restore-lore-reconcile no inventário existente fixa origem e cabeça
nativa; D2 produz uma unidade antes da escrita, e todas as observações são
reconferidas no commit. A transação compara somente o intervalo correspondente
da saída (até três partes), com journals/recibos e provas Merkle nativas.
No fim do campo/página, SHA e tamanho totais conferem o manifesto. Presenças,
datas, privacidade, segmentos e contagens também são obrigatórios.

Sem ficha inteira, catálogo de provas, novo DTO/Rule/namespace/índice de query.
O leitor lógico completo permanece oráculo privado dos testes. Drenagem,
roundtrip e habilitação coordenada de D3/P1 continuam.
[Evidência](../entregas/2026-10-25-writer-v2-reconciliacao-indexada-do-lore.md).
