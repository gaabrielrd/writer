# Writer V2 — leitura autenticada do lore por ranges

- Data: 2026-10-25.
- Marco: P1 / M38c12 D1.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md).
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O leitor interno abre o ponteiro original do lore C2 e retorna metadata imutável,
identidade privada da origem e readRange/readField em unidades de até 64 KiB.
Campos ausentes retornam present:false sem fabricar bytes; string vazia, false,
array vazio e data zero continuam distintos. Os offsets são bytes UTF-8.

O codec calcula a posição da parte pelo framing canônico, incluindo a mudança
no número de dígitos de part. Não varre partes anteriores nem guarda um catálogo
de spans. Lê o digest anterior no mesmo arquivo autenticado e usa o decoder
existente para conferir sequência, identidade, tamanho e hash do frame alvo.
Cada parte pede três leituras, ou quatro quando precisa do digest anterior.

Cada range mantém observações próprias e limitadas dos chunks/provas nativos.
Antes de retornar e no verify(tx) do consumidor, confere job/estado/checkpoint
nativos, recibo de nascimento, ponteiro original imutável e unidades observadas.
A metadata tem sua própria verificação; não certifica disponibilidade dos corpos.
Cursor, ranges, hash e sourceToken são identidades/metadata, não grants.

Itens antigos e não lore continuam identificados explicitamente pelo retorno
null da abertura indexada. A API integral pequena mantém seu limite anterior;
não é usada como implementação do caminho grande. Sem novo endpoint, Rule,
namespace, dependência, recurso remoto ou alteração no formato do arquivo.

D1 é pré-requisito técnico de D2/D3: ainda falta remapear/medir a saída e
materializar o lore grande com retomada/inventário/rollback e roundtrip até a
ativação. Não habilita restauração grande completa ou rollout.

## Critérios verificados

- [x] Partes 0/1/9/10/99/100/999/1000/9999/10000 sem varrer as anteriores.
- [x] Arquivo selado real concorda com o decoder sequencial.
- [x] UTF-8/BOM/escapes literais, bytes dos campos e ausências preservados.
- [x] Prosa e descrições de relações maiores que 8 MiB lidas por ranges limitados.
- [x] Cada verify conserva somente provas da unidade, sem acumular a ficha.
- [x] Cancelamento, proprietário/token errados e recriações nativas bloqueados.
- [x] Provas reconferidas antes de escrever o resultado na transação consumidora.
- [x] Arquivo real capturado de base/overrides até validação e hash integral do campo.
- [x] Metadata sem corpo disponível não se transforma em conteúdo.
- [ ] Remap incremental, medição da saída ampliada e materialização grande: D2/D3.
- [ ] Roundtrip completo/ativação, inventários/legacy/drain/rollout/validate de P1.
- [ ] Demais fases/gates do Writer V2 e validações humanas/comerciais.

## Evidência real

**69 Node distintos positivos** em três arquivos: 36/36 de framing e acesso
direto (20 anteriores e 16 novos), 18/18 do novo leitor indexado e 15/15 de
compatibilidade do leitor integral. O resultado anterior deste último lote
não estava disponível; foi executado novamente somente depois de conferir
que não havia processo correspondente ativo.

O arquivo grande dos testes de serviço contém prosa e descrição de relação
acima de 8 MiB cada. A leitura final/meio/início não toca partes anteriores;
cada verificação usa no máximo quatro chunks distintos da unidade. Os fixtures
mantêm stamps nativos simulados e não provam retries reais do Firestore.

**13/13 Vitest** no bridge da captura. O caso grande agora captura base v2 com
overrides e campos removidos; os bytes selados passam upload/integridade/
validação servidor. O campo grande é lido integralmente em mais de 128 unidades
e seu SHA-256 coincide com o JSON literal original. Aliases, summary e createdAt
ausentes continuam ausentes; raiz restaurada não é criada. O histórico deste
fixture é deliberadamente vazio, conferido pelos serviços reais de source/list.

**Três SDK distintos positivos**, Firestore 1.22.0 verificado, projeto demo
isolado em loopback, Admin e serviços de produção; cliente/orquestrador C1
compilados em memória. O caso grande capturado passa validação e lê trechos
finais/meio/início com prova usada na transação consumidora.

Primeiro lote: 2/3 positivos, 276519.5348 ms. O teste ABA usou oito dígitos no ID
do chunk, mas o contrato usa quinze; a tentativa de recriar documento ausente
falhou no fixture. Corrigido para chunkId oficial e exigida existência do alvo.
As verificações SDK sobre chunks/provas também foram movidas para o caso pequeno,
com existência confirmada antes do get negado para dono/outro/anônimo. Somente
os dois casos afetados foram repetidos: **2/2**, zero skipped, 235385.3639 ms.
O caso grande é evidência da primeira rodada, sem repetir seu fluxo de dados.

As sete recriações (ponteiro, recibo, nascimento, chunk, prova, estado, job)
bloqueiam o range preparado antes da escrita. Conta/token/ranges/ausência e
cancelamento são conferidos no SDK. Não é teste de login real, Callable ou
App Check, nem ativação do livro.

**Três jornadas Chromium reais**, codec de produção no servidor local e arquivo
OPFS real de 8470397 bytes, sem Buffer no navegador:

1. Arquivo selado com 130 partes e ID Unicode/aspas; reads diretos nas fronteiras
   0/9/10/99/100/final com três ou quatro operações de I/O.
2. Recarga do navegador e reabertura do arquivo com cursor serializado; parte
   final de 733 bytes confere literalmente.
3. Corrupção e cancelamento durante I/O impedem retorno da unidade; sem pageerror.

Declaração TS conferida com --ignoreConfig, exigido pelo TypeScript 6 quando
se passa um arquivo diretamente. A primeira tentativa sem a flag falhou com
TS5112 antes de verificar a declaração; a execução corrigida passou.
Lint/sintaxe/formato dos arquivos afetados, documentação, arquitetura e diff
positivos no fechamento.
A suíte global/coverage/build/validate não foi repetida neste passo interno;
validate permanece obrigatório no fechamento de P1, conforme orientação.
Sem CI/push/PR/merge/deploy ou Auth/Callable/App Check de produção.

## Arquivos e protocolo

- BookBackupContainer e declaração: cursor compartilhado e acesso direto por parte.
- BookRestoreLoreRead: validação limitada do descriptor/ranges e leitura de trechos.
- BookRestoreContentRead: abertura interna, identidade/provas limitadas e campos.
- Testes Node do codec/leitor, bridge Vitest e cenários SDK direcionados.
- Plano 131, registro, plano 80, ADR 0151, arquitetura, testes e AGENTS.

## Como conferir

Executar os arquivos functions/test/bookBackupIndexedPart.test.mjs,
functions/test/bookBackupContainer.test.mjs e
functions/test/bookRestoreLoreRead.test.mjs com node --test; o arquivo
functions/test/bookRestoreContentRead.test.mjs cobre a compatibilidade.
O bridge está em src/features/lore/tests/bookLoreArchive.integration.test.mjs.

Os testes SDK estão em tests/firestore/bookLorePortable.rules.test.mjs:
caso de captura grande e dois casos SDK indexed restore. Exigem emulador demo
isolado em loopback. Não há nova tela de restauração grande para testar ainda.

Plano 131/P1/F2-09/V2, D2/D3 e demais fases/gates continuam abertos.
