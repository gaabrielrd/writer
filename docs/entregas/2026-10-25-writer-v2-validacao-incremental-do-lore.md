# Writer V2 — validação local e servidor do lore incremental

- Data: 2026-10-25.
- Marco: P1 / M38c12 C2.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md), aberto.
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O validador local e o servidor aceitam lore lógico acima de 8 MiB/128 partes
sem recompor a ficha inteira. ContentMachine controla begin/advance/finish:
um item aberto bloqueia interleaving e finalização; EOF/endereço/domínio/datas
conferidos antes de reservar o nó. Referências saem em até 64 escritas por passo.

BookRestoreLoreValidation mantém somente cursor inicial, contador, tamanho da
parte anterior, SHA serializado e no máximo um span/offset do frame pendente.
O parser de pacote avança uma vez por frame. Se houver muitas relações, cada
retomada lê um sufixo autenticado de até 64 KiB; a amplificação é limitada pelo
tamanho fixo do frame, sem custo quadrático em relação ao item inteiro.
Bytes privados são copiados por unidade antes de await para ligar hash e parser.

ValidationItems recebe ponteiro constante de lore com cursor/quantidade/SHA e
metadata dos ranges. Usa os namespaces, recibos, provas nativas e cleanup v3
existentes. A transação final confere origem e todas as observações antes de
gravar índice/checkpoint/recibo juntos. Nenhuma raiz de livro é ativada.

Checkpoints antigos sem machine.lore recebem null. Um checkpoint que já acumulava
spans do lore continua por seu caminho limitado anterior; não é fallback para
capturas novas ou para um stub físico. Leitura integral pequena reconhece o novo
ponteiro e verifica frames/SHA, conservando o orçamento anterior de alocação.
Leitor grande/remap/materialização por spans continuam sendo D.

## Critérios verificados

- [x] Validação local/servidor grande e relatórios equivalentes.
- [x] Estado sem prosa/catálogo integral de spans/relações.
- [x] Consumed, EOF, endereço lógico, sequência e domínio conferidos.
- [x] Até 64 referências por passo e buffers abaixo de 96 escritas.
- [x] Checkpoint serializado e serviços frescos em cada avanço.
- [x] Replay/CAS e alteração da origem antes/depois da leitura impedem duplicação.
- [x] Cancelamento limpa frame/índice próprios sem afetar outro livro.
- [x] Ponteiro original e recibos nativos exigidos na leitura pequena.
- [x] Compatibilidade pequena/legada e checkpoint antigo em andamento preservados.
- [x] Chromium público/OPFS real, SDK real e build/smoke locais positivos.
- [ ] Captura e selo do arquivo por C1: C3.
- [ ] Leitor/remap/materialização grandes e roundtrip: D.
- [ ] Inventários/legacy/drain/rollout/validate de P1, V2 e fases/gates restantes.

## Evidência real

**15/15 Node novos** em bookLoreContentValidation.test.mjs. No cenário servidor:
10200950 bytes/156 partes/1000 relações; snapshot máximo 3313 bytes, ponteiro
1566 bytes, 15 retomadas de frame e máximo de 64 linhas de referência por commit.
A raiz permanece ausente. O cenário local inclui texto e descrição >16 MiB.
Inclui ID máximo/qualificado, interleaving/EOF, I/O, replay/concorrência,
origem alterada antes do commit, cancelamento, JSON inválido, checkpoint antigo
com três spans e prova de nascimento do novo ponteiro.

**217 Node de regressão positivos**, em lotes dirigidos:
24 ContentMachine/BookBackupContent; 10 BookRestoreValidation;
30 BookRestoreContentRead/BookRestoreLegacyValidation; 153 nos consumidores
Structure/SourceIndexes/Resources/Remap/Counts/Lore/LorePayload/LorePrefix.
Total do marco: **232 Node distintos**, sem alegar um lote único final.

**13/13 Vitest** de inspectBookBackupContent e bookValidationIndex positivos.

**Seis cenários SDK distintos positivos** no Firestore 1.22.0 verificado,
demo/loopback, Admin e Rules reais. Quatro regressões de validação/provas/replay/
limpeza mais fonte >8 MiB e frame denso: estado/linhas/recibo com nascimento
atômico, conflito CAS, chunks recriados recusados e namespace privado negado.
Primeiro lote: 5/6 positivos, 231527.4809 ms. O teste denso usava padding incorreto
para achar o chunk; passou a usar chunkId oficial. Somente esse cenário foi
repetido: 1/1, zero skipped, 18392.3823 ms. Não houve novo lote geral de seis.
Callable/Auth/App Check em produção não executados; UID fornecido pelo harness.

**Três jornadas Chromium reais**, serviço público inspectBookBackupContent e
índice OPFS cifrado real, só loopback e sem Buffer:

1. Arquivo 20368971 bytes, 1015 leituras, maior read 65655 bytes (frame e metadata),
   relatório igual ao esperado e zero diretórios temporários restantes.
2. Abort durante a leitura do lore grande rejeita e limpa o índice.
3. JSON de lore inválido sob framing/selo válido rejeita e limpa o índice.
   Não é UX de captura/restore, login, piloto ou retomada durável.

Build/typecheck/smoke positivos: **2989 módulos**; avisos existentes de chunks e
imports dinâmicos. Lint/sintaxe/formato/arquitetura/docs/diff e hooks conferidos
no fechamento. Suíte completa/coverage/validate ficam para fechar P1.
Sem CI/push/PR/merge/deploy, Rule, endpoint ou dependência novos.

Duas falhas iniciais do novo fixture Node foram corrigidas: respeitar consumed
ao fatiar o ID e criar documento simulado pela transação. O arquivo foi repetido
inteiro com 15/15 positivos após acrescentar os casos de compatibilidade/provas.
Revisão também preservou checkpoints antigos ainda coletando spans.
Nenhuma regra de domínio, proteção ou limite de cobertura foi reduzido.

Scripts/logs externos: writer-v2-portability-qa/m38c12c2-sdk.mjs,
m38c12c2-sdk-retake.mjs, logs correspondentes e m38c12c2-browser.mjs.
Testes permanentes não dependem deles.

## Continuidade obrigatória

C2 integra validação, sem habilitar captura/restauração integral grande. C3 deve
conectar o produtor C1 e a revalidação ao selo. D deve consumir o ponteiro por
spans autenticados, remapear relações/IDs e materializar partes com inventário,
rollback/retomada e raiz ausente, inclusive crescimento após remap >8 MiB.

O leitor integral compatível conserva seu limite anterior. Não usá-lo como
implementação da leitura grande nem mudar o limite para simular conclusão de D.
Implantação futura exige validadores/leitores coordenados e instâncias antigas
drenadas antes de emitir o ponteiro novo. Rollout e operação de produção não
foram realizados. Plano 131/P1/F2-09/V2, fases 3–5 e gates seguem abertos.
