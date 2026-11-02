# P2 — montagem retomável do histórico e texto do rascunho

Base: 3cb9e5d. Native workHistory v1, leitor raw autenticado, formato fixed64k/
utf8-parts, universo portátil e fluxo real de captura conferidos. Grafo parcial
sem cobertura destas definições; código atual foi lido.

## Objetivo

Preparar todas as versões manuais/before-restore e o texto do rascunho explícito,
com escrita limitada por avanço e sem alterar o manuscrito salvo. Manter o escopo
integral de restauração: a próxima finalização do rascunho calcula wordCount exato
com a semântica existente antes de criar seu manifesto nativo. Não criar metadado
falso nem limitar artificialmente texto histórico para caber em um documento.

## Sequência

1. Novo serviço interno após profiles-ready, com fases history/history-ready,
   contadores monotônicos fechados e cursor de seção, sem perder recibos antigos.
   Manter todos os gates seguintes, especialmente autorização de universo,
   integração de personas, draft finalize, imagens e audit/ativação.
2. Ao atravessar universe, conservar somente a origem qualificada validada no job,
   como candidata pendente de reautorização. Não ler/copiar universo nem conceder
   acesso. A passagem não confirma religação ou liberação do projeto.
3. Ampliar endereços/cleanup antes de criar workVersions/workVersionBodies e
   estado privado text-state/universe-candidate/recovered-draft em preparedRoot.
   Provar cada versão do estado privado antes de retomar o leitor raw; não aceitar
   checkpoints/prefixos do cliente. Journal/targets/checkpoint/recibo atômicos.
4. Montar UTF-8 em partes nativas de até 64 KiB, com buffer restante menor que
   uma parte em estado privado (até cerca de 100 KiB serializado), sem prosa na
   view ou no recibo. Um avanço consome um frame autenticado e escreve até duas
   partes e um manifesto. Cobrir vazios, BOM, multibyte cortado, fronteiras longas.
5. Versão histórica só recebe manifesto após SHA/UTF-8 completo e contagens
   conferidas. Preservar motivo/data/label/hash/wordCount da versão fonte,
   remapear recurso/ID e recalcular chunkCount nativo. História de recurso ausente
   não cria cabeçalho autoral. Atualizar historyRevision da definição privada.
6. Rascunho: validar a origem salva capturada, manter manuscrito e IDs próprios,
   montar texto sob ID determinístico exclusivo de versão recuperada e conservar
   descriptor com datas/baseRevision/origem/hash/partes no job. Manifesto nativo e
   wordCount exato ficam para a finalização seguinte; não inserir draft de livro
   em contrato de aventura nem descartar o texto igual ao salvo nesta montagem.
7. Conferir manifestos/totais de história e drafts antes de history-ready. A
   validação original de bytes/conteúdo e as provas de cada passo continuam
   obrigatórias; audit posterior reabre os targets antes de permitir ativação.
8. Testes dirigidos Node/Vitest e SDK demo: conteúdo real/UTF-8/vazio/histórico sem
   fonte, manuscrito intacto, múltiplas partes/reload/replay/concorrência/retry,
   rollback/cancel, prefixo ou target/journal/source adulterados, estrangeiros e
   limpeza integral. Checks/revisão/ADR/docs/evidência/commit local com hooks.
9. Suíte completa no fechamento do bloco maior. Sem CI/push/PR/deploy/agentes.

## Aceites

- [x] Montagem UTF-8 limitada, retomável e comprovada por estado privado.
- [x] Versões históricas nativas completas, com manifesto somente após o texto.
- [x] Rascunho preservado separadamente e origem de universo apenas candidata.
- [x] Metadata/recibos/cleanup compatíveis, sem adoção/ativação antecipada.
- [x] Testes dirigidos/SDK/checks, revisão/docs/evidência e commit local.

## Riscos e continuação obrigatória

Token raw/checkpoint são internos e vinculados à mesma fonte/versão comprovada.
A criação do manifesto de rascunho depende da contagem exata sobre o texto todo;
não somar contagens por chunk (HTML/Markdown e palavras cruzam partes).
O estado privado contém texto e nunca entra na view. Recuperação cifrada do
navegador continua numa fase própria.
Não alterar limites globais nem representar história como cenas ativas.
P2/P3/D/F2-09, fases seguintes, gates humanos/comerciais e macro 8/35 seguem abertos.

Evidência: [histórico e texto](../../../entregas/2026-10-27-writer-v2-historico-texto-de-aventuras.md).
13 Node novos/78 em conjunto, quatro Vitest conjuntos e três SDK demo positivos;
checks dirigidos e revisão acompanham o commit local. Não fecha finalização do
draft nem os demais gates de ativação. Sem novo validate integral neste incremento.
