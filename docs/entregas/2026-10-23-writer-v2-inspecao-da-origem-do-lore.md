# Writer V2 — Inspeção da origem do lore

Data: 2026-10-23. P1 M38c3d, passo 3b do
[plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).
Contrato na [ADR 0096](../decisions/0096-private-lore-source-inspection.md).

## O que foi implementado

Inspeção privada da presença de campos, privacidade e datas da fonte,
calculadas no servidor antes da futura adoção de uma edição. V1 lê e valida
a base por partes; v2 aplica presença/datas declaradas e confere isPublic
substituído em unidade separada; inline preserva campos e datas ausentes.

O indexador puro reutiliza domínio/UTF-8/JSON canônico do parser de campos,
com ID exato e datas válidas. Checkpoints não acumulam prosa; a base pode
ultrapassar 8 MiB/128 partes. Ranges descrevem os campos da base original,
incluindo os posteriormente substituídos: não são um índice da ficha final.

Serviço interno start/get/advance/cancel fixa a origem observada, usa CAS,
recibos/âncoras nativos e um certificado final de metadata. SHA incremental
fica no estado privado separado e é removido no EOF/cancelamento.
Reenvio confirma seu próprio evento; avanço exige autorização atual.
Cancelamento pode preceder início e conserva fence permanente.

Fonte, clock, privacidade e publicação não foram alterados. Não há callable,
novo cliente, UI ou adoção habilitados.

## Escopo

| Área                                              | Alteração                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- |
| bookLoreFieldValidation                           | Entrada de prefixo sem relaxar a entrada integral anterior |
| bookLoreBaseIndex                                 | Metadata e posições com validação incremental da base      |
| bookLoreSourceInspection / Contracts / Store      | Job privado, reautorização, SHA, recibos e certificado     |
| Fixture e testes Node/SDK                         | Fontes v1/v2/inline, tamanho, falhas e provas nativas      |
| Rules e check de Functions                        | Namespace privado negado e quatro módulos novos no check   |
| Plano, ADR, AGENTS, README, arquitetura e testing | Contrato, evidências e sequência restante                  |

## Testes executados

**205 Node distintos positivos**, em quatro arquivos:

| Arquivo                           |         Casos |
| --------------------------------- | ------------: |
| bookLoreBaseIndex.test.mjs        |      30 novos |
| bookLoreFieldValidation.test.mjs  | 93 existentes |
| bookLoreSourceInspection.test.mjs |      37 novos |
| bookLoreFieldUpload.test.mjs      | 45 existentes |

Parser/indexador, primeira regressão:

```text
tests 123
pass 123
fail 0
skipped 0
duration_ms 513.5781
```

Serviço e regressão do upload, após correção da expectativa do teste de conta:

```text
tests 81
pass 81
fail 0
skipped 0
duration_ms 1068.3217
```

Essa rodada tinha 36 novos. Após fechar as identidades nativas e incluir um
controle adicional, somente o serviço afetado foi repetido:

```text
tests 37
pass 37
fail 0
skipped 0
duration_ms 920.8036
```

A união é 205; não somar as repetições. O primeiro teste de isolamento esperava
rejeição ao consultar ID inexistente no namespace de outra conta. O serviço
retorna null para ausência, sem vazar o job original; a expectativa foi corrigida.
Não foi alterado esse comportamento do produto.

Casos cobrem todas as fronteiras de bytes, Unicode/escapes, ordem literal,
domínio, presença/datas, base grande, estado constante, v1/v2/inline, privacidade
false/removida, origem sem base, revogação, recriação de job/estado/recibo/âncora/
certificado/corpo/chunk, CAS, concorrência, retry após digest e rollback.

Merkle válido com SHA integral falso não emite certificado. A instrumentação
confirma um chunk por unidade da base. Metadata/progresso/recibos não contêm
prosa, e SHA privado desaparece no EOF/cancelamento. Um caso comprova que o
certificado histórico não implica disponibilidade de um chunk removido depois.

**Quatro cenários SDK distintos positivos**, em Firestore 1.22.0 verificado,
loopback e projeto demo dedicados:

```text
tests 4
pass 4
fail 0
skipped 0
duration_ms 31521.2756
```

1. Base Unicode com 141 partes, retry de pedido realmente concorrente,
   fonte/clock nativos intactos, estado e recibos negados ao SDK; cancelamento
   após remover a raiz e confirmação do recibo antigo.
2. Override isPublic false e ausência de createdAt em v2 resolvidos na fonte;
   revogação bloqueia o certificado e cancelamento próprio continua autorizado.
3. Chunk nativo recriado interrompe o avanço; cancelamento remove SHA e
   fence inicial impede começar depois.
4. Certificado recriado com dados idênticos é recusado, com controle positivo
   antes da recriação.

O quarto foi repetido após fechar os guardas de identidade:

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 3119.5964
```

Essa repetição não é um quinto cenário. Denies esperados são assertFails
positivos. Nenhum acesso a dados ou transação de produção, nenhuma Rule/Function
implantada e nenhuma raiz de restauração ativada.

## Outras validações

Lint dirigido, arquitetura e sintaxe dos módulos backend passaram.
Dois apontamentos iniciais de lint foram corrigidos: import sem uso e escape
redundante no teste, mantendo o mesmo valor literal.
Formatação, documentação e diff final passaram antes do commit.
Não houve código cliente/visual: tipos, Vitest, build e browser não foram
repetidos. Validate/coverage integrais continuam no fechamento de P1.

## Trabalho restante

A inspeção fornece metadata lógica; não certifica a disponibilidade atual
de todas as partes/páginas e não é grant de leitura.
Próximo incremento deve consumi-la com provas/leases/inventário na adoção CAS,
trocando geração, clock e revogação de privacidade atomicamente.

Reserva de criação, exclusão/coleta, inventário de exclusão do livro,
descoberta/recuperação de pedidos e integração dos writers/cliente continuam
pendentes. Não há worker automático novo ou habilitação do produtor.

Contextos, backup lógico/indexado, demais campos grandes, saída portátil ampliada,
certificação/ativação, capa/personas e host/UI/roundtrip/validate de P1 seguem
pendentes. M38c/P1/F2-09 e Writer V2 permanecem abertos.

Somente commit local, sem push/PR/CI remota/deploy ou nova dependência.
