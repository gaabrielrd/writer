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

Nenhum cliente ou novo escritor foi conectado. Próxima etapa: hidratador completo
com SHA/UTF-8/schema, guards e confirmação final, antes de integrar get/list/
assinatura e criação idempotente. Etapas 2–7, P1/F2-09 e Writer V2 permanecem abertas.
