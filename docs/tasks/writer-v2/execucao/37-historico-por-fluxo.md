# F2-09 P1 M4 — Histórico completo por fluxo

Estado: contrato técnico de implementação em 2026-10-21, após a captura da
estrutura salva em 2b5d75e. P1/F2-09 continuam abertos. Sem CI ou envio remoto.

## Objetivo

Preservar todas as versões manuais e anteriores às restaurações, inclusive de
capítulos/cenas removidos, sem acumular catálogo, IDs, cursores ou corpos completos
na memória. Alimentar registros M2 provisórios; nenhuma leitura cria versões,
cobra créditos ou muda retenção. Não impor limite silencioso de versões ou bytes.

O coletor M1 atual continua compatível e mantém seu retorno em memória. Acrescentar
um fluxo público para o arquivo grande, compartilhando validação dos resumos.
Versões de aventuras continuam aceitas no serviço de histórico já compartilhado;
o adaptador de registros de livros aceita apenas target book e não implementa P2.

## Contrato

listWorkVersions recebe order opcional com único valor id. Ausente mantém a ordem
createdAt desc/ID desc e os cursores existentes. Em id, paginar por ID ascendente;
o escopo do cursor inclui order, sem aceitar cursor da outra ordem. Não altera
seleção, permissões, expectedHistoryToken ou mutações. No fluxo usar páginas de
50 e ordem UTF-8 estrita crescente entre todas as páginas: duplicatas/recuos são
detectados sem Set crescente.

streamWorkHistoryBackup(target, options) é um AsyncGenerator. Options admite
signal/isCurrent, origem já observada e transporte injetado para prova. A primeira
leitura autoriza e fixa sourceToken/historyRevision M1. Cada página/corpo usa o
mesmo token. O fluxo entrega cabeçalho fechado de versão e partes UTF-8 de até
64 KiB. O corpo é lido em páginas de quatro partes, com índice contínuo,
manifesto idêntico ao listado, limites coerentes e cursores que avançam. Vazio
permanece uma parte vazia. Texto/IDs Unicode não são normalizados; codificação
que alteraria o texto falha.

Conferir tamanho, partes e SHA-256 incremental antes de aceitar o fim de cada
versão. Ao final, reautorizar origem e devolver prova privada com target, source
e totais seguros de versões/bytes/partes. Falha, abort, isCurrent falso ou retorno
antecipado não entregam prova nem selo. verifyWorkHistoryBackupStream reautoriza
a prova para o orquestrador usar depois das outras seções e antes do selo M2.

O hash nativo SubtleCrypto.digest exige a entrada inteira. Adotar dependência
direta @noble/hashes 2.4.0, import seletivo sha2.js, MIT e sem dependências de
runtime. Versão/engine/integridade conferidas no registro npm e no repositório
oficial. Usa updates incrementais; não implementar criptografia própria nem
trocar hashes persistidos por outra função. Testar vetores contra Node crypto e
Web Crypto; apagar o estado do hasher no encerramento.

bookHistoryBackupRecords(bookId, stream) compõe o fluxo pelo contrato público
tipado, sem importar runtime de outra feature. Emite:

- work-version, ID da versão, parte 0: JSON do VersionSummary fechado;
- work-version-text, mesmo ID, parte correspondente: bytes UTF-8 originais;
- work-history, ID do livro, parte 0, somente após prova válida: schemaVersion 1,
  versions, byteLength e chunkCount, incluindo catálogo vazio explícito.
  Tokens/UID/chaves/recibos não entram nesses registros. Referência de recurso
  histórico removido permanece no cabeçalho e será remapeada sem recriar o recurso.

Os registros são provisórios até a verificação final de todas as capacidades e
selo/EOF M2. O adaptador encerra o gerador original ao ser interrompido. Não
presumir que o consumidor guarda bytes em disco: sink persistente/UI continuam
na etapa própria, com o orçamento de memória do consumidor a provar.

## Arquivos e sequência

1. workHistory.mjs/callables: ordem id opcional e cursores de escopo próprio;
   testes Functions e SDK de compatibilidade, páginas e gates existentes.
2. manuscript-history/model: extrair validadores já usados pelo coletor M1 e
   acrescentar tipos de partes/prova/API; manter identidade/contrato anterior.
3. manuscript-history/services: gerador e verificador final, transporte carregado
   somente na chamada; exportações públicas.
4. book-portability/services: adaptador para registros M2; type-only pela API
   pública de histórico e exportação própria.
5. Testes dirigidos: mais de 50 versões, ID/data em ordens distintas, corpo vazio,
   Unicode/muitas partes, recurso removido, hash/manifesto truncados, paginação
   repetida, abort/falha/retorno antecipado, origem alterada e sink lento.
6. Prova SDK real de order id/cursores e geração/captura; Chromium com emulador
   para bytes/hash e M2, sem fetch externo. Revisão, docs/ADR/entrega e commit local.
   Tipos/lint/arquitetura/sintaxe/links/formato dirigidos; validate completo em P1.

## Riscos e aceites

A dependência deve ficar restrita ao hash incremental. Não mudar o formato dos
hashes existentes nem relaxar regras de histórico. Ordenação por ID só pertence
ao caminho de backup; UI e cursores antigos seguem compatíveis. Manipulação Admin
de manifesto/corpo tem que respeitar imutabilidade e clock M1. O rollout M1 precisa
estar coordenado antes de habilitar exportação produtiva.

A prova deve demonstrar que a próxima página/parte só é pedida após consumo e
que o código não guarda todo o catálogo/corpo. Fixtures pequenas podem acumular
bytes para asserções, sem alegar memória do sink final. Não fechar P1 ou contar
mais uma tarefa ampla por este marco interno.

Referências primárias: [noble-hashes](https://github.com/paulmillr/noble-hashes#implementations),
[manifesto do pacote](https://github.com/paulmillr/noble-hashes/blob/main/package.json)
e [digest na documentação Mozilla](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

## Resultado local

Implementado, com ordem da UI e coletor M1 preservados. Functions 36/36, SDK cinco
casos e cliente 88 casos distintos com prova composta; corpo de 20 MiB verificado
por partes sem digest de entrada inteira. Chromium compôs estrutura/histórico
com 58 versões e cinco cenários, incluindo BOM, corrupção, mutação real e abort.
Build e checks dirigidos passaram; audit mantém três achados moderados iguais
à baseline. Veja a [entrega](../../../entregas/2026-10-21-writer-v2-historico-por-fluxo.md).
Nenhuma CI acompanhada, push ou deploy; P1 permanece aberto.
