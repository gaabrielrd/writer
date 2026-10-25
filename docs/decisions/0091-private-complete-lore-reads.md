# ADR 0091 — Leitura privada e paginada do lore completo

- Status: aceito para leitura privada; integração de consumidores pendente
- Data: 2026-10-23
- Plano: [M38c](../tasks/writer-v2/execucao/80-consumidores-do-lore-completo.md)
- Complementa: [ADR 0089](0089-private-paged-lore-payloads.md) e [ADR 0090](0090-legacy-lore-prefix-migration.md)

## Contexto

O documento nativo pode ser uma ficha inline ou um stub com payloads privados.
Listar por name omite stubs; mapear o documento diretamente cria fichas vazias.
É necessário transportar a representação lógica sem conceder acesso SDK aos
corpos, baixar todas as fichas numa chamada ou recompor toda a ficha por parte.

## Protocolo

listBookLoreRead lista até 50 IDs por página, por **name**, usando projeção sem
campos. Não abre fichas ou corpos. Cursor fechado vincula livro e listToken.
O token inclui dono, ID, nascimento nativo do livro e localLoreVersion; ausência
legada desse clock vale zero, e valor inválido bloqueia. Escritas legítimas de
lore devem continuar incrementando o clock atomicamente. Alterações não
relacionadas na raiz não invalidam uma leitura de lore inalterado.

getBookLoreRead abre a ficha e pode exigir o readToken recebido da lista.
ReadToken inclui listToken e identidade nativa completa da ficha. Ausência
retorna null somente sem token esperado. O header contém modo inline/payload,
manifest de transporte da base e descriptor das relações, sem prosa, caminhos,
bodyId, Merkle root ou snapshots. Datas lógicas pertencem ao JSON, sem overlay
implícito do stub.

readBookLorePart exige token, seção, página e índice. Cada operação reautoriza
livro próprio existente e não deleting, a ficha atual e sua identidade. Uma
parte contém até 64 KiB; não se acrescenta teto de 8 MiB, 128 partes ou quantidade
total de fichas/relações. Cache HTTP é private, no-store e varia por Authorization.

## Provas de armazenamento

A abertura interna fica ligada à transação por WeakMap, sem aceitar DTO
reconstruído. Inline usa a projeção e o schema lógico existentes, preservando
ausências, ordem, valores vazios e duplicados. Payload exige stub fechado,
manifest, escopo e nascimento exato do corpo; header/partes são imutáveis e
cada parte tem prova de Merkle. Uma base custa quatro leituras nativas por parte.

Relações são páginas de 64. O segmento exige dono/livro/lore/geração, offset e
count exatos, imutabilidade e nascimento anterior ou igual a sealBirth.
O corpo precisa nascer até o segmento; seu ponteiro fixa a identidade exata.
Uma parte de relações custa seis leituras nativas. Cada chamada abre somente
um chunk de texto. Não usar o nascimento da ficha como sealBirth: a ficha
migrada pode ser anterior aos novos segmentos.

O protocolo entrega bytes comprovados contra o manifest confiado, mas ainda
não constitui um hidratador de domínio. O consumidor completo deve conferir
comprimento/SHA integral, UTF-8 estrito, JSON/schema, identidade de cada resposta,
ausência versus vazio e origem final antes de entregar uma ficha. Tokens não
substituem autorização nem são grants para universos ou aventuras.

## Integração e rollout

Não há produtor novo, raiz criada/ativada, permissão direta nova, mudança de
inventário ou dependência. Recriação e ABA das provas bloqueiam sem adotar a
nova encarnação. Os testes de leitura usam raiz sintética explicitamente
identificada; isso não prova a certificação ou ativação de uma restauração.

Antes de ativar livros restaurados, ainda integrar cliente/lista/assinatura,
escritores/CAS/Rules e coleta, leitores backend de contexto/referências,
backup lógico em faixas e exclusão do livro ativo. As Rules de mutação devem
proteger stubs e ponteiros antes dessa habilitação. Saída portátil ampliada,
outros campos grandes e certificação/ativação de P1 continuam pendentes.

## Evidência

[Entrega M38c1](../entregas/2026-10-23-writer-v2-leitura-privada-do-lore-completo.md):
118 casos backend distintos e três cenários SDK reais. Unicode de 9,2 MB
atravessou 141 partes e três páginas de relações; acesso direto aos corpos
continuou negado. Sem deploy, consumo de produção ou integração visual.

## Complemento em 2026-10-25 — token por ficha opcional

A [ADR 0136](0136-independent-book-lore-source-tokens.md) acrescenta
tokenVersion 2 por opção explícita. V1 continua padrão e mantém a fórmula
acima; não migrar origens persistidas. V2 fixa nascimento do livro e
identidade nativa da ficha, conservando fonte intacta após mutação alheia.
Lista/cursor/coleção conservam verificação global. As autorizações e provas
de armazenamento desta ADR permanecem exigidas em cada unidade.
