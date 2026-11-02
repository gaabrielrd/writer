# Writer V2 — Personas na preparação privada (P1 M31)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 64](../tasks/writer-v2/execucao/64-personas-na-preparacao-privada.md)
- Decisão: [ADR 0075](../decisions/0075-restored-persona-definitions.md)

## Objetivo e funcionalidades

Preparar os perfis usados pelo livro, capítulos e fontes de conversão, com
deduplicação e vínculos próprios. Preservar a biblioteca atual e o conteúdo
portátil exato, incluindo perfil arquivado, sem expor a cópia parcial.

## Critérios atendidos

- [x] Leitor M21 e verify(tx) no commit; vínculo do livro confere metadata do
      arquivo, e capítulo/fonte conferem complemento no artefato nativo comprovado.
- [x] IDs remapeados e snapshots integrais: instruções brutas/BOM/espaços, atributos,
      estado de arquivo, revisão e datas preservados, sem defaults ou truncamento.
- [x] Uma definição por personaId e igualdade/hash; vínculos por scope/ownerId
      sem prosa. Definição repetida conserva native/journal sem no-op físico.
- [x] Presets copiados sob identidade própria; legado ausente permanece ausente,
      sem usar perfil atual coincidente. Nenhuma biblioteca não usada é copiada.
- [x] Coleções preparedPersonas/personaBindings privadas sob o job; nenhum write
      em aiPersonas. Inventário v9 antes da criação e namespaces certificados.
- [x] Contadores por scope/perfis distintos conferem manifesto e relatório.
      Progresso v5 preserva resourceEndIndex e a prova de contagens anterior.
- [x] Cursor, perfis, vínculos, journals e recibos atômicos; replay/CAS/retry e
      falhas não duplicam perfis nem avançam parcialmente a preparação.
- [x] Cleanup limitado/mascarado, inclusive lote parcial e proteção contra
      recriação, com certificação final das duas coleções.
- [x] Estado universe antes do próximo item, raiz ausente/countReady false.
      Consumidores e disponibilidade dos perfis continuam pendentes de integração.

## Arquivos

BookRestorePersonas compõe o escritor interno. Artifacts/Upload/UploadContracts/
Integrity/ValidationCleanup incorporam inventário v9 e progresso v5; Functions
check inclui o novo módulo. Testes Node/helper e bookRestorePersonas.rules.test.mjs
cobrem o comportamento. AGENTS, README, arquitetura, testes, plano/execução e ADR
registram a decisão e os limites.

## Testes e validações reais

**197 testes Node distintos positivos**: lote dirigido de doze arquivos,
195/195 em 8.851,0775 ms, mais dois cenários novos de limpeza, 2/2 em 522,8148 ms.
São 22 cenários de personas; repetições não foram somadas como testes distintos.

```text
# Regressão dirigida
tests 195
pass 195
fail 0
skipped 0

# Limpeza parcial e definição recriada
tests 2
pass 2
fail 0
skipped 0
```

Arquivos: bookRestorePersonas, Counts, Resources, Lore, Structure, Remap,
ContentRead, Upload, Integrity, Validation, LegacyValidation e bookChapterText.
Cobre 53 perfis distintos, perfil compartilhado em três tipos de vínculo,
texto bruto/arquivo, JSON v1–v6, perfil legado ausente, biblioteca intacta,
manifesto/limites, origem divergente, rollback/retry, replay gêmeo, cancelamento
durante leitura, namespaces estrangeiros e proteção de nascimentos nativos.

**2 testes com SDKs reais positivos**, sem falhas/skips, Firestore 1.22.0
verificado e porta loopback dedicada:

1. Disputa CAS, deduplicação, perfis exatos, sigilo de dono/outro/anônimo,
   prova de nascimento/última alteração, cleanup v9 e replay: 77.487,7088 ms.
2. Definição recriada impede deduplicação/novo vínculo sem avançar o estado:
   61.505,4801 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 139860.0424
```

Native/journal/recibos permaneceram sincronizados, inclusive definições repetidas.
SDK direto foi negado e a biblioteca com ID coincidente conservou seu conteúdo.

Lint dirigido, check de Functions e arquitetura passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Sem código cliente modificado:
Vitest/typecheck/build não repetidos. npm run validate integral fica para o
fechamento do grande bloco P1. Sem nova Rule, dependência, API pública ou crédito.

## Limitações e próximos passos

Esta entrega guarda definições congeladas privadas, não cria perfis ativos na
biblioteca. Integração com biblioteca/IA/histórico/backup e disponibilidade
atômica continua obrigatória antes de ativar o livro; não basta o prefixo do ID.
Revisões/datas das futuras cópias globais terão seu próprio contrato.

Faltam universo autorizado, histórico/rascunho/capa, campos grandes e consumidores,
integração das personas, autorização final/ativação e host/UI/roundtrip/validate.
P1/F2-09 e o objetivo Writer V2 continuam abertos. Nenhuma jornada de restauração
final foi demonstrada no navegador.

Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
