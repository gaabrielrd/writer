# F2-09 P1 M17 — Scanner JSON legado com cursor

Contrato em 2026-10-22 sobre d8210f5. Continuação obrigatória da validação
servidor JSON v1–v6; não substitui catálogo/normalização nem sua ligação ao job.

## Objetivo e requisitos

Converter o scanner estrito M12 em passos retomáveis compartilhados com a API
existente. Ler até 64 KiB ou 64 valores concluídos por passo. Manter spans byte
exatos, ordem pós-filhos, EOF, BOM inicial, UTF-8 fatal, escapes, gramática de
números, duplicatas por chave decodificada, recusa de **proto**, profundidade 24,
64 chaves por objeto e chave raw de até 258 bytes incluindo aspas.

Cursor privado fechado/versionado com tamanho da entrada, offset, pilha,
token lexical, prefixo e estado UTF-8. Não guarda prosa de strings nem arrays
inteiros. Guarda chaves limitadas para detecção de duplicatas. Limite de cursor
512 KiB suporta a combinação dos limites existentes; não reduzir compatibilidade
aos 64 KiB do checkpoint M16. Integração futura deve versionar/ampliar snapshot
antes de persistir esse cursor; este passo não escreve em Firestore.

A API scanBookLegacyJSON usa o mesmo passo, calcula fingerprint sobre bytes
realmente consumidos e mantém callbacks/abort e liberação do hasher. Estado e
bytes retornados não constituem autenticação; servidor deve seguir M14/M16 com
provas nativas e snapshot ligado a recibo.

## Suposições, sequência e não escopo

Formato não muda. Não adiciona dependências, grants, root, mídia ou callable.
A decisão sobre draft não afeta parsing. Continuam pendentes: catálogo e
normalização legados retomáveis, integração ao job, materialização, ativação,
host protegido/UI/roundtrip e validate integral de P1.

1. Implementar cursor/passo e tipos no scanner existente.
2. Fazer scanner por callback delegar ao passo único.
3. Testar retomada com JSON roundtrip do cursor, cortes em cada byte (BOM/UTF-8/
   escapes/literais/números), duplicatas/EOF/limites/cursor inválido e abort.
4. Regressões dos seis formatos e inspect no cliente; lint/types/bundle conforme
   refactor browser. Sem reexecutar emulador de serviço inalterado.
5. Rever diff/docs e registrar entrega/commit local. Sem CI/remoto/subagentes.

## Riscos e aceites

Conservar estado UTF-8 entre janelas; detectar final incompleto mesmo quando
último valor atingiu o limite do passo. Uma chave escapada duplicada deve colidir
com a mesma chave literal. Sequência de eventos e fingerprint devem coincidir
com JSON e bytes reais. Projetos não têm limite de quantidade de itens;
memória/cursor por passo permanecem limitados. Testar objeto profundo com 64
chaves por nível para não rejeitar casos antes válidos.

- [x] Um único scanner, retomada sem closures/processo anterior.
- [x] Gramática e spans corretos nos cortes e ordem arbitrária.
- [x] Limites/UTF-8/duplicatas/EOF/abort recusados corretamente.
- [x] Prosa extensa não aparece no cursor; arrays grandes não o fazem crescer.
- [x] Regressões dirigidas/documentação/entrega/commit local.
