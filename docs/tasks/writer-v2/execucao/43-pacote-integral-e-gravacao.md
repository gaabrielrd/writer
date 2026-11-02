# F2-09 P1 M10 — Pacote integral por fluxo e gravação temporária

Contrato em 2026-10-22 sobre 2640f1d. P1/F2-09 abertos. Grafo consultado
primeiro; produtores M3b–M9 e interface pública de histórico conferidos nas fontes.

## Objetivo e formato

Compor todas as capturas já existentes sem arrays de registros/frames do livro
inteiro. Fechar envelope do novo .writerbook: contêiner M2 v1; manifesto
format writer-book-archive, version 1, containerVersion 1, projectKind book,
bookId e sete seções obrigatórias em ordem fixa: structure, resources, personas,
universe, history, draft, cover. JSON legado writer-book-backup v1–v6 é outro
formato e permanece inalterado.

Primeiro registro book-package, id do livro, parte zero. Cada seção mantém os
registros M3b–M9 existentes; conjunto de kinds v1 fixo e desconhecidos falham.
Toda seção tem pelo menos um registro, inclusive marcadores none/índices vazios.
Último registro book-package-end contém schemaVersion 1 e contagens de registros/
bytes por seção. Emiti-lo somente após todas as conferências e nova autorização
da origem M3b; só depois o codec pode emitir selo M2. Contadores seguros, sete
entradas fixas, payload por registro até 64 KiB. Provas/tokens/UID não entram.

Este envelope comprova presença/ordem/contagens e selo/EOF. Não comprova DTO,
duplicatas/partes por recurso, relações, remapeamento, autoria dos dados importados
ou autorização para restaurar. Leitor retorna validation envelope-only; contrato
semântico completo é o próximo passo obrigatório antes da interface/restauração.

## Produção e cancelamento

streamBookBackup congela draft e configurações sincronicamente antes de retornar
o gerador. Obter origem M3b e passá-la às capacidades; draft já congelado usa
adaptador getSource vinculado à origem quando começar. Histórico é um port
obrigatório de stream/verificação, tipado pela interface pública da feature;
não importar seus arquivos internos ou inicializar Firebase por um barrel de UI.

Produtores que recebem write usam ponte interna de uma única posição com ack
somente quando consumidor retoma após yield. Nenhum readset/fila crescente.
Cancelamento rejeita ack, sinaliza aborto e encerra consumo sem esperar RPC
callable sem cancelamento; eventual resposta é observada/descartada, sem rejeição
não tratada ou nova escrita. Cada API é conferida antes/depois de I/O para sessão/
contexto e sinal. Histórico/draft/capa continuam geradores com pressão natural.

Exigir prova retornada de cada seção. Comparar origens, revalidar estrutura,
recursos, personas, universo, histórico, draft e capa após toda a captura; conferir
raiz novamente antes do encerramento. Não bloquear novas edições: o backup é uma
captura consistente no intervalo delimitado pelos tokens, não um lock global.

## Leitura e disco

readBookBackupPackage envolve decodeBookBackup, verifica controles JSON canônicos,
ID/versão, kinds/ordem/presença/seções, contagens e EOF completo. Registros expostos
são provisórios; inspeção retorna relatório somente após selo/EOF, com limite de
memória por quadro e sete contadores. Não montar DTO completo ou liberar ativação.

BookBackupSink tem write/close/abort assíncronos. Adaptador FileSystemFileHandle
abre createWritable com keepExistingData false; grava um quadro por vez e só
confirma close após produtor retornar selo. Erro/abort/contexto antes de commit
fecha gerador e aborta sink; preservar erro primário e falha de cleanup se houver.
Não renomear, publicar ou sobrescrever projeto. Close confirmado é recibo local;
não prometer desfazer commit de arquivo já confirmado por troca posterior de UID.

saveBookBackup aceita sink ou promessa de sink e congela draft antes de aguardá-lo.
Isso permite ao host futuro abrir seletor de arquivo após congelar contribuição.
Sem botão, fallback Blob que acumula projeto, localStorage ou persistência de dados
no servidor. FileSystem Access exige permissão normal do host futuro.

## Arquivos e sequência

1. bookBackupPackage(.mjs/.d.mts) puro: versão, kinds, controles, contadores,
   leitura provisória/inspeção; syntax check Functions e testes Node.
2. book-portability: ponte interna limitada, orquestrador, adaptador de arquivo/
   sink e interface pública. Composition root do editor usa histórico público.
3. Testes: todas as seções inclusive vazias, partes/contagens, versão futura/
   footer ausente/forjado, selo/EOF, tokens fora do arquivo, backpressure,
   falha/abort/retorno antecipado sem selo/commit e concorrência de contexto.
4. OPFS/Chromium com Firestore+Storage reais: gravar arquivo por createWritable,
   inspecionar por ranges após commit e provar abort de nova captura sob mutação.
   OPFS prova plataforma/disco, não diálogo externo/UX/validação semântica.
5. Build/checks dirigidos, revisão, docs/ADR/entrega/AGENTS e commit local.

## Limites

Sem novas dependências, Rules, coleções, créditos ou RPCs. Não concluir P1/F2-09
ou contar tarefa ampla extra por este marco. Schema semântico/leitor legado,
revisão e preparação/remapeamento/ativação/cleanup/recuperação continuam obrigatórios.
Validate completo no fechamento P1; desenvolvimento somente local, sem CI/push.

## Resultado local em 2026-10-22

Implementados envelope/leitor, ponte, composição, sink e composition root.
24 Node, 114 cliente e nove cenários Chromium/OPFS com emuladores reais positivos.
Veja [evidência M10](../../../entregas/2026-10-22-writer-v2-pacote-integral-por-fluxo.md)
e [ADR 0054](../../../decisions/0054-streamed-book-package.md).
P1 permanece aberto; próximo contrato deve validar semântica e legados antes da UI.

## Host posterior

O [plano 143](143-backup-completo-no-dialogo-de-exportacao.md) conecta o produtor
ao diálogo Exportar com seleção do destino, histórico e rascunho separado.
Não altera este protocolo nem oferece fallback Blob integral/OPFS plaintext.
