# Writer V2 — Contrato de payloads grandes (P1 M38a)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [M38](../tasks/writer-v2/execucao/77-campos-grandes-de-recursos-e-metadados.md)
- Decisão: [ADR 0088](../decisions/0088-large-resource-payload-contract.md)

## Objetivo e resultado

Preparar o armazenamento de valores de lore e outros recursos que não cabem
num documento nativo, incluindo crescimento depois do remapeamento.
Esta entrega implementa o contrato e a leitura interna; ainda não torna um
lore grande restaurável pela UI nem grava payloads no produto.

## Critérios verificados

- [x] Geração por proprietário/livro/recurso/operação/conteúdo; retry determinista.
- [x] JSON literal, valores ausentes/vazios, ordem, Unicode/BOM e aliases repetidos preservados.
- [x] Partes de 64 KiB, manifest/cabeçalho fechados, quantidade derivada sem teto de 128.
- [x] Prova de bytes por página, incluindo árvores ímpares e vetor fixo independente.
- [x] Nascimento nativo do cabeçalho fixado; escopo, caminhos, imutabilidade e
      ordem de criação das partes verificados. Recriação e ABA recusados.
- [x] Leitura completa confere SHA, UTF-8 e JSON; falha não retorna vazio.
- [x] Uma página exige dois documentos, sem recompor todo o objeto.
- [x] Nenhuma dependência, callable, Rule, crédito ou migração nova.
- [ ] Produtor/cleanup e leitura/edição/backup de lore: M38b/M38c.
- [ ] Demais tipos, formato portátil ampliado e certificação/ativação: sequência M38/P1.

## Arquivos

BookResourcePayload/Contracts/Read implementam codec, coordenadas, manifest e
leitura interna. Functions check inclui os módulos. Fixture, testes Node/SDK,
AGENTS, documentação e plano registram as provas e condições de habilitação.

## Validação real

41 testes Node distintos positivos:

```text
tests 41
pass 41
fail 0
skipped 0
duration_ms 342.0245
```

Cobrem limites/fronteiras de partes, corpo acima de 8 MiB/128 partes, árvores
ímpares, mutações de inputs/outputs, escopo, singleton, campos fechados,
birth exato, índice inválido antes de leitura, corrupção de prova/bytes,
recriação/ABA e JSON/UTF-8 inválidos mesmo com prova de bytes consistente.

Dois cenários SDK reais positivos, Firestore 1.22.0 verificado e loopback dedicado:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 3939.9708
```

O primeiro grava um objeto sintético de cerca de 9 MiB em 141 partes, com
cabeçalho menor que 1000 bytes, confere página aleatória com exatamente dois gets
e leitura integral idêntica por SHA. O segundo confere recriações idênticas de
parte/cabeçalho e alteração seguida de retorno ao valor original, preservando
outras gerações. Não é um restore completo nem um teste real de remapeamento
de arquivo de 8 MiB; a capacidade física está comprovada, a integração ainda não.

A execução inicial Node teve 31/33: a fixture usava valor padrão ao testar
undefined e o contador genérico registrava consultas, não gets. Corrigidos os
testes, 33/33 e depois 40/40 passaram. O primeiro SDK teve 1/2: uma gravação do
mesmo valor preservou updateTime. O cenário passou a testar ABA real e os dois
casos passaram. Não somar repetições ao total de casos.

Na revisão, a abertura foi vinculada à transação por identidade interna, impedindo
reuso em outra transação ou reconstrução por DTO, antes de qualquer get. O cenário
novo e a repetição final passaram: 41/41 Node e 2/2 SDK. Sintaxe de Functions,
arquitetura, lint dirigido, formatação, links e diff passaram. Não houve mudança cliente; Vitest/tipos/build e jornadas visuais não foram repetidos.
Validate integral fica para o fechamento de P1, conforme a instrução do usuário.

## Limitações e próximo passo

O produto ainda não chama esses módulos. Nenhum conteúdo de usuário passa a
usar o namespace antes do inventário e cleanup. M38b integra a produção de lore;
M38c integra consumidores/mutações. Os contratos atuais de entrada portátil
continuam vigentes; a saída ampliada precisa ser implementada sem truncamento.

Capa/biblioteca, ativação, limpeza posterior, host/UI/roundtrip e validate
continuam pendentes. Somente commits locais; sem CI/push/PR/deploy.
