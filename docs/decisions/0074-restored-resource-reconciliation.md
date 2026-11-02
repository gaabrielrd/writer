# ADR 0074 — Reconciliação privada antes de continuar a restauração

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M30, depois da ADR 0073

## Problema

Recursos preparados possuem conteúdo e identidade, mas suas contagens derivadas
ainda são neutras. O manuscrito deve combinar capítulos legados e cenas elegíveis,
mantendo Arquivo, texto sem capítulo e pais removidos preservados. Vínculos
portáteis repetidos convergem em chaves nativas únicas.

## Decisão

advanceBookRestoreCounts continua interno. Preparação v4/inventário v8 separam
o cursor de conferência da seção e o cursor dos vínculos nativos. O cursor
principal permanece antes de personas. Cada unidade clona o estado por tentativa,
compara checkpoint e confirma derivados/artefatos/journal/recibo juntos.

A primeira etapa relê a seção validada por M21 e confere item.verify(tx) antes
da escrita. Os artefatos nativos são lidos por helper que autentica nascimento e
última alteração contra journal e recibos. A projeção esperada confere campos
portáteis; apenas campos derivados já recalculados são excluídos da comparação.

A contagem da cena usa corpo/hash/bytes comprovados. O agrupador conta todas as
cenas, incluindo arquivadas, e palavras somente das ativas. Cenas sem capítulo
e pais removidos não entram no total. Não criar capítulos removidos. Um controle
sem capítulo ausente na origem pode ser materializado com o padrão A.

O manuscrito usa createWorkProgressLedger com transação de escritas em buffer.
Grupos/fontes/controle são autenticados; fonte de cena inesperadamente prévia
interrompe. Capítulos compostos conservam corpo congelado/pins sem somá-lo à
prosa canônica. Baseline de composição/estrutura passa a 1 nos agrupadores e
sequências narrativas com itens; slots A/B e datas da preparação permanecem.

A segunda etapa enumera journals de vínculos nativos com limite 1. Cursor
hash/ID é fechado e o vínculo anterior é reautenticado ao retomar.
referenceCount soma vínculos únicos, inclusive os cuja referência ficou
indisponível. Fonte narrativa ausente não é criada. Nenhuma origem externa é
resolvida ou autorizada por essa contagem.

Na migração v8, certificar ausentes o controle entity-scenes e seu journal.
Somente após conferir a seção e os vínculos, criar o artefato tipado
entity-index-control com complete true. Isso libera apenas a completude estrutural
do índice: leitores continuam reautorizando cada origem.

Toda substituição v8 idêntica conserva artefato e journal juntos, sem no-op
físico que quebraria updateTime. Inventários v1–v7 continuam válidos/canceláveis;
o controle novo usa a família narrativa já certificada no cleanup final.

## Consequências e limites

Raiz permanece ausente e countReady false. A futura ativação deve normalizar
prontidão do controle e gravar raiz/contagem no mesmo commit, depois da autorização
e certificação integral. Esta etapa não é essa ativação nem prova seu resultado.

O estado final interno é personas, sem consumir esse item. Ainda faltam perfis,
histórico/rascunho/capa, campos grandes e consumidores, autorização/ativação,
host/UI, roundtrip e validate integral. P1/F2-09 continuam abertos.
Não há nova Rule, API pública, dependência, crédito, push/CI ou deploy.
