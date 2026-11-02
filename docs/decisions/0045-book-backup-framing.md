# ADR 0045 — Contêiner limitado para backup de livros

- **Estado:** adotado no marco interno P1 M2 em 2026-10-21.
- **Contexto:** [P1](../tasks/writer-v2/execucao/31-portabilidade-de-livros.md),
  [wire M2](../tasks/writer-v2/execucao/33-conteiner-limitado-de-backup.md).
- **Decisão:** contêiner binário sem compressão, com registros limitados, cadeia
  SHA-256 e selo final obrigatório. Extensão futura .writerbook, contêiner v1;
  schema semântico do livro será fechado separadamente antes de restauração.

## Motivo

O histórico não tem expiração automática e P1 deve guardá-lo inteiro. O fluxo
atual de JSON e o helper M1 acumulam dados em memória. Usar JSZip async/generateAsync
também acumula resultado, conforme sua
[documentação](https://stuk.github.io/jszip/documentation/limitations.html).
Inferência: essas APIs não demonstram o orçamento de leitura/gravação pretendido.

O contêiner usa quadros de metadata até 16 KiB e payload até 256 KiB, sem índice
global de entradas nem descompressão. O leitor confere comprimentos antes de
ler/alocar o corpo, sequência, UTF-8/JSON canônico, digest, selo e EOF. A cadeia
liga ordem e bytes anteriores; não é assinatura ou autorização de origem.

## Fronteiras

Contrato puro compartilhado em functions/src/bookBackupContainer.mjs com
declaração .d.mts; book-portability é feature folha e expõe codec/tipos e
adaptador Blob. Sem Node ou I/O no contrato. O adaptador usa intervalos da
[File API](https://www.w3.org/TR/FileAPI/#dfn-slice), atrás de services.

Geradores seguem a demanda do consumidor; buffer emitido não compartilha
estado da cadeia. Cancelamento não pede outro registro nem produz selo.
O consumidor precisa terminar o leitor para verificar o arquivo inteiro.

Apenas framing/integridade estão implementados em M2. Um registro emitido antes
do selo continua provisório; nenhum deles permite ativar projeto. O servidor
ainda deverá validar schema fechado, partes/duplicatas/relações, mídia e
autorização atual antes da ativação privada. Conteúdo do arquivo não concede
acesso, publica obra ou duplica o universo.

## Consequências e alternativas

Custo aceito: arquivo maior e protocolo próprio. ZIP permanece usado em DOCX;
a proposta ZIP em P1 era hipótese, substituída por esta decisão. Não adicionar
biblioteca de compressão ou arquivo. Mudança incompatível exige outra versão.

O limite é por quadro, sem teto comercial de versões. Contagem de quadros usa
uint32 e somas/offsets exigem inteiros seguros. Volumes/fallback de gravação,
schema do livro, captura consistente restante e restauração ainda pertencem
a P1. Montar todos os quadros em um Blob ou acumular todo histórico no consumidor
não passa a ser streaming por usar este codec. Nenhuma medição de heap do
navegador, criptografia do arquivo ou roundtrip do livro é declarada.
