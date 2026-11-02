# ADR 0195 — Recursos e índices privados da aventura restaurada

Data: 2026-10-27. Status: aceita para incremento interno.
Base: [ADR 0194](0194-adventure-private-structure-staging.md) e
[plano 173](../tasks/writer-v2/execucao/173-recursos-e-indices-da-aventura-restaurada.md).

## Decisão

advanceAdventureRestoreResources percorre novamente a seção de recursos depois
de structure-ready. Mantém itemIndex e os recibos anteriores; resourceIndex e
contagens privadas acompanham a passagem, com view sem títulos, texto ou referências.
resources-ready exige todas as famílias e o manifesto autenticado. O estado
continua content-verified e a raiz mínima permanece sem ownerId.

Prepara checklist e seus totais/conclusões nativos, metas/estado editorial,
planejamento presente, arcos/eventos/marcos, controles de ordem presentes,
referências de cenas, vínculos narrativos e sceneLoreLinks. Preserva strings,
datas, ranks e referências remapeadas, com limites nativos explícitos sem truncar.
Planejamento e controles narrativos ausentes continuam ausentes. Marcos usam
lookup autenticado para assegurar o arco mesmo antes dele na ordem do arquivo.

O índice entity-scenes nasce incompleto e só fica completo no manifesto da seção;
não recebe operationId de um pedido narrativo inexistente. Ponteiros de lore
externo permanecem qualificados: esta etapa não lê seu corpo nem concede acesso.
Lore local pode ser preparado depois. Antes do consumo, as APIs continuam
responsáveis por revalidar as origens.

## Atualização e prova

Targets e journals aceitam criação estrita, ensure de documento próprio comprovado
e atualização após leitura integral/hash e versão nativa da escrita anterior.
Ensure não adota alvo existente sem journal/operação de origem nem valor diferente.
A atualização substitui o valor completo com set sem merge, preservando createTime
e o primeiro criador; journal, efeito, nova versão, checkpoint e recibo confirmam
na mesma transação. Somente novos documentos aumentam artifactCount.

Todas as provas da unidade e do arco consultado são reconferidas na transação
consumidora. Conflito, cancelamento ou falha transacional não confirma parte das
mutações. Replay retorna o recibo anterior e o progresso atual comprovados.

## Limpeza

Endereços fechados passam a admitir os recursos desta etapa. Novos filhos usam
journals com prefixo 0-, anterior aos journals hexadecimais legados. Uma página
que contém os últimos filhos e os primeiros pais é dividida: confirma apenas
os filhos e deixa os pais para a próxima transação. Isso permite conferir a
ausência dos filhos antes de apagar o cabeçalho, sem ler prosa ou ampliar a página.

O índice de validação confere também arcos ainda não criados. Cabeçalhos
registrados são provados nessa passagem e têm seus filhos conferidos ao remover
seu journal. Filho estrangeiro, target faltante/alterado/recriado ou journal
inconsistente impede certificação. A reserva aposentada continua preservada.
Esta é uma prova por etapas dos namespaces conhecidos, sem snapshot contra
mutações administrativas externas ou varredura de caminhos arbitrários.

## Limites

countReady permanece false; palavras/grupos/blocos e referenceCount narrativo
ainda exigem reconstrução/auditoria antes da ativação. Lore, personas, imagens,
universo autorizado, histórico/draft, ativação, recuperação cifrada/UI e roundtrip
permanecem etapas obrigatórias. Não foi criado endpoint nem permissão SDK.
A etapa avança P2 internamente; não conclui P2/P3/D/F2-09 nem os gates de lançamento.
