# P1 M1 — Captura consistente de todo o histórico

**Estado em 2026-10-21:** marco interno implementado e validado localmente; Git/CI próprios em fechamento. P1 permanece aberto.
Complementa [P1](31-portabilidade-de-livros.md). Não é entrega independente nem
fechamento de P1: pacote, mídia, revisão e restauração ainda têm seus marcos.

## Problema e escopo

A lista atual de versões é paginada, mas não tem revisão global. Criar/remover
uma versão entre páginas pode omitir dados sem mudar as revisões de cenas/lore.
A captura deve abortar ao mudar o catálogo, em vez de misturar seleções. Versões
de recursos removidos continuam incluídas; não se consulta a existência atual
do capítulo/cena para decidir se a versão entra no backup.

A implementação fica em workHistory e manuscript-history existentes. A API já
atende livros e aventuras: o clock precisa acompanhar ambos para não criar dois
comportamentos do mesmo serviço. Isso não implementa portabilidade de aventuras.
Sem dependência nova, tela nova, mudança de retenção, limite de versões, créditos,
publicação ou acesso do cliente direto a corpos/manifestos.

## Clock persistido

Raiz do livro/aventura ganha historyRevision, inteiro seguro >=0. Ausência é
baseline legado 0 e não significa catálogo vazio. Null, negativo, fracionário,
string ou overflow falham antes de mutações. Criar uma versão manual ou a cópia
before-restore incrementa uma vez, na transação de conteúdo/recibo. Marcar uma
versão ativa como deleting incrementa uma vez na mesma transação. Apagar chunks
de uma versão já retirada da seleção não incrementa novamente. Replays e leituras
não incrementam; erro de transação não publica revisão nem versão parcial.

A validação prévia à ativação legada evita preparar contagens quando o clock já
está inválido/esgotado. A transação final relê o valor após qualquer ativação e
conserva CAS de texto, recibos e ledger atuais. Datas de manuscrito não mudam por
captura manual; historyRevision é independente da data editorial.

Rules de livro permitem criar o campo ausente/zero e exigem preservação exata
nas atualizações de cliente, inclusive presença após ativado. Nunca aceitam reset,
remoção ou incremento pelo navegador. Aventuras já têm escrita apenas no servidor.
Writers Admin e restauração futura devem seguir o mesmo protocolo; rollout precisa
atualizar os escritores e drenar instâncias antigas antes de habilitar captura.

## Contrato de leitura

Nova callable getWorkHistoryBackupSource({ target }) retorna somente:

```ts
{
  schemaVersion: 1;
  historyRevision: number;
  sourceToken: string;
}
```

Auth/App Check e autoria são os mesmos da callable de histórico. Token SHA-256
inclui versão do protocolo, UID, target, createTime/updateTime nativos precisos
da raiz e historyRevision. Não usar milissegundos nem datas fornecidas pelo
cliente para detectar recriação/ABA. Não expor dados de outra conta. Não grava
estado nem ativa contagens ao consultar. Token não é autorização persistente.

listWorkVersions/readWorkVersion aceitam expectedHistoryToken opcional. Ausência
mantém o fluxo legado. Quando presente, deve ser 64 hex minúsculos e coincidir
com a raiz autorizada na mesma transação da lista/corpo. Mudança falha com
failed-precondition, reason history-snapshot-changed, antes de retornar a página.
Input continua fechado; não aceitar campo null como ausência. Reautorizar em
toda chamada, mesmo com token válido. Recurso removido não impede ler sua versão.

Este token protege raiz e catálogo histórico. Ele não comprova sozinho snapshot
de todos os documentos do livro: metadados de capítulo escritos diretamente,
personas, progresso e mídia precisam dos seus tokens no próximo marco P1.

## Captura cliente pela interface pública

captureWorkHistoryBackup(target, isCurrent) faz:

1. Capturar o token e revision autorizados, validar a resposta fechada.
2. Percorrer a lista do projeto inteiro em páginas de 50 com o mesmo token.
3. Ler todas as versões pelo leitor existente de chunks/hash, repassando o token.
   Conferir que o resumo lido é idêntico ao selecionado na página.
