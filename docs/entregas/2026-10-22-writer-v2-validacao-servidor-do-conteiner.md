# Writer V2 — Validação servidor do contêiner novo (P1 M16)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, local.
- **Plano:** [contrato 49](../tasks/writer-v2/execucao/49-validacao-servidor-do-conteiner.md).
- **Decisão:** [ADR 0060](../decisions/0060-book-restore-server-validation.md).
- **Estado:** marco interno; P1/F2-09 e a V2 integral permanecem abertos.

## Objetivo e funcionalidades

O servidor já confere o conteúdo de writer-book-archive v1, retomando em novas
instâncias e sem criar livro. Pedidos repetidos confirmam recibos; concorrência
e mudança da entrada não gravam índices parciais. Cancelamento limpa os novos
dados privados em páginas.

## Aceites

- [x] Parser continuável compartilhado com os generators existentes.
- [x] JSON multipartes, histórico/draft/capa, referências e fanout completos.
- [x] Índice, item, checkpoint e recibo confirmados atomicamente.
- [x] Observações nativas reconferidas antes dos writes.
- [x] Nascimento do checkpoint/índice vinculado a recibo, com recusa de ABA.
- [x] Rejeição determinística separada de erro transitório/CAS/identidade.
- [x] Limpeza v3 limitada, preservando metadados permanentes e outros livros.
- [x] SDK direto negado; relatório/listas não retornam entrada bruta.
- [ ] JSON legado no protocolo servidor.
- [ ] Remapeamento/materialização/mídia/ativação e host/UI/roundtrip.
- [ ] Validate integral e conclusão de P1.

## Arquivos alterados

Container/Package e declarations extraem cursores/passos; adaptador de conteúdo
compartilha decodificador canônico e verificador de parte raw.
IntegrityRead acrescenta observações nativas e leitura de metadata por máscara.
Novos Validation, ValidationStep, ValidationStore e ValidationCleanup fazem a
coordenação e o inventário, compostos em Upload/Contracts e index.
Script de check inclui os quatro módulos; sem dependência nova.
Fixture de transação tem opção nativeUpdates, usada nos testes novos para
representar createTime/updateTime. O padrão dos testes anteriores permanece.

Nenhuma Rule precisou mudar: o deny recursivo existente cobre os filhos novos.
A callable exige App Check e recebe só IDs/checkpoint, sem cursor/corpo/relatório.
Timeout específico 540 s; validação local não mede produção.
Plano/execução, ADR, README/arquitetura/testes/AGENTS e esta entrega atualizados.

## Node

Lote dirigido de dez arquivos:

```text
tests 103
pass 103
fail 0
skipped 0
duration_ms 1108.3155
```

20 framing, quatro pacote, 11 conteúdo, 13 núcleo, 11 legado, quatro cursor,
nove validação servidor então existentes, 13 upload, 14 integridade e quatro HTTP.
Cobrem regressões de formatos e de cleanup v1/v2, além das capacidades novas.

Depois, cursor-array inválido foi incluído num caso existente: framing/cursor
**24/24**, 98,0722 ms. O décimo caso do serviço, de leitura tardia com pedido
idêntico já confirmado, passou com seu arquivo: **10/10**, 710,8703 ms.
São **104 casos Node distintos** conferidos neste marco, sem suíte global.

Paridade servidor usa o mesmo arquivo e compara totais/warnings ao validador
público. Inclui JSON longo por partes, raw Unicode/BOM retomado, PNG, 205 relações,
perda de resposta, checkpoint concorrente, hash/estado/origem alterados, rejeição,
cleanup e preservação de contexto alheio. Uma mutação entre preparação e commit
impede todos os efeitos pendentes. Fixtures de índice não provam Firestore;
a prova real abaixo é separada.

## Firestore real

Firestore emulator 1.22.0, JAR verificado, porta efêmera loopback:

- **Quatro casos novos passaram**, 69,6612454 s, sem pulos. Arquivo completo
  retomado em serviços novos, paridade semântica, Rules deny para dono/outro/
  anônimo sobre estado/índice/itens, transações idênticas/concorrentes e limpeza.
- Mesmo commit nativo de índice/item/checkpoint/recibo foi conferido por timestamps.
- Recriação idêntica do estado e do índice perdeu vínculo de nascimento, bloqueou
  avanço e continuou explicitamente cancelável.
- **Cinco regressões de integridade passaram**, 12,9915923 s, sem pulos,
  incluindo reader, retry, prova nativa, rejeição e cleanup v2.

PERMISSION_DENIED é a saída dos asserts negativos esperados.
Não é prova de Auth/App Check produtivos, endpoint implantado ou ativação.

## Cliente e navegador

Vitest dirigido: **46/46**, cinco arquivos em 3,47 s, inspeções/índice e
interoperabilidade com exportador. APIs autorais simuladas no exportador.
O filtro de comando também citava backupContainer.test.ts, que não correspondeu
a arquivo; não contar teste extra nem alegar seis arquivos.

Probe Chromium/OPFS real: **11 cenários**, 47,366 s (Node 48,3038425 s).
Firestore 1.22.0/Storage 1.1.3 locais. Arquivo de **1.462.103 bytes**, 170
registros, 58 versões; sete seções, Unicode/vazio/removidos, capa/hash
independente, índice protegido/limpeza/adulteração, revisões externas e abort.
172 writes aguardados, uma ativa, quadro de até 65.703 bytes.
Sem runtimeErrors ou blockedRequests; processo terminou com código zero.
Ocorreram avisos MaxListenersExceededWarning na execução de mídia; não suprimidos.

Artefatos privados m16-content-native.test.mjs/json e logs
m16-content-native-emulator.log, m16-server-validation-emulator.log e
m16-integrity-regression-emulator.log ficam fora do Git.
Esse probe exercita os readers atuais; a retomada servidor é provada nos casos
SDK acima, sem interface de restauração final.

## Validações e correções

Typecheck, lint dirigido, check sintático de Functions, bundle e smoke passaram.
Avisos conhecidos de tamanho/imports dinâmicos ineficazes do bundle permanecem.
Formato, documentação, arquitetura e diff foram conferidos; revisão sem
bloqueadores no escopo deste marco.

Primeira regressão detectou perda do congelamento de manifest.sections após
clonar cursor; retorno final voltou a usar o manifesto congelado.
Replays de cleanup v3 inicialmente recusavam seus nomes de fase; guard atualizado.
Fixture de cursor comparava Buffer a Uint8Array por protótipo; comparação de bytes
corrigida. Dois prefer-const foram ajustados. Não houve redução de asserts/limites.

## Limites e próximo passo

content-verified confirma dados internos, não autorização externa/ativação.
Entrada/mídia bruta permanece privada e não é servida como imagem pronta.
JSON v1–v6 retorna legacy-validation-pending neste novo endpoint; sua integração
servidor é a próxima etapa obrigatória e não foi substituída pela via nova.

Antes de novos DTOs/mídia, ampliar cleanup de novo. Remapear IDs/revisões/ledger,
normalizar mídia, revisar universo atual e ativar raiz/vínculo/recibo juntos.
Host/recuperação protegida, UI/roundtrip e validate integral continuam pendentes.
A escolha de tratamento de draft permanece pendente na conversa.

Sem CI, push, PR, merge ou deploy. Original E: preservado.

## Como conferir

Executar os testes dirigidos de cursor/validação e os de SDK contra emulador demo
local; o teste recusa host não loopback e não pula silenciosamente.
Não existe botão de restauração final neste marco.
