# P2 — composição dos dados centrais de aventura

Base: 604497e, inventário 160 e bytes 161. Compor as cinco primeiras seções do
envelope: structure/resources/lore/personas/universe, com todos os corpos e
ausências explícitas, sem declarar arquivo completo. Histórico, drafts, imagens,
validador/selo/restore/UI seguem em incrementos posteriores.

## Descoberta e decisão

Grafo sem resultados; fontes atuais de inventário/unidade e recordCaptureStream
do livro conferidas. Inventário visita metadata via callback; ponte de produção/
consumo precisa manter backpressure e erro/cancelamento observados. Extrair a
ponte existente para shared/streams neutro/generic, mantendo wrapper/API de livro
e provas de regressão. Não importar internos de book-portability na feature nova.

Retorno de iterator durante espera deve abortar/sinalizar wake imediatamente e
observar produtor tardio; não aguardar RPC remoto para fechar nem permitir prova.
Preservar comportamento de ack após yield, limite de um slot e guard de contexto.

## Implementação sequencial

1. Compartilhar ponte neutra com compatibilidade de livro e testes de vida útil.
2. Definir endereços determinísticos de unidade no arquivo, sem ambiguidade de
   pai/kind/ID e sem incluir UID/sourceToken como conteúdo. Preservar IDs nativos
   nos DTOs para remapeamento futuro; verificar golden/hash por implementação
   independente. Definir manifestos de recursos/lore/personas e markers null.
3. Compor fonte fixada/root JSON e percurso completo 160; mapear bytes 161 para
   registros de até 64 KiB nas seções ordenadas. Origem de universo é neutra,
   sem token operacional. Persona null vira marcador sem perfil/instruções.
4. Contagens/digests de unidades e ausência por seção têm memória constante;
   sem lista integral de IDs ou corpos. Capturar APIs/guard/signal/fonte antes
   de next/await. Registros são provisórios, prova core-data-only ao terminar.
5. Devolver inventário como prova do primeiro percurso; segundo percurso deve
   ocorrer depois das futuras seções de histórico/drafts/imagens, antes de footer.
   Nenhum core-only valida ou sela o pacote inteiro.
6. Testar serviços reais -> registros -> envelope de teste, identidades/bytes/
   presença/ordem/manifestos, todos os perfis usados/null e origem importada;
   erro/conta/abort e retorno durante RPC/consumo. Regressões da ponte e stream de
   livro, typecheck/lint/bundle/checks pertinentes. Suite integral ao fim do bloco.
7. Revisar diff, ADR/docs/evidência e commit local. P2/P3/D e gates ficam abertos.

## Não escopo

Fonte textual ordenada do histórico, PNG/Storage/deduplicação, rascunhos locais,
arquivo completo restaurável, transporte público, UI, Rules, publicação ou grants.

## Aceites

- [x] Ponte neutra com regressões de livro e cancelamento sem resposta tardia.
- [x] Cinco seções, DTOs/IDs/ausências/perfis/origem e manifestos preservados.
- [x] Memória limitada, intenção estável, falha sem prova/arquivo completo.
- [x] Testes/checks, revisão/evidência e commit local reais.
