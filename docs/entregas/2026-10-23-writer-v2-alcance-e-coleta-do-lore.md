# Writer V2 — Alcance e coleta dos corpos de lore

Data: 2026-10-23. Núcleo inicial de P1 M38c3e,
[plano 82](../tasks/writer-v2/execucao/82-alcance-e-coleta-dos-corpos-de-lore.md).
Contrato na [ADR 0097](../decisions/0097-lore-resource-reachability.md).

## O que mudou

Inventário privado de corpos usados por fontes payload v1/v2: base, campo e
página. O serviço deriva o ponteiro após reautorizar a fonte observada,
registra geração/corpo/referência com provas nativas e protege a inicialização.
Registro duplicado não reconta; referência nova invalida a varredura antiga.

Coleta interna verifica cabeça atual, referências e leases antes de remover
partes por metadata. Header sai por último e chunks extras bloqueiam concluir.
Corpos, partes e controles recriados são preservados. Fences e eventos
permanecem após coletar; corpos reclamados não aceitam referências novas.

A revisão identificou que uma página pode mudar de posição. O guard passou
a varrer todas as páginas de relações por unidades, com token nativo da cabeça,
em vez de assumir offset fixo. Dados idênticos com nascimento novo reiniciam
a varredura. Uma referência tardia na 19ª página impede todos os deletes,
inclusive quando a coleta já estava reclamada.

Não há adoção, callable, UI ou worker habilitados. Leases reservadas/adotadas
e integração da exclusão do livro continuam pendentes; qualquer lease presente
é protegida sem confiar no phase declarado.

## Arquivos

| Área                                               | Mudança                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| bookLoreResourceInventoryContracts / Store         | Controles, estado, eventos/âncoras e referências nativas    |
| bookLoreResourceInventory                          | Registro autorizado de fonte e aposentadoria de geração     |
| bookLoreResourceInventoryCleanup                   | Alcance por cabeça/referências e coleta limitada            |
| bookLoreStorageRead                                | Abertura metadata-only de página, ligada à transação        |
| Testes Node/SDK e fixture                          | Tamanho, concorrência, recriações, deslocamento e varredura |
| Rules / check de Functions                         | Namespaces privados negados e quatro módulos no check       |
| Planos, ADR, AGENTS, README, arquitetura e testing | Dependência técnica, evidência e sequência restante         |

## Testes executados

**102 Node distintos positivos**, em três arquivos: 30 novos de inventário e
72 existentes de leitura (38 v1, 34 geração v2).

Primeira regressão com os primeiros 26 novos:

```text
tests 98
pass 98
fail 0
skipped 0
duration_ms 676.9658
```

Após o reforço de alcance e da abertura nativa, somente o arquivo afetado:

```text
tests 30
pass 30
fail 0
skipped 0
duration_ms 299.7304
```

O teste de cabeça foi refinado para usar recriação com dados idênticos e
repetido isoladamente, positivo em 139.3602 ms. A união continua 102;
não somar repetições aos casos distintos.

Cobrem fonte nativa intacta, inicialização sem referência, registro duplicado/
concorrente, geração ativa/aposentada, coleção com mais de 128 partes,
metadata sem bytes/proof, header por último, lease desconhecida/adopted
protegida, livro removido/deleting/recriado/revogado, rollback e fences.

Recriações incluem controle, estado, evento, âncora, referência, geração,
header e chunk. Chunks extras preservam o header. Novo registro durante
varredura reinicia seu cursor. As páginas podem se deslocar; 19 páginas
exercitam alcance limitado, reinício da cabeça e referência tardia depois
da reclamação, sem um único chunk removido antes da conclusão.

A abertura de página recusa clone e outra transação; os readers existentes
mantêm seus resultados e quatro/cinco/seis leituras nativas por parte.

**Quatro cenários SDK distintos positivos**, Firestore 1.22.0 verificado,
loopback e projeto demo dedicados. A rodada final do protocolo de alcance:

```text
tests 4
pass 4
fail 0
skipped 0
duration_ms 19983.8271
```

1. Fonte com 141 partes, registro realmente concorrente, contador único,
   fonte nativa intacta, controle SDK negado, coleta em lotes e header por último.
2. Header/chunk recriado não é apagado; leitura positiva precede a recriação.
3. Página v2 deslocada para outro lote e lease presente bloqueiam coleta.
4. Referência recriada não reutiliza o evento imutável original.

A rodada anterior também foi positiva; os quatro foram repetidos porque o
schema de estado e o guard de alcance mudaram. Não são oito cenários.
Depois de refinar o terceiro para cabeça recriada com os mesmos dados,
somente ele foi repetido; o resultado abaixo é o final após fechar os guardas
que impedem reclamar coleta sem concluir a prova da cabeça:

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 4551.27
```

A primeira página é novamente inspecionada após recriar a cabeça; a seguinte
encontra o corpo protegido. Denies esperados são assertFails positivos.
Nenhum dado/serviço de produção, nenhuma Rule/Function implantada e nenhuma
raiz de restauração ativada.

## Outras validações

Lint dirigido, arquitetura e sintaxe backend passaram.
Formatação, documentação e diff final passaram antes do commit.
Sem código cliente/visual, tipos/Vitest/build/browser não foram repetidos.
Validate/coverage integrais permanecem no fechamento de P1.

## Limitações e próxima sequência

Este núcleo registra fontes já em payload e coleta seus corpos retirados.
Ainda não reserva uploads em geração preparing, libera leases adotadas,
materializa inline ou implementa a adoção CAS. A substituição de cabeça nos
testes é um harness, sem contrato de edição/publicação do produto.

Próximo passo: ligar uploads/leases à geração em preparação, com cancelamento
e provas coordenados; preparar campos/páginas e adotar cabeça/clock/privacidade/
recibo atomicamente. Integrar exclusão de livro/lore e os demais writers antes
de habilitar endpoint/UI. Livro ausente/deleting e qualquer lease são adiados.
Não há limpeza automática nova.

Contextos, backup lógico/indexado, demais campos grandes, saída portátil ampliada,
certificação/ativação, capa/personas e host/UI/roundtrip/validate de P1 seguem
pendentes. M38c/P1/F2-09 e Writer V2 continuam abertos.

Somente commit local; sem push/PR/CI remota/deploy ou nova dependência.
