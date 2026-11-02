# Writer V2 — Scanner legado retomável (P1 M17)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 50](../tasks/writer-v2/execucao/50-scanner-json-legado-com-cursor.md).
- **Decisão:** [ADR 0061](../decisions/0061-legacy-book-json-cursor.md).
- **Estado:** marco interno; P1/F2-09 e a V2 integral continuam abertos.

## Objetivo e funcionalidades entregues

A leitura estrita dos backups JSON antigos agora pode pausar e retomar em outra
instância com cursor serializado. O leitor cliente já usa essa mesma gramática,
preservando spans, fingerprint, ausências e tratamento de dados próprios/globais.

Cada passo consome até 64 KiB ou 64 valores concluídos. Cursor mantém estrutura,
chaves limitadas e estado UTF-8/lexical, sem acumular prosa ou uma lista de itens.
O teto de 512 KiB permite a combinação dos limites antigos. Bytes temporários
retornados alimentam hash; cursor não autentica arquivo ou acesso.

## Critérios de aceite

- [x] Uma gramática para passo e scanner por callbacks.
- [x] Retomada sem closures após JSON.stringify/parse.
- [x] UTF-8/BOM/escapes/números, spans e ordem de filhos preservados.
- [x] Duplicatas decodificadas, gramática inválida, limites e EOF recusados.
- [x] Strings extensas/arrays não fazem o cursor acumular conteúdo.
- [x] Limites combinados maiores que 64 KiB continuam aceitos.
- [x] Abort, fonte com tamanho alterado e falha de callback não completam hash.
- [x] Regressões cliente/nativas e revisão/documentação.
- [ ] Catálogo/normalização retomáveis e ligação do JSON legado ao job servidor.
- [ ] Materialização/mídia/ativação/host/UI/roundtrip e validate integral de P1.

## Arquivos alterados

bookLegacyJSON.mjs e declaration acrescentam passo/cursor; scanner antigo delega
ao passo. bookLegacyJSONCursor.test.mjs cobre continuação e falhas. Plano/execução,
README, arquitetura, testes, ADR e este registro atualizam estado e pendências.
Sem dependência, callable, Rule, persistência ou mudança de interface.

## Testes Node

Comando dirigido:

```bash
node --test functions/test/bookLegacyJSONCursor.test.mjs functions/test/bookLegacyJSON.test.mjs functions/test/bookLegacyReview.test.mjs
```

Saída real:

```text
tests 26
pass 26
fail 0
skipped 0
duration_ms 388.3855
```

Dez novos, cinco regressões de scanner e onze de domínio legado. Incluem cortes
em cada byte, árvores aleatórias comparadas a JSON.parse, cursor inválido,
UTF-8 fragmentado e inválido, 24 níveis/64 chaves de 256 bytes, arrays de 5.000
itens e corpo global de 9 MiB ignorado sem materialização de item excedido.

Probe diferencial privado comparou **4.500 casos determinísticos** ao scanner
do commit d8210f5: 1.641 aceitos, 2.859 recusados, **262 ms**. Aceitação, spans e
fingerprint coincidiram. Isso não é fuzz exaustivo nem teste de integração servidor.
Artefatos m17-lexical-differential.mjs/json ficam fora do Git.

Um assert de fixture inicialmente esperava offset 5 em vez de 4 (BOM de três
bytes e espaço). Corrigido sem alterar parser. ESLint detectou escape de aspas
redundante nessa fixture; removido preservando os bytes do caso.

## Cliente e navegador

Vitest dirigido: **8/8**, dois arquivos, **1,61 s** — inspeção do legado e
interoperabilidade com o exportador real usando APIs autorais simuladas.

Chromium real com File/OPFS: **11 cenários**, **4.092 ms**, processo zero.
Seis arquivos do exportador v1–v6, versão futura, corpo adulterado, abort com
limpeza, cursor serializado com janelas de 17 bytes e UTF-8 e duplicata escapada.
Maior leitura dos readers de arquivos pequenos: 6.741 bytes; 92 chamadas.
Fingerprint conferido contra Web Crypto; sem runtimeErrors ou blockedRequests.
Probe e JSON m17-legacy-native ficam fora do Git; artefatos M15 preservados.

Prova funcional do leitor, sem novo fluxo visual ou ativação/Auth produtivos.
Não houve alteração no serviço Firestore M16; sua suíte SDK não foi repetida.

## Validações executadas

Typecheck, lint dirigido, bundle e smoke passaram. Bundle mantém os avisos
conhecidos de chunks grandes e imports dinâmicos ineficazes.
Sintaxe, docs/arquitetura, formato e diff passaram. Revisão sem bloqueadores
no escopo lexical deste marco. Os hooks permaneceram habilitados.

Conforme instrução do operador, validate integral fica para fechamento P1.
Sem CI, push, PR, merge ou deploy. Checkout original E: preservado.

## Limitações e próximo passo

O scanner verifica apenas a sintaxe. O catálogo M12 e sua normalização ainda
precisam de checkpoints antes de ligar JSON v1–v6 ao servidor. Snapshot M16 de
64 KiB não comporta todos os cursores válidos deste módulo; ampliar/versionar
antes da persistência, mantendo os vínculos nativos e cleanup. Nenhum estado
novo foi persistido neste marco.

A política de draft continua pendente na conversa. Não há botão de restauração
final; nenhum livro ou histórico novo é criado por este scanner.

## Como verificar

Executar o comando Node dirigido acima. Os testes retomam o cursor como JSON,
conferem spans com JSON.parse e o fingerprint contra SHA-256 independente.
