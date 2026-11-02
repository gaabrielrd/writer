# ADR 0184 — composição central em fluxo de aventura

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 162](../tasks/writer-v2/execucao/162-composicao-dos-dados-centrais-de-aventuras.md).

## Decisão

streamAdventureCoreData compõe structure/resources/lore/personas/universe pela
interface pública de adventure-portability. Fonte, port, guard e signal são
fixados antes de consumo; fonte atual é conferida antes do root JSON. Percurso
metadata 160 conduz unidades 161, incluindo arquivo/ausências/filhos. Metadados
de histórico/imagens também entram na prova de inventário, sem seus corpos ainda.

Unidades preservam bytes nativos JSON em registros de até 64 KiB. Endereços de
resources e personas usam SHA de tupla canônica de família/kind/pai/ID ou scope/
binding; estrutura/lore mantêm IDs nativos. UID, sourceToken, parentToken e
proveniência operacional não são incorporados como conteúdo. adventureArchiveCore
é contrato puro, compartilhável com o futuro validador.

Resources/lore/personas têm manifestos canônicos com todos os tipos, unidades e
digest das identidades/bytes/count/hash. Seção vazia tem manifesto explícito.
Persona null tem marker sem perfil/instruções; perfil usado inclui seu estado de
arquivo e overrides permanecem nos DTOs originais. Origem de universo é neutra,
sem copiar lore/nome ou token. Totais de unidades emitidas precisam coincidir
com o inventário (estrutura inclui raiz adicional).

A prova declara core-data-only e devolve o inventário da primeira passagem.
Ainda não há footer de arquivo. Segundo percurso ocorre somente depois das
futuras seções de histórico/drafts/imagens e suas provas independentes.
Hash de corpo JSON não substitui SHA de texto histórico ordenado nem Storage.

## Ponte neutra

shared/streams contém asyncRecordStream genérico de um slot, sem domínio/I/O.
Wrapper de livro mantém assinatura/tipos e delega; nenhum interno de feature
é importado por outra. Ack só ocorre quando consumidor avança depois de yield.
Falha, conta ou abort bloqueiam próximas escritas/prova.

return fecha e resolve imediatamente mesmo esperando RPC; acorda consumidor,
rejeita ack e observa produtor tardio. Throw preserva motivo original, inclusive
não Error, como contrato do iterador; exceção de lint é local/documentada para
essa semântica. Producer só começa no primeiro next. Opções são fixadas na chamada,
sem perder a verificação dinâmica pelo closure de contexto.

## Validação e consequência

33 Vitest distintos em seleções (15 regressões de livro, sete da ponte neutra e
11 de composição) e dez Node de contrato/envelope positivos. Inclui SHA Node
independente, corpus de 53 cenas, origem importada, perfil privado arquivado/
herança, ausência e universo indisponível, ciclo de vida e intenção mutável.

Tipos/lint e bundle isolado do navegador passaram. Build do app teve falha
ambiental de criação de Node por memória no wrapper; bundle e smoke diretos,
sequenciais, passaram junto ao typecheck já verde. Nenhum limite global,
serviço de desenvolvimento ou processo alheio foi alterado para isso.

Não há endpoint/Rule/UI, pacote completo, restauração ou publicação habilitados.
P2/P3/D e gates permanecem abertos; validate integral volta no fechamento do
grande bloco de captura. Somente commits locais.
