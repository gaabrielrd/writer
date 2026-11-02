# Writer V2 — Materialização privada da capa (P1 M35b)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 71](../tasks/writer-v2/execucao/71-materializacao-privada-da-capa.md)
- Decisão: [ADR 0082](../decisions/0082-restored-cover-private-storage.md)

## Objetivo e funcionalidades

Gravar a capa íntegra do backup em Storage privado, preservando bytes e metadados,
com retomada e cancelamento que impeçam upload atrasado de recriar seu conteúdo.
A capa ainda não fica disponível na biblioteca e o livro continua sem ativação.

## Critérios atendidos

- [x] Intenção/journal/progresso v10 e inventário v13 antes do I/O; migração
      certifica namespace vazio. Descriptor/item M21 reconferidos.
- [x] Frames autenticados, SHA/tamanho integral, PNG decodificada sem recomprimir
      e sem novo limite de resolução no contrato portátil.
- [x] Caminho derivado, criação condicionada, accepted false/private/no-store,
      sem token/URL; ausência e legado não geram objeto.
- [x] Retomada sem regravar, resposta perdida, CAS/replay e provas reconferidas
      antes de confirmar intenção/journal/progresso/recibo.
- [x] Cancelamento revoga autorização antes de I/O. Limpeza começa pela mídia,
      instala marcador vazio permanente e só então remove recursos nativos.
- [x] Versão antiga excluída por geração exata após conferência; marcador atual,
      objeto estrangeiro e gerações/metadados alterados são preservados.
- [x] Fase personas-integrate, raiz ausente/countReady false, sem biblioteca/uso.
- [x] Compatibilidade dos inventários/recibos anteriores e testes de limpeza real.
      Helper de testes deixa de cancelar novamente jobs já em limpeza.
- [x] Runner de mídia aceita arquivo local e filtro de palavra simples, sem
      interpolação de comandos arbitrários.

## Arquivos

BookRestoreCoverMaterialization/Storage/StorageContracts, integração em
Upload/Contracts/Artifacts/Integrity/ValidationCleanup/index e Functions check.
Fixtures/testes Node, SDK HTTP e Firestore/Storage, runner/guards, AGENTS, README,
arquitetura/testes, plano/execução e ADR completam o incremento.

## Testes e validações reais

**301 testes backend distintos positivos**. Regressão da família de restauração
e BookChapterText: 298/298, 14.879,4881 ms, sem falha/skip. Após fortalecer o
adaptador, foram repetidos somente os 24 cenários afetados, incluindo três novos
casos ausentes do lote anterior: 24/24, 4.562,4914 ms. Não somar repetições.

```text
# Regressão de restauração
tests 298
pass 298
fail 0
skipped 0
duration_ms 14879.4881

# Materialização/Storage/SDK HTTP/PNG de 16 MiB após revisão
tests 24
pass 24
fail 0
skipped 0
duration_ms 4562.4914
```

A PNG válida de exatamente 16.777.216 bytes/256 partes foi decodificada e
materializada sem alterar o hash, em 4.304,7651 ms. O SDK real contra servidor
HTTP local confirmou strings de geração acima de Number.MAX_SAFE_INTEGER,
ifGenerationMatch 0, condição de metageração, leitura/exclusão por geração
exata e HTTP 412 no upload atrasado. Esse servidor modela o contrato GCS; não
é execução contra Google Cloud.

**Dois testes de guards do runner passaram**, 58,6227 ms. Rejeitam caminhos
externos/ausentes, seleções em forma de comando e filtro com interpolação.

**Dois cenários distintos com SDK Firestore/Storage positivos**, em execuções
dirigidas separadas:

1. PNG real 1200×1800, intenção/journal/recibo nativos, metadata exata,
   ausência de raiz/biblioteca, privacidade nas Rules e geração recriada
   protegida: teste 75.857,3291 ms; processo filtrado 1/1, 76.772,1503 ms,
   saída 0.
2. Materialização iniciada antes do cancelamento, mas etapa Storage retomada
   depois do fence: sem envio de PNG, marcador vazio preservado, cleanup
   nativo completo e sem recibo de materialização: 77.023,7612 ms.
   Esse caso já havia passado na execução anterior e não foi repetido
   após corrigir somente a fixture do primeiro cenário.

**Um cenário SDK Firestore adicional passou**: parte nativa recriada permanece
protegida depois da correção do helper; 1/1, 71.415,8964 ms (teste 70.578,2743 ms).
Isso confirma limpeza efetiva, sem falso positivo por segunda tentativa de cancelamento.

## Falhas investigadas e alcance da evidência

A primeira execução conjunta falhou nos dois cenários: Firebase CLI 15.24.0
ignora precondições de upload e geração no DELETE, não modelando o contrato GCS.
Código instalado e documentação oficial foram conferidos. Os testes foram
separados por capacidade: emulador para bytes/Rules; contrato HTTP com SDK real
para precondições/corridas/exclusão versionada. Não houve execução em produção,
skip de cenário obrigatório ou redução do contrato funcional.

A execução seguinte passou no caso de fence e falhou no texto esperado de uma
fixture, convertido sem UTF-8. O conteúdo real estava correto; expectativa
corrigida para code point explícito e somente esse teste foi repetido, positivo.

Permanecem avisos MaxListenersExceeded do SDK, de Unsafe do runtime Java e de
NullPointerException no EOF ao desligar o runtime Storage. A execução final
filtrada terminou com saída 0; avisos não foram suprimidos.

Sintaxe de Functions, arquitetura, lint dirigido, formatação/docs/diff e
revisão final conferidos antes do commit. Sem TypeScript/UI alterados: build,
jornadas visuais e suíte cliente não foram repetidos. Validate integral
reservado ao fechamento do bloco P1.

## Limitações e continuação

Preparação/materialização privada não tornam a capa ativa. A ativação deverá
reconferir Storage e compor biblioteca/uso autorizados; validar bucket real e
preservação dos marcadores no rollout. Cada cancelamento com capa reserva um
objeto vazio permanente; manutenção/lifecycle não podem removê-lo.

Personas globais, campos grandes/consumidores, certificação/ativação e
host/UI/roundtrip/validate permanecem. P1/F2-09 e Writer V2 continuam abertos.
Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
