# Writer V2 — Leitura limitada da estrutura salva (P1 M3b)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2, somente commits locais.
- **Plano:** [contrato 36](../tasks/writer-v2/execucao/36-leitura-limitada-da-estrutura.md).
- **Estado:** marco interno com validação dirigida. P1/F2-09 e o Writer V2 abertos.

## Comportamento e aceites do marco

- [x] Ler metadados próprios, estado editorial/meta, atos e capítulos salvos sem mutação.
- [x] Paginar somente identidades; preservar texto vazio/Unicode, ordem, vínculos e complementos.
- [x] Conferir autorização/origem em cada chamada e versão nativa de cada item.
- [x] Detectar metadados isolados, controle alterado, adição/remoção e recriação de IDs.
- [x] Corpo limitado por item/parte; sink aguardado, sem montar a obra inteira no serviço.
- [x] Erro/cancelamento não repetem leituras; captura inválida não produz selo M2 completo.
- [x] Exportação pública da feature; nenhum acesso a segredo, URL ou imagem externa.
- [ ] Backup completo, schema integral, mídia e restauração P1 (próximas etapas).

O livro publicado continua privado para este leitor. Capas legadas são
sinalizadas como indisponíveis, sem tratar URL como prova ou buscar seus bytes.
Importar o leitor não inicializa Firebase; a configuração produtiva é carregada
somente pela chamada efetiva.

## Arquivos e fronteiras

- bookBackupStructure.mjs e declaração: projeções, limites e ABI compartilhada.
- bookBackupRead.mjs, index.mjs e package check: três leituras autorizadas.
- book-portability: adaptador callable adiado, captura, prova final e exportações.
- Testes Functions, Vitest e SDK; ADR 0047, arquitetura, testes e planos atualizados.
- AGENTS: contrato de conferência final e ciclo de vida do controle.

## Resultados observados

Functions: nove testes novos verdes, incluindo 118 capítulos em três páginas,
corpo Unicode/escape em várias partes, legado sem datas e campos proibidos. Lote
dirigido com codec M2: 29/29, zero skip/falha/cancelamento.

Cliente: 25 testes de captura verdes; três de transporte adiado verdes; três
testes anteriores de Blob verdes. Evidência composta de 31 casos, sem alegar uma
execução única de todos. O filtro dos oito vetores de resposta inválida passou
8/8 e reportou 14 não selecionados; não contabilizar esses 14 como executados.

SDK real: nove cenários verdes no emulador demo, 5,93 s na primeira execução e 6,53 s na revalidação final.
Prova de isolamento/Rules, metadata SDK sem raiz, criação/remoção atômicas,
writers Admin legados/replay, meta de palavras/controle, 108 documentos paginados,
texto multipartes e origem deleting/ausente/recriada. O log de PERMISSION_DENIED
é a escrita proibida do controle sendo recusada, não falha da suíte.

Chromium com Firestore real no emulador e ponte HTTP somente loopback:
cinco casos contratuais positivos, 108 capítulos e um ato, 114 registros,
arquivo de 326.948 bytes, maior registro de 65.536 bytes. Preservou Unicode/vazio,
conferiu framing M2, recusou mudança de título que deixou raiz/token intactos,
recusou arquivo sem selo e interrompeu após abort do sink. Execução final 13,75 s
do harness; zero erros de runtime e zero requisições externas bloqueadas.

As duas primeiras tentativas nativas completaram os cinco comportamentos, mas
falharam o coletor de rede: o import estático inicializava App Check e tentou
www.google.com, bloqueado. O diagnóstico preservou o bloqueio; o adaptador passou
a carregar Firebase somente na chamada real. A execução final passou sem reduzir
asserções nem liberar rede. Os testes de roteamento cobrem essa correção.

A primeira verificação estática encontrou inferência de cursor/vi.fn, callbacks
sem await e métodos sem contrato this. Corrigidos sem desativar regras. O lint
também encontrou um helper Promise espalhado no teste de payload inválido; a espera
foi corrigida e os oito vetores foram repetidos com suas respostas corretas.

## Limites e continuidade

A ponte nativa usa o UID de teste no servidor, não Firebase Auth/App Check de
produção. Isolamento tem prova SDK separada. A fixture nativa acumula registros
e Blob apenas para asserções pequenas: não prova heap do consumidor/sink, disco,
diálogo de salvar, UI, temas ou restauração integral.

O serviço mantém somente um item (até 8 MiB) e uma página; tokens/prova não devem
ser gravados no arquivo. Verificar a prova depois de todas as demais capacidades
e antes do selo. Manutenção Admin deve avançar pertencimento atomicamente e não
remover controle ativo; a limpeza exige deleting.

Validate completo fica para o fechamento do grande bloco P1, conforme orientação
do operador. CI não foi consultada, disparada ou repetida; sem push, PR ou deploy.
Este marco não aumenta a contagem de tarefas amplas concluídas da V2.

## Checks finais

Typecheck, lint dirigido, arquitetura, sintaxe Functions, formato dos arquivos
alterados, links da documentação e diff verificados. Nenhum limite de cobertura,
hook, retry ou timeout reduzido. A suíte completa não foi repetida neste marco;
a validação integral continua exigida no fechamento de P1.
