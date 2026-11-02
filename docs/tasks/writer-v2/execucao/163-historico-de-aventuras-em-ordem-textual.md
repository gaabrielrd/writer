# P2 — histórico de aventuras em ordem textual

Base: 50fc21a, composição central 162. Compor seção history com cabeçalhos nativos
preservados e texto íntegro em ordem, sem reter versão/projeto inteiro em RAM.

## Descoberta e decisão

Grafo sem resultados; adventureBackupHistoryRead/workHistoryContracts e fixtures/
SDK conferidos. chunkRef é endereço nativo por SHA de versionId/index; listagem
física por nome não é ordem textual. Head/body já exigem nascimento posterior
à raiz, target/resource próprios e parentToken. Nenhum writer será alterado.

Acrescentar readAdventureBackupHistoryText, fechado por ordinal, RootSource e
parentToken. Na mesma transação, derivar chunkRef, validar head/chunk/índice e
devolver somente bytes UTF-8 até 64 KiB, hash da parte, identidade e manifesto
de texto do head. Não carregar metadata autoral do head ou mudar tokens existentes.

Cabeçalho original via reader de unidade mantém JSON/labels/contagens originais.
Novo registro adventure-version-body descreve layout fixed64k, headerHash,
bytes/hash do texto e quantidade portátil (pode diferir do chunkCount nativo por
fronteiras Unicode). adventure-version-text usa partes consecutivas de bytes
brutos. Texto vazio tem uma parte vazia. Não reinterpretar bytes como JSON.
Envelope v1 interno, ainda sem arquivo autoral emitido pela UI, passa a conhecer
esse kind; versionamento público não é retroativamente reescrito.

## Implementação sequencial

1. Reader por ordinal reutiliza chunkRef/headData/parent/chunkData; capture
   entrada antes de await. Zero writes, corpo externo/órfão/raiz recriada recusados.
2. Contrato puro de manifesto do corpo histórico e kind do envelope.
3. Cliente percorre versões por metadata paginada/UTF-8 e emite cabeçalho por
   unidade; lê texto por ordinal sem ordenar lista inteira em RAM.
4. Confira resposta/base64/token/manifesto/UTF-8, hash de parte, bytes/SHA completos;
   reagrupe em buffer fixo de 64 KiB e finalize manifesto de seção. Não emitir
   prova/footer após erro/conta/abort. Cabeçalhos/texto são provisórios.
5. Devolver history-data-only e totais nativos para cruzar com inventário; fonte
   conferida no início/fim. Segunda passagem global continua depois de imagens/
   drafts, antes de selo autoral. Nenhum conteúdo de source corrente é exigido.
6. Testes nativos e SDK para novo reader, mais composição cliente, snapshots
   manual/before-restore, texto vazio, Unicode/limites, 53 versões, falhas/hash/
   mudança/ABA e cancelamento. Somente checks pertinentes; integral ao fim do bloco.
7. Revisão, ADR/docs/evidência e commit local. Endpoints/UI/restore não liberados.

## Não escopo

Snapshots automáticos, alteração/exclusão de versões, transportar credenciais,
bytes de imagem/rascunho, arquivo completo, validador autoral/restauração/publicação.

## Aceites

- [x] Origem/ordinal nativos e leitura limitada na mesma transação.
- [x] Cabeçalho literal e texto completo/UTF-8/SHA, incluindo vazio e fronteiras.
- [x] Memória limitada, intenção estável, falha/cancelamento sem prova.
- [x] Testes/checks/SDK, revisão/evidência e commit local; P2/P3/D abertas.