4. Reconsultar o source e exigir o mesmo token/revision depois da última leitura.
5. Retornar { schemaVersion: 1, versions: [{ version, content }] } somente ao fim.

Nenhum corpo parcial é devolvido/salvo. Detectar ID/cursor repetido, ausência,
manifesto divergente e escopo errado. Preservar conteúdo exato, inclusive Unicode,
HTML, vazio, razão, rótulo e datas históricas. Retornar null ao invalidar isCurrent
antes/depois de I/O/hash; revogação/falha de token rejeita, sem fallback para cache.
Não incluir sourceToken no DTO do arquivo. Sem limite comercial de versões.
O orçamento do arquivo completo continua tarefa do pacote em P1.

## Arquivos e validação dirigida

- Functions: helper de revisão/token, workHistory, export da callable e syntax check.
- Rules: reserva do campo historyRevision em books.
- manuscript-history: tipos, callables, leitor de corpo e captura pública.
- Testes: revisão e writers/replay/rollback; captura de múltiplas páginas e versões
  de recurso removido; corrida de criação/exclusão, conta/encarnação/ABA/overflow;
  reader legado e falhas de integridade preservados.
- SDK local real: contador e recibo atômicos, token nativo, revogação/foreign,
  exclusão interrompida e proteção Rules, sem serviços live ou custo de IA.

Durante ajustes, somente suites afetadas. Não declarar pacote/restauração ou P1
concluídos por M1 verde; validate integral fica no fechamento do bloco maior.

## Evidência dirigida antes do fechamento

- Primeira unidade backend: 28/28; integração com adventureBlocks: 39/39 em 1,23 s.
  Depois foram acrescentados cinco vetores de timestamp/legado, ainda sujeitos ao
  validate integral; não somá-los como executados naquele log anterior.
- Cliente: 32/32, 1,38 s; inclui múltiplas páginas, versão vazia/removida, revogação,
  invalidação, resumo divergente, duplicação e cursor inválido. Lint dirigido verde
  após remover somente uma asserção de tipo desnecessária; typecheck passou.
- SDK/Rules de histórico: 10/10, zero fail/skip, 37,11 s. Firestore 1.22.0 local
  com SHA-256 conferido, Admin e transações reais; nenhum provedor/serviço live.
- Chromium dirigido: 6/6, 44,26 s, zero retry/skip/flaky. Livro, aventura e origem
  removida em desktop-dark/mobile-light; todos os coletores sem runtimeErrors ou
  blockedRequests. Não houve alteração visual; transporte de serviços é fictício.
- Arquitetura e documentação dirigidas passaram. Fontes, logs e manifesto nativo
  ficam no diretório privado writer-v2-portability-qa dos artefatos da sessão.
- Não houve commit/push deste marco nem fechamento P1 neste checkpoint. O validate,
  a revisão final e a documentação de trabalho são os portões locais seguintes.

## Fechamento local do bloco M1

npm ci --prefix functions passou, 251 pacotes/zero vulnerabilidades; aviso de
engine Node 22 em runtime 24.21.0 e deprecated preexistentes registrados no log.
npm run validate terminou com código 0: 219 arquivos/2.545 testes frontend,
85 scripts e 635 Functions, zero fail/skip nos resumos dessas suites. Os cinco
vetores adicionais de timestamp/legado passaram nesse bloco integral.
Cobertura: 90,98% statements, 85,64% branches, 90,68% functions, 93,62% lines;
limites preservados. Arquitetura/docs/styleguide/formato/lint/tipos/build/smoke verdes.
Avisos de chunks grandes e import estático/dinâmico de exportDocx permanecem.

Após esse validate, somente documentação/AGENTS recebe os registros finais;
repetir seus checks dirigidos, sem atribuir esses arquivos ao snapshot anterior.
A [ADR 0044](../../../decisions/0044-history-backup-snapshot.md) e a
[entrega M1](../../../entregas/2026-10-21-writer-v2-captura-do-historico.md)
separam o resultado real deste marco do pacote/restauração ainda pendentes.
O helper atual reúne o histórico em memória; o orçamento do arquivo completo
continua pendência explícita de P1, sem truncamento ou limite comercial de versões.
