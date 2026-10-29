# ADR 0234 — captura incremental e reconferência dos próprios

- Data: 2026-10-29.
- Estado: composição interna da seção própria implementada; P3 aberto.
- Base: 17f073b. Plano [204](../tasks/writer-v2/execucao/204-captura-incremental-dos-proprios-de-campanha.md).

## Decisão

Criar a folha campaign-portability, com API injetada e definições puras de
famílias/limites compartilhadas com Functions. Usar o padrão incremental
existente de aventuras, sem importar internals dessa feature.

Transmitir raiz/progresso e unidades das nove famílias, com manifestos fechados,
base64 canônico, tamanhos/identidades fixados e SHA-256 integral de cada unidade.
O último chunk só é aceito após conferir o hash. Controles/tombstones/pais inativos
contam como omissões internas; seus envelopes operacionais não são payload.

O fluxo usa asyncRecordStream de shared, com um slot sujeito à pressão de consumo.
Conta/projeto, AbortSignal e encerramento são conferidos antes/depois de RPC e
consumo. Inputs e páginas são desprendidos antes de awaits do consumidor.
Resposta tardia ou interrupção não produz prova de conclusão.

Dobrar páginas, IDs/tokens, próximo cursor, pageToken e término em hash
incremental. Após todo o conteúdo, repetir as nove famílias desde o início,
comparar digest/contagens/páginas e revalidar a âncora. Inserção atrás de cursor
antigo e mudança S2/S3 sem alteração global precisam invalidar essa comparação.

A comparação exige apenas página atual, hashes e contadores fixos. Não criar
índice de projeto em RAM ou armazenamento temporário para essa etapa.
A prova own-data-only aparece somente no término natural e não é autorização,
selo de arquivo, prova da base ou validação semântica de um arquivo importado.

## Consequências

Não há novo job, pin, chave, prosa persistida, endpoint, UI, download ou formato
completo habilitado. C4 segue v1–v4; ampliar o inventário antes de futuros
produtores persistentes. O futuro arquivador precisa destino temporário,
demais seções e conferências integrais antes de confirmar o arquivo.

Base congelada/procedência, autorização atual, variantes/legadas e mídia ainda
têm contrato próprio pendente. A restauração não confia na prova do cliente.
P3/D/F2-09 e o objetivo Writer V2 continuam abertos.

A [evidência parcial](../entregas/2026-10-29-writer-v2-captura-incremental-dos-proprios.md)
usa leitores/captura/escritores reais sobre banco de teste com clocks nativos
simulados. Não comprova Firestore real, credenciais, Rules, navegador ou produção.
