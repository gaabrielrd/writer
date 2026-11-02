# Writer V2 — Histórico completo por fluxo (P1 M4)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2, commit local.
- **Plano:** [contrato 37](../tasks/writer-v2/execucao/37-historico-por-fluxo.md).
- **Estado:** marco interno validado de forma dirigida; P1/F2-09 abertos.

## Comportamento entregue

- [x] Percorrer todo o histórico por ID, preservando versões de recursos removidos.
- [x] Conferir texto por partes com SHA-256 incremental, sem juntar corpos/catálogo.
- [x] Preservar vazio, Unicode/BOM, datas, razão, rótulo e referência histórica.
- [x] Invalidar prova em hash/manifesto/cursor/origem alterados ou cancelamento.
- [x] Emitir registros M2 e índice explícito sem tokens, UID, chaves ou recibos.
- [x] Manter coletor M1, ordem da UI e cursores antigos compatíveis.
- [ ] Arquivo persistente, schema das demais capacidades e restauração P1 completos.

O novo fluxo mantém somente uma página de até 50 resumos e quatro partes de
64 KiB, com pressão de consumo pelo AsyncGenerator. O consumidor antigo em
memória continua disponível por compatibilidade; o arquivo grande usará o fluxo.
A ponte de livros confere tipos/alvos/totais e encerra o produtor ao parar.
A prova final deve ser revalidada depois das demais seções e antes do selo.

## Arquivos e decisões

- workHistory.mjs/callables: ordem id opcional, sem alterar o modo anterior.
- historyBackupContracts e workHistory: validadores compartilhados e ABI pública.
- workHistoryBackupStream: gerador, hash e verificador final.
- bookHistoryBackupRecords: projeção e registros M2 para livros.
- bookStructureCapture: preservação literal de BOM nos IDs.
- package/lock: somente @noble/hashes 2.4.0, justificado na
  [ADR 0048](../decisions/0048-history-backup-stream.md).
- Testes Functions/cliente/SDK; planos, arquitetura, testes e AGENTS atualizados.

## Resultados reais e repetições dirigidas

Functions: 36/36, sendo 33 casos anteriores e três de ordem/cursores/gates,
1,07 s. Nenhum skip/falha/cancelamento. SDK real: cinco cenários novos, 4,14 s,
com 55 versões, recursos removidos, corpo Unicode multipartes, cursores antigos,
criação/exclusão pelos writers reais, replay, dono e origem deleting/recriada.

Primeira execução cliente: 51/52; falhou a comparação de TypedArray vazio entre
realms, sem diferença de bytes. Corrigida para comparar bytes. O vetor de hash
negativo também passou a usar tamanho igual e hash diferente, isolando essa
causa. Lote seguinte de fluxo/ponte: 28/28.

Após acrescentar a rota padrão das callables, três arquivos passaram 61/61.
Na revisão, TextDecoder padrão foi identificado como incorreto para U+FEFF
literal em texto/IDs; aplicado ignoreBOM/fatal e acrescentados dois casos.
Revalidação desses dois arquivos: 47/47. São **88 casos cliente distintos com
prova positiva composta**, não uma única execução de 88 casos. Incluem vetor
vazio, abc e um milhão de a, além de versão de 20 MiB em 320 partes/80 chamadas,
sem invocar SubtleCrypto.digest para acumular o corpo inteiro.

Chromium com Firestore real no emulador e ponte HTTP somente loopback:
cinco cenários em um probe, 58 versões, incluindo recursos removidos, texto vazio,
BOM em livro/versão/prosa e Unicode. Estrutura e histórico produziram 123 registros
M2, 246.139 bytes de arquivo, 216.003 bytes históricos e 61 partes históricas;
maior parte 65.536 bytes. Corrupção com mesmo tamanho foi recusada por hash e
deixou arquivo sem selo; criação manual real invalidou a prova; abort não fez
outra chamada. Execução final 9,46 s do harness, zero runtime errors e zero
requisições externas bloqueadas. A execução anterior de 57 versões também passou;
a final ampliou Unicode/BOM sem remover asserções.

## Checks e auditoria

Build, incluindo typecheck/bundle/smoke, passou. Lint dirigido, arquitetura e
sintaxe dos módulos/testes alterados passaram. Formato, links e diff conferidos
antes do commit; hooks preservados.

Build mantém aviso de chunk >500 kB e import estático/dinâmico de exportDocx.
Acrescenta aviso de import dinâmico ineficaz de workHistoryCallables: a UI antiga
também o importa estaticamente. O import adiado isola o leitor standalone; não
foi anunciado ganho de separação do bundle.

npm audit --omit=dev saiu **1**, com três avisos moderados existentes em
mammoth/argparse/sprintf-js. A auditoria do package/lockfile anterior confirmou
os mesmos objetos de vulnerabilidade; nenhum achado na nova biblioteca.
Sem alto/crítico e sem downgrade automático do importador. Não declarar audit
verde nem omitir os avisos do fechamento de P1.

Validate completo continua para o grande bloco P1, conforme decisão do operador.
Nenhuma CI consultada/disparada, push, alteração de PR, deploy ou merge.

## Limites e próximo trabalho

A ponte HTTP nativa fixa UID de teste; não prova Firebase Auth/App Check produtivo.
Isolamento tem prova SDK distinta. A fixture acumula frames/Blob para asserções
pequenas; não prova heap do sink, disco, diálogo de salvar, UI ou temas.
O catálogo grande e a versão de 20 MiB são provas de consumo do serviço, não do
arquivo persistente futuro. A manutenção Admin precisa respeitar clocks e
imutabilidade M1; testes de corrupção deliberadamente violam essa imutabilidade.

Ainda faltam cenas/fontes, narrativa, lore, personas, rascunho e mídia completos
no novo pacote, schema integral/leitor legado, sink persistente, revisão,
preparação/remapeamento/restauração e recuperação. O marco não fecha P1 nem
acrescenta uma tarefa ampla concluída à V2.
