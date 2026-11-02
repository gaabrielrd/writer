# Writer V2 — Leitura privada do lore completo (M38c1)

- **Data**: 2026-10-23
- **Branch**: codex/writer-v2
- **Plano de origem**: [M38c, etapa 1](../tasks/writer-v2/execucao/80-consumidores-do-lore-completo.md)
- **Decisão**: [ADR 0091](../decisions/0091-private-complete-lore-reads.md)

## Objetivo

Permitir que futuros consumidores recuperem todo o lore próprio do livro,
inline ou em payloads, com autorização em cada unidade e sem fichas vazias
produzidas a partir de stubs. Esta entrega implementa a API servidor; a
integração com a interface continua pendente.

## Funcionalidades entregues

- Lista privada de IDs por páginas de até 50, incluindo stubs sem name, sem
  transferir seus textos e sem limitar o total de fichas.
- Abertura fixada por token de coleção e identidade nativa, com header sem prosa,
  caminhos físicos ou snapshots.
- Leitura de base e relações por partes de até 64 KiB; autorização, escopo,
  nascimento, imutabilidade e prova de conteúdo conferidos em cada chamada.
- Compatibilidade inline e com fichas migradas anteriores aos segmentos novos;
  ausência/vazio e valores literais preservados pelo protocolo.

## Critérios de aceite de M38c1

- [x] Dono, estado e identidades reconferidos em cada unidade.
- [x] Raiz ausente permanece inacessível; nenhum job é ativado pelo leitor.
- [x] Índices inválidos não abrem chunks; cada parte usa apenas um chunk.
- [x] Custo de quatro leituras nativas por parte da base e seis por relações.
- [x] Recriação/ABA de ficha, livro, corpo, parte ou segmento bloqueiam.
- [x] Header sem conteúdo/ponteiros; cache privado/no-store.
- [x] Sem teto adicional de 8 MiB/128 partes e sem grant SDK novo.
- [ ] M38c completo: etapas 2–7 continuam abertas, incluindo cliente e mutações.

## Arquivos alterados

| Grupo                                               | Mudança                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| bookLoreRead / Contracts                            | Três operações privadas, tokens, cursor e headers                       |
| bookLoreStorageRead                                 | Abertura inline/payload e unidade de leitura comprovada                 |
| bookRestoreLorePayloadContracts / produtor / leitor | Helper puro compartilhado de ID de segmento, mantendo reexport anterior |
| functions/index e package                           | Dispatch, exports callable e verificação de sintaxe                     |
| Testes Node, fixture e SDK                          | Casos de leitura, compatibilidade, autorização e provas nativas         |
| Plano, ADR, AGENTS, README, arquitetura e testing   | Contrato e evidências, mantendo P1 e Writer V2 abertos                  |

## Testes e validações reais

**118 testes backend distintos positivos em quatro arquivos**: 38 de leitura
novos e 80 de regressão de codec, produtor e migração. A execução conjunta
inicial, antes dos dois últimos casos, registrou:

```text
tests 116
pass 116
fail 0
skipped 0
duration_ms 17399.5909
```

Comando: node --test functions/test/bookLoreRead.test.mjs
functions/test/bookResourcePayload.test.mjs
functions/test/bookRestoreLorePayload.test.mjs
functions/test/bookRestoreLorePrefix.test.mjs.

Os dois casos adicionais foram executados isoladamente por nome: limite real
de leituras/chunks e ficha com nascimento anterior aos segmentos protegidos
por sealBirth explícito:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 140.0282
```

Cobertura de comportamento: conteúdo literal e relações completas; opcional
ausente/vazio; mais de 8 MiB/128 partes; 138 IDs em páginas de 17 sem corpos;
escopos/cursor/token; legacy sem clock; mudanças alheias na raiz; revogação;
recriação e ABA nativos; ponteiro malformado sem fallback; segmento de outra
ficha ou contagem incorreta; seal anterior; bounds e abertura ligada à transação.

**Três cenários SDK distintos positivos**, Firestore 1.22.0 verificado em
loopback dedicado. A primeira execução registrou:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 37007.0021
```

O literal Unicode da fixture SDK tinha sido convertido incorretamente na
gravação do arquivo: produziu 316 partes, em vez do objeto pretendido.
A expressão foi corrigida para String.fromCodePoint e somente esse cenário
afetado foi repetido:

```text
141 base parts; 3 relation pages
tests 1
pass 1
fail 0
skipped 0
duration_ms 13694.424
```

Assim, a evidência final são os dois cenários não afetados da execução inicial
e o cenário Unicode corrigido; não são quatro casos distintos. O corrigido
confere SHA completo de texto com BOM/Unicode (9.200.003 bytes em details),
aliases, todas as 130 relações, leitura inline e nascimento da ficha anterior
aos segmentos. Os demais conferem recriações nativas e autorização por unidade.
Os denies SDK esperados foram positivos por assertFails: corpos/segmentos
continuam privados, sem alteração das Rules.

Os testes usam artefatos nativos reais e uma raiz de harness para leitura;
não executam a ativação/certificação de um job, migração ou acesso de produção.

Sintaxe de Functions, arquitetura e links passaram. O lint dirigido encontrou
um import não usado e uma declaração let sem reatribuição no teste; ambos
foram corrigidos sem mudança de comportamento. O lint dirigido final passou
(exit 0), assim como a formatação dos arquivos do incremento.
Nenhum código cliente mudou, portanto Vitest/tipos/build e jornadas visuais
não foram repetidos. Validate integral permanece no fechamento de P1 por
instrução do usuário; CI ignorada, somente commits locais.

## Fora do escopo, limitações e pendências

M38c1 não entrega ainda o hidratador cliente: ele deve validar SHA integral,
UTF-8/JSON/schema e reautorizar a origem final antes de entregar o objeto.
Lista/assinatura, create idempotente, escritores/CAS/Rules/coleta,
contextos/referências/publicação, backup lógico em faixas e exclusão ativa
continuam nas etapas 2–7. Não habilitar payloads com escritores antigos.

Outros campos grandes, saída portátil ampliada, certificação/ativação,
capa/biblioteca, host/UI/roundtrip e validate continuam em P1/F2-09.
Writer V2 segue aberto. Sem push, PR, deploy, raiz ativada ou novo débito.

## Como verificar

Executar o teste Node dirigido de bookLoreRead; para provas de nascimento e
Rules, executar o arquivo SDK bookLoreRead.rules.test.mjs pelo runner dedicado
em um emulador de projeto demo. Não usar dados de produção. A interface atual
não é evidência da nova API até a integração e o rollout correspondentes.
