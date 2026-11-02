# Writer V2 — Leitura das gerações de lore

Data: 2026-10-23. P1 M38c3c, passo 3a do
[plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).
Contrato na [ADR 0095](../decisions/0095-flat-lore-generation-readers.md).

## O que mudou

Backend e cliente passam a ler uma base v1 opcional junto dos campos
substituídos explicitamente, remoções e datas da geração v2. O mapa é achatado,
com sete campos conhecidos e sem cadeia de overlays. Relações podem conservar
a geração anterior ou usar páginas novas com partSealBirth obrigatório.
Livros inline e payloads v1 mantêm o protocolo anterior.

A API existente retorna manifestos por campo, nunca IDs/caminhos físicos,
Merkle ou nascimentos. Cada unidade reautoriza o token nativo e o livro.
Uma parte de campo usa cinco leituras nativas com base ou quatro sem base;
relação usa seis com base, sempre com apenas um chunk de até 64 KiB.

Cliente valida base, campos, relações e domínio antes de retornar a ficha,
preservando valores literais, ausências, duplicatas, false e datas.
Reconferência final e drenagem das quatro partes concorrentes continuam.
Não há envio dos campos intocados nem escrita no caminho de leitura.

Não há produtor v2 ou adoção de edição habilitados. Fixtures de cabeça são
harnesses explícitos; não implementam CAS, privacidade, clock, leases ou GC.

## Arquivos

| Área                                              | Mudança                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| bookLoreGenerationContracts                       | Storage achatado, ponteiros novos e geração independente de relações  |
| bookLoreStorageRead / bookLoreRead                | Seção field e compatibilidade v1/v2 com autorização por unidade       |
| bookLoreReadContracts / bookLoreReadClient        | Tipos, verificação e montagem completa da geração v2                  |
| Fixture, Node, Vitest e SDK                       | Dados grandes, presença/datas, corrupção, limites e identidade nativa |
| functions/package.json                            | Novo módulo no check de sintaxe                                       |
| Plano, ADR, AGENTS, README, arquitetura e testing | Contrato, evidências e pendências                                     |

## Testes executados

**72 Node distintos positivos** em dois arquivos: 34 novos de geração e 38
existentes do leitor v1. A primeira regressão teve 31 novos e 38 antigos:

```text
tests 69
pass 69
fail 0
skipped 0
duration_ms 669.0275
```

Após acrescentar controles do número real de leituras e compatibilidade dos
segmentos, somente o arquivo novo foi repetido:

```text
tests 34
pass 34
fail 0
skipped 0
duration_ms 394.8977
```

A união é 72, não a soma de 69 com 34. Cobrem campos acima de 8 MiB/128 partes,
leitura independente, geração sem base, datas, relações antigas/novas,
recriação de corpo/chunk/segmento, dono/clock/raiz, descriptor inválido,
isolamento de transação e custo constante com um chunk por unidade.

**85 Vitest distintos positivos** em três arquivos: 32 novos integrados ao
servidor real em memória, 51 do cliente v1 e dois roundtrips existentes.
A primeira execução teve 84 positivos e uma falha de teste ao comparar objetos
Timestamp da fixture com funções diferentes. A correção compara segundos/nanos;
somente os 32 novos foram repetidos:

```text
Test Files  1 passed (1)
Tests       32 passed (32)
Duration    2.79s
```

A base preservada e o campo novo superaram individualmente 8 MiB/128 partes,
com SHA idêntico e nenhuma escrita na fonte. Há dados sem base, campo vazio,
false, duplicatas, remoção e ausência de createdAt. Casos negativos cobrem
contratos, base inválida escondida por remoção, domínio, echo/corrupção,
cabeçalho final, revogação e drenagem de chamadas em voo.

O roundtrip novo usa um upload real selado da ADR 0094, API real e cliente TS;
a cabeça v2 é instalada apenas pelo harness e a lease permanece sealed.
Isso não prova adoção ou ativação.

**Três SDK distintos positivos**, no emulador Firestore 1.22.0 verificado,
loopback e projeto demo dedicados:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 5454.9181
```

1. Campo Unicode, relações da geração anterior, fonte nativa intacta,
   acesso SDK aos corpos negado e revogação do dono.
2. Parte e header recriados com o mesmo nascimento novo: a leitura é negada
   pela barreira anterior, embora a parte não seja posterior ao header.
3. Páginas v2 literais e recusa de parte recriada mesmo após renovar
   header/segmento/selo no harness.

Denies esperados são assertFails positivos. Não houve conexão de produção,
ativação de raiz de restauração ou implantação de Functions/Rules.

## Outras validações

Tipos, lint dirigido, arquitetura, sintaxe dos três módulos backend,
bundle e smoke passaram. Bundle conserva avisos sobre imports dinâmicos
também estáticos e tamanho de chunks. Não foram alterados componentes visuais;
não se declara nova validação de browser ou acessibilidade neste incremento.
Formatação, documentação e diff final passaram antes do commit.
Validate/coverage integrais seguem no fechamento de P1, conforme o usuário.

## Trabalho restante

Leitores v2 estão preparados. Implementar metadata lógica da origem por unidades,
geração e adoção CAS certificadas com leases/clock/privacidade no mesmo commit,
reserva de criação, exclusão/GC e coordenação com inventário de exclusão do livro.
Só então conectar diff/upload e recuperação no cliente e todos os writers Admin.

Contextos, backup lógico/indexado, demais campos grandes, saída portátil ampliada,
certificação/ativação, capa/personas e host/UI/roundtrip/validate de P1 seguem
pendentes. M38c/P1/F2-09 e Writer V2 continuam abertos.

Somente commit local, sem push/PR/CI remota/deploy ou nova dependência.
