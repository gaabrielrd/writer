# ADR 0072 — Lore próprio na preparação privada da restauração

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M28, depois das ADRs 0065–0071

## Problema

P1 já prepara a estrutura do livro e seus corpos de texto. As fichas próprias e
suas relações precisam usar IDs remapeados, provas nativas e limpeza antes da
ativação. O formato permite recursos intercalados; supor lore contíguo perderia
fichas válidas. Um item lógico de até 8 MiB pode exceder um documento Firestore.

## Decisão

advanceBookRestoreLore é interno e não pertence a BOOK_RESTORE_METHODS. Somente
depois da estrutura, com estado content-verified, nascimento/reserva vigentes e
CAS do checkpoint, ele lê itens por createVerifiedBookRestoreContent. Cada
transação verifica item.verify(tx) e, quando há relações, page.verify(tx).

A preparação v2 mantém o cursor principal itemIndex no início dos recursos e
avança loreItemIndex para varrer somente a seção validada. Apenas book-lore
produz fichas; os demais recursos aguardam seu escritor. book-resources confere
loreCount antes da transição resources → scenes. Não há raiz ou ativação.

Campos autorais são copiados sem normalizar prosa ou preencher ausências, com
bookId destino e datas novas fixadas na preparação. relations ausente continua
ausente; vazio continua vazio. M21 remapeia alvos locais, inclusive removidos,
e conserva referências externas sem resolver/globalizar conteúdo.

Cada unidade aplica até 64 relações. relationOffset identifica a página atual;
loreCount e loreRelationCount são cumulativos. Ao continuar uma ficha, o corpo
anterior deve corresponder à base remapeada e ao tamanho do prefixo; o journal
prova nascimento e atualização contra recibos imutáveis da mesma operação.
Clone do cursor por tentativa evita duplicação no retry automático do SDK.

Antes da primeira escrita, certificar vazio o novo namespace lore e seus journals
e migrar atomicamente para cleanupVersion 6. O inventário preserva v1–v5,
acrescenta pares tipados de lore e remove corpos v5 antes dos artefatos simples.
A limpeza usa máscaras, até limit pares por lote e certificação vazia independente,
repetida no final. Documento ou recibo recriado interrompe sem apagar o par.

## Consequências e limites

O armazenamento nativo atual ainda pode recusar campo/ficha grande. A transação
falha inteira, sem avançar cursor/recibo e sem truncar; a fonte integral continua
disponível e cancelável. Não reduzir o limite lógico do backup. Representar todos
os campos grandes e adaptar consumidores é pendência obrigatória antes da ativação.

Também faltam cenas/fontes/referências/narrativa, personas, histórico/rascunho/capa,
autorização final e host/UI/roundtrip. Isso não encerra P1/F2-09. Não há Rules,
índice, transporte, publicação, dependência ou deploy novo. Rollout futuro deve
implantar leitores/cleanup v6 antes de habilitar este produtor interno.
