# Writer V2 — projeção seletiva do lore para contextos

- Data: 2026-10-25.
- Marco: P1 / M38c9 A.
- Plano: [128](../tasks/writer-v2/execucao/128-projecao-logica-do-lore-para-contextos.md).
- Decisão: [ADR 0147](../decisions/0147-selective-book-lore-context-projection.md).

## Resultado

Leitor interno obtém texto lógico inline/v1/v2/criação para contextos, com campos
integrais ou prefixos e contagem exata de aliases. Não retorna projeção parcial
quando autorização, integridade, domínio ou orçamento falharem.

Marco A somente: chat ainda usa leitura legada. Integração, proveniência e budget
agregado do consumidor no marco B permanecem pendentes. Sem nova RPC/Rule,
dependência, alteração visível de chat ou ativação de rollout.

## Critérios

- [x] Observadores opcionais conservam checkpoints/gramática sem prosa.
- [x] Unicode/BOM/escapes, ausências, vazios e aliases duplicados preservados.
- [x] Prefixos sem dividir codepoint; contagem integral dos aliases.
- [x] Livro e C1 autorizados na mesma transação.
- [x] Nascimento/Merkle das partes, comprimento/SHA dos corpos utilizados.
- [x] Base >8 MiB/128 partes em fluxo sem montar detalhes integrais.
- [x] Campos/relações v2 não pedidos não são baixados.
- [x] I/O reservado antes dos chunks; retenção lógica limitada pelo consumidor.
- [x] Campos removidos/sobrescritos e privacidade efetiva conferidos.
- [ ] Matcher/snapshot/proveniência/budget do chat: próximo marco B.

## Arquivos

Parsers bookLoreFieldValidation/BaseIndex recebem observação opcional.
BookLoreTextProjection e bookLoreContextRead implementam coleta pura e leitura
autorizada. Dois arquivos Node e um SDK cobrem os contratos; plano/ADR/AGENTS/
arquitetura/testes/índices registram alcance e continuidade.

## Evidência real

**156/156 Node distintos**, quatro arquivos: 123 regressões dos parsers, 13 novos
casos de projeção e 20 do leitor. Incluem base 9,2 MB/mais de 128 partes,
checkpoints observados idênticos aos antigos, ausência de prosa no checkpoint,
aliases vazios extensos, fragmentação UTF8, corrupção após prefixo,
headers/partes recriados, livro alheio/deleting/tombstone/ausente, privacidade
divergente e orçamento agregado entre fichas. Sem skipped/cancelled/falhas.

**4/4 SDK**, Firestore 1.22.0 verificado, projeto demo/loopback dedicados:
base >8 MiB/128 partes e prefixo exato; metadata v2 sem corpos não pedidos,
remoções e parte recriada; origem criada pelo produtor real/prova original e
tombstone; budget antes de chunks e fonte sem escrita. Sem skipped/falhas.

Node compara registros sem escrita, SDK compara timestamps. Harness Node simula
stamps nativos; SDK usa Admin real no emulador. Não prova latência de produção ou
pico de heap: retainedBytes contabiliza custo lógico UTF8/contêineres.

Lint e Prettier dos sete arquivos de código e sintaxe dos módulos novos positivos.
Docs/arquitetura/diff conferidos no fechamento. Logs externos:
writer-v2-portability-qa/m38c9a-node.tap, m38c9a-sdk.tap, m38c9a-sdk.mjs e
m38c9a-sdk-emulator.log. Nenhum typecheck/build/browser repetido: interface/tipos
cliente não mudaram. Validate/cobertura global ficam no fechamento de P1,
conforme orientação. CI/remoto/deploy não executados.

## Limitações e continuidade

v1 monolítico ainda exige consumo integral para certificar; leitor não impõe teto
próprio de ficha. Consumidor deve fornecer budget explícito. v2 baixa somente
campos efetivos selecionados e isPublic necessário à conferência da cabeça.
Não transformar limites de contexto em limite de autoria/backup.

Próximo: marco B do plano 128, conservando matcher, snapshot e identidade
histórica. Demais consumidores/namespaces/escritores, backup/restauração,
drain/rollout/validate de P1, fases 3–5 e gates humanos/comerciais seguem no
objetivo. Produção não auditada. Master/servidor preservados; commit só local.
