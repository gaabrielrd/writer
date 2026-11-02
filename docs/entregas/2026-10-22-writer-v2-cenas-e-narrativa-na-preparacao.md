# Writer V2 — Cenas e narrativa na preparação privada (P1 M29)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 62](../tasks/writer-v2/execucao/62-cenas-e-narrativa-na-preparacao.md)
- Decisão: [ADR 0073](../decisions/0073-restored-scenes-and-narrative.md)

## Objetivo e funcionalidades

Preparar o conteúdo de cenas e planejamento narrativo de um backup validado,
com retomada e cancelamento mesmo quando um filho vem antes do pai.
É uma etapa interna da futura restauração; a cópia continua indisponível.

## Critérios atendidos

- [x] Todos os onze tipos após lore: controle sem capítulo, fontes, cenas, corpos,
      planos, referências, controles narrativos, arcos, marcos, eventos e vínculos.
- [x] IDs remapeados; texto literal, BOM/Unicode, hashes/bytes, ordem A/B, Arquivo,
      pais ausentes e fontes preservados. Datas/revisões nativas novas.
- [x] Índices usam chaves e campos dos consumidores existentes: sceneLoreLinks,
      sourceKey/sourceArcId/loreKey. Referência externa não concede acesso à origem.
- [x] Cursor/manifesto/recibo/journal/artefatos atômicos; clone por tentativa,
      prova da fonte no commit, replay e concorrência sem duplicar contadores.
- [x] Inventário v7 e progresso v3 antes dos novos recursos. Filhos removidos
      antes dos pais, consultas mascaradas/limitadas e certificação final.
      Filho sem cabeçalho ainda é descoberto pelo journal próprio.
- [x] Filhos desconhecidos, recriação nativa e dados de outros projetos preservados.
      Compatibilidade JSON v1–v6 e inventários anteriores mantida.
- [x] Vínculo canônico repetido reusa conteúdo/journal provados sem no-op de escrita.
- [x] Raiz ausente, countReady false, fase resource-counts e cursor antes de personas.
      Contagens derivadas continuam obrigatórias antes da ativação.

## Arquivos

BookRestoreResources compõe o escritor interno; ResourceProjection e ResourcePaths
definem projeções e caminhos fechados. Artifacts/Upload/UploadContracts/Integrity/
ValidationCleanup incorporam o novo inventário. Functions check inclui os módulos
novos. Testes Node/helper e bookRestoreResources.rules.test.mjs cobrem o protocolo.
AGENTS, README, arquitetura, testes, plano e execução registram regras e limites.

## Testes e validações reais

**153 testes Node distintos positivos**, em dez arquivos dirigidos, sem falhas
ou skips, incluindo 22 cenários novos de recursos:

```text
tests 153
pass 153
fail 0
skipped 0
duration_ms 5291.1102
```

Arquivos: bookRestoreResources, Lore, Structure, Remap, ContentRead, Upload,
Integrity, Validation, LegacyValidation e bookChapterText. Cobre recursos
intercalados, filhos primeiro, Arquivo/pais removidos, índices, vínculos repetidos,
rollback/retry, replay gêmeo, cancelamento durante leitura, ABA, limites, contador
de artefatos e combinação de filhos v7 com corpo externo v5.

**3 cenários distintos com SDKs reais positivos**, em emulador Firestore 1.22.0
verificado e portas loopback dedicadas:

| Cenário                                                                            | Resultado observado                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Recursos/índices, prova nativa, SDK privado e cleanup limitado com filhos primeiro | Passou em 78.048,5174 ms após correção de no-op |
| Corpo acima de 1 MiB, rollback e fonte integral sem avanço de checkpoint/recibo    | Passou em 60.257,2188 ms                        |
| Filho recriado antes do cabeçalho do pai impede limpeza sem apagar o par           | Passou em 57.284,9232 ms                        |

O primeiro lote SDK teve dois sucessos e uma falha: o teste de vínculos repetidos
identificou que o Firestore conserva updateTime ao regravar conteúdo idêntico,
enquanto o journal avançava. Corrigido para reautorizar e conferir conteúdo
integral sem regravar nenhum dos dois. Foi repetido somente esse cenário afetado:

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 78819.8259
```

Os dois cenários anteriores não usam a reutilização de vínculos e não foram
repetidos. Não somar repetições como novos testes. SDK direto de dono/outro/
anônimo permaneceu negado sob raiz ausente; outro projeto foi preservado.

Lint dirigido, check de Functions e arquitetura passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Nenhuma dependência, Rule ou API
pública nova. Sem código cliente alterado: Vitest/typecheck/build não repetidos.
npm run validate integral continua no fechamento do grande bloco P1.

## Limitações e próximos passos

Os campos wordCount/sceneCount/referenceCount, revisões derivadas e prontidão de
índices ainda precisam de reconciliação antes da raiz. O harness de leitores cria
uma raiz sintética somente no teste; isso comprova formato/consulta, sem demonstrar
ativação de uma restauração real ou contagens finais.

Representação de campos grandes e adaptação dos consumidores continuam
obrigatórias: o formato lógico permanece 8 MiB e falha nativa não trunca dados.
Também faltam personas, histórico/rascunho/capa, autorização final, ativação,
host/UI, roundtrip e validate integral. P1/F2-09 e Writer V2 continuam abertos.

O inventário cobre seus caminhos tipados, sem apagar subcoleções Admin arbitrárias.
Não houve deploy nem jornada de restauração final no navegador.
Somente commit local, CI ignorada e nenhum push/PR. Checkout original e servidor
local preservados.
