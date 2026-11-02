# Writer V2 — Upload privado dos campos de lore (M38c3b)

- **Data**: 2026-10-23
- **Branch**: codex/writer-v2
- **Plano de origem**: [M38c3, passo 2](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md)
- **Decisão**: [ADR 0094](../decisions/0094-private-lore-field-uploads.md)

## Objetivo

Preparar um campo extenso sem reenviar a ficha inteira, com intenção fixa,
bytes/provas/recibos atômicos, verificação e cancelamento. Este incremento
implementa um serviço interno; ainda não oferece edição ativa pela interface.

## Funcionalidades entregues

- Início reservado por job/lease nativos, com inventário v1 antes dos bytes.
- Append de 64 KiB, Merkle/SHA e domínio incrementais, CAS e recibos imutáveis.
- Verificação por lotes de 16 e header somente depois, com partSealBirth nativo.
- Confirmação histórica por recibo, separada de disponibilidade/autorização atual.
- Cancelamento com fence antes do start e limpeza limitada, própria e comprovada.
- Origem inline ou payload preservada, sem alterar ficha, clock ou publicação.

## Critérios de aceite deste núcleo interno

- [x] Intenção/escopo/manifest fechados e identidade do codec anterior preservada.
- [x] Job/lease antes do primeiro byte; colisões e órfãos não são adotados.
- [x] SHA/JSON inválidos não avançam a unidade nem produzem header.
- [x] Retry, rollback e concorrência conservam bytes/estado/recibo/cursor juntos.
- [x] Mais de 8 MiB/128 partes e páginas extensas de relações sem teto menor.
- [x] Estado SHA privado separado; metadata/recibos não guardam texto livre.
- [x] Cada unidade nova reautoriza a origem; cancelamento pode limpá-la após revogação.
- [x] Origem removida permite limpar somente bytes temporários próprios.
- [x] Recursos recriados, lease adotada e filhos extras não são apagados.
- [x] Barreira das partes rejeita recriação posterior à verificação, mesmo antes do header.
- [x] Sem endpoint/campo ativo; fonte original e seus payloads intactos.
- [ ] Geração ativa/readers/adoção, criação/exclusão/GC e cliente ainda pendentes.

## Arquivos alterados

| Grupo                                             | Mudança                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| bookLoreFieldUpload / Contracts                   | Intenção, reserva, append e selo interno                  |
| bookLoreFieldUploadStore / Proofs / Cleanup       | Estado privado, recibos/âncoras, artefatos e cancelamento |
| bookResourcePayload                               | Helper de identidade extraído sem mudar o algoritmo       |
| bookResourcePayloadRead                           | Barreira opcional de nascimento das partes                |
| Fixture, teste Node e SDK novos                   | Ciclo completo, limites, corrupção e provas nativas       |
| firestore.rules                                   | Namespaces de jobs/leases negados ao SDK                  |
| functions/package.json                            | Cinco módulos novos no check de sintaxe                   |
| Plano, ADR, AGENTS, README, arquitetura e testing | Contrato, evidência e trabalho restante                   |

## Testes reais

**124 testes Node distintos positivos**, em três arquivos: 45 novos do upload
e 79 existentes de codec/leitura. A regressão inicial reuniu os primeiros
40 novos com os 79 existentes:

```text
tests 119
pass 119
fail 0
skipped 0
duration_ms 825.3636
```

Após cinco cenários adicionais e a checagem cronológica dos recibos, somente o
conjunto afetado do upload foi repetido:

```text
tests 45
pass 45
fail 0
skipped 0
duration_ms 957.0623
```

Não somar 119 e 45: a união são 124. Cobrem todos os tipos de campo, origem
inline/payload, Unicode/BOM, 141 partes e página extensa de 64 relações,
reenvio após cancelamento, fences, CAS, rollback de append/cleanup, retry após
digest, concorrência, revogação e recriações de job/lease/estado/recibo/âncora/
journal/chunk/header. Campos de origem e clock permanecem intactos.

Cleanup usa metadata sem bytes/proof e lotes de até 16 chunks. Filhos extras
impedem retirar o header; livro ou artefato recriado é preservado. Uma lease
adotada bloqueia cancelar. O teste de falso SHA usa Merkle válido para comprovar
que o hash integral também é exigido.

**Três cenários SDK distintos positivos**, Firestore 1.22.0 verificado, loopback
e projeto demo dedicados. Evidência final por cenário:

| Cenário                                                                                  | Resultado                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Campo Unicode com 141 partes, reenvio concorrente, leitura e cleanup após remover a raiz | Positivo, 87292.1284 ms                   |
| Parte recriada depois do primeiro lote de verificação, antes do header                   | Positivo na repetição final, 6844.6965 ms |
| Origem em payload, estado privado ativo, revogação, recibo após cleanup e fence inicial  | Positivo na repetição final, 3052.7623 ms |

A primeira execução teve dois positivos e um erro de fixture (tentava criar a
mesma ficha duas vezes). Foi usado outro livro e repetido somente esse cenário.
Checks adicionais de estado ativo, origem payload e ordenação dos recibos foram
validados por repetições dirigidas; elas não aumentam o número de cenários distintos.
O caso de selo também foi repetido após o ajuste da prova cronológica.
Não foi repetido o upload de 141 partes sem necessidade.

No cenário de recriação, sealed é metadata do evento: a leitura da parte falha
pelo partSealBirth, e cleanup preserva a nova encarnação e o header.
Isso não comprova disponibilidade física atual nem autoriza adoção automática.

O SDK confirma que job, estado SHA existente, recibos, lease, corpos e chunks
não admitem acesso/escrita direta. Denies esperados são assertFails positivos.
Nenhuma raiz de restauração foi ativada, nenhuma ficha foi alterada e não houve
dados, transação ou chamada de produção.

## Validações executadas

Sintaxe de Functions, arquitetura e lint dirigido passaram.
Formatação, documentação e diff final passaram antes do commit.
Não houve código cliente/endpoint: tipos/build/Vitest/browser não foram repetidos.
Validate/coverage integrais permanecem no fechamento de P1, conforme o usuário.

## Limitações e próximos passos

O serviço é interno, para ficha existente. Não foi ligado ao dispatcher ou a
callable; não há UI de upload, criação por reserva ou mudança da geração ativa.
Integrar leitores v2 e adoção de todos os campos/páginas com CAS, clock e
privacidade atômicos. Adoção deve revalidar as provas e nunca confiar apenas
em prepared ou em um recibo histórico.

Resolver privacidade/datas da origem no servidor antes da troca; integrar
criação/exclusão/coleta, inventário de exclusão do livro, leases adotadas e
controle/recuperação no cliente. O estado SHA pode conter bytes internos e só
permanece na área privada até EOF/cancelamento; não expor nem persistir na UI.

Outros leitores/backup, demais campos grandes, saída portátil ampliada e todos
os gates de certificação/ativação de P1 continuam pendentes. O formato portátil
não mudou por aceitar o campo grande neste armazenamento interno.
M38c/P1/F2-09 e Writer V2 continuam abertos.

Sem push, PR, CI remota, nova dependência, deploy ou débito.

## Como verificar

Executar os testes Node de bookLoreFieldUpload; para nascimentos/transações
reais, o arquivo SDK bookLoreFieldUpload.rules.test.mjs pelo runner demo dedicado.
O dev server continua disponível, mas não demonstra esse upload ainda interno.
