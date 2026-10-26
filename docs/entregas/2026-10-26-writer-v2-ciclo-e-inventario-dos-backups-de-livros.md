# Writer V2 — ciclo e inventário dos backups de livros

- **Data**: 2026-10-26.
- **Branch**: codex/writer-v2, desenvolvimento local.
- **Plano de origem**: [146](../tasks/writer-v2/execucao/146-inventario-e-consumidores-dos-livros-restaurados.md).
- **Decisão**: [ADR 0169](../decisions/0169-indexed-book-restore-runtime.md).

## Objetivo

Fechar P1 técnico local: o livro restaurado continua utilizável depois de limpar
a preparação, e novas restaurações usam lore indexado sem mudar pedidos antigos.
Consolidar o inventário e validar o bloco inteiro antes de P2.

## Funcionalidades entregues

- Livro restaurado inline/v1/v2 segue leitura, edição, criação e retirada de
  lore, backup e exclusão normais após ativação, mídia e arquivo da preparação.
  Conteúdo/controles de outro livro permanecem intactos; histórico de restauração
  não recria a cópia excluída nem concede acesso.
- Fonte acima de 8 MiB restaurada com a configuração efetivamente selecionada
  preserva SHA do texto, datas e aliases após arquivo. Runtime Functions usa a
  mesma constante nos callables e na recuperação HTTP; factory conserva false,
  e política de cada job/reserva permanece original.
- [Inventário consolidado](../tasks/writer-v2/inventario-portabilidade-livros.md)
  mapeia conteúdo, writers, leitores/captura, exclusão e controles retidos.
  Atualiza os snapshots técnicos anteriores sem declarar auditoria de produção.
- Runner mantém todos os casos de Functions com dois arquivos simultâneos.
  Storage usa seu runner Node/SDK com emuladores. Casos de teste alinhados ao
  contrato atual, preservando volume, validação e limites de cobertura.

## Critérios de aceite

- [x] Ciclo ativo e exclusão nos três formatos, depois de arquivo, sem tocar outro projeto.
- [x] Fonte grande usando configuração runtime real, sem truncagem.
- [x] Mapa por famílias e limites/gates explícitos.
- [x] Validação completa verde, revisão e documentação realinhadas.
- [x] Escopo registrado em commit local, sem operações remotas.

O fechamento é técnico local de P1. F2-09 inteira, P2/P3/D, fases 3–5 e gates
humanos/comerciais/operacionais permanecem abertos.

## Arquivos alterados

| Grupo                                              | Mudança                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| functions/src/bookRestoreRuntime.mjs e index.mjs   | Seleção comum para novos jobs nos dois pontos de composição                                                       |
| functions/test/bookRestoreActiveLifecycle.test.mjs | Integração real de ativação/arquivo e consumidores, com banco em memória                                          |
| functions/package.json e fixtures/tests de lore    | Concorrência limitada; modo original configurado no nascimento da fixture                                         |
| Testes de editor/lore e vitest.config.ts           | JSON v1–v6 em Node/Blob nativo, host atual, revogação do índice exato, timeouts por caso e runner Storage próprio |
| README, AGENTS e docs                              | Contrato vigente, inventário/ADR, prova da entrega e estado técnico de P1                                         |

## Testes

| Seleção                                | Resultado real                              | O que cobre                                                                                           |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Novo bookRestoreActiveLifecycle        | 4/4 Node; 12.322,7929 ms                    | Inline/v1/v2, mídia/arquivo, edição/criação/retirada/exclusão e fonte >8 MiB                          |
| Sete arquivos frontend afetados        | 111/111; 60,94 s                            | Interoperabilidade, host/coleção nativa, descarte, transporte de texto grande e seleção de 53 origens |
| Caso de recarga entre unidades         | 1 positivo, 42 não selecionados; 3,48 s     | Preserva ciclos de recarga/controles/aplicação com timeout específico                                 |
| Oito arquivos Functions antes afetados | 123/123, sem skip; 50.135,7654 ms           | Páginas, payload, prefixo, projeção, leitura, reconciliação, stream e port preparado                  |
| Storage pelo runner correto            | 7/7, sem skip; 173.654,5864 ms, código zero | Captura/materialização de PNG, Auth/Rules, geração recriada e cancelamento antes do envio             |

Os testes dirigidos se sobrepõem à execução completa; não somar seus totais.
Provas SDK/Chromium anteriores, incluindo roundtrip de arquivo produzido pelo
editor, permanecem atribuídas aos planos 140–145 na matriz, sem reexecução fictícia.

## Validações executadas

npm run validate, sexta execução, terminou **código zero**. Saída real resumida:

```text
Test Files  312 passed (312)
     Tests  4096 passed (4096)
  Duration  388.80s
All files          |   89.89 |    85.63 |   90.99 |   93.16 |

ℹ tests 87
ℹ pass 87
ℹ fail 0
ℹ duration_ms 16981.3364

ℹ tests 3007
ℹ pass 3007
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 310781.9092

Functions syntax checked: 298 modules
✓ built in 2.31s
Smoke test do bundle OK.
```

Cobertura: statements 89,89%, branches 85,63%, functions 90,99%, lines 93,16%.
Skills/arquitetura/docs/styleguide, formatação, lint e typecheck passaram no mesmo
comando. Build transformou 3.021 módulos. Emitiu avisos de chunks >500 kB e imports
dinâmicos sem efeito; não foram ocultados nem alterados os limites para suprimi-los.

Depois do validate, somente documentação foi realinhada; check:docs,
check:architecture, check:styleguide, formatação dirigida e diff são conferidos
antes do commit. Nenhum teste de comportamento é refeito só por esse texto.

### Falhas encontradas e correções

Duas tentativas pararam em formatação; o teste novo precisou de segunda passagem
do Prettier, seguida de check positivo. A terceira chegou à cobertura: 4.078
positivos/18 falhos e quatro exceções de Auth. Corrigidos runner indevido de
Storage, realms de Uint8Array no teste de JSON, expectativas de APIs antigas do
host e índice de chave que deve ser revogado. Os seis casos >8 MiB e o lote de
53 operações ganharam timeout específico, mantendo volume/asserts.

A quarta teve 4.095 positivos e um timeout de 5 s no ciclo de recarga entre cada
unidade. Timeout desse caso passou a 30 s, sem alterar o global. A quinta passou
frontend/cobertura e 87 scripts, mas Functions teve 2.944 positivos e oito falhas:
cinco processos V8 abortados por memória, dois DataCloneError por memória e uma
fixture que iniciava indexada antes de tentar simular prefixo monolítico.
A concorrência padrão da máquina com 16 CPUs foi limitada a dois arquivos;
não se mataram processos do operador nem se aumentou heap/reduziu corpus.
A fixture agora fixa false no início desse caso e continua comprovando que
trocar a configuração para true não migra o prefixo. Os 123 casos dirigidos e
os 3.007 da sexta execução passaram. reportOnFailure gera cobertura também
quando há falha, sem mudar os limiares.

Storage registrou avisos PassThrough do SDK e recusas esperadas. No desligamento
do emulador, houve NullPointerException Java após sete passes e código zero.
Não apresentar esse ensaio como execução sem avisos.

## Fora do escopo

P2/P3/D, compartilhamento, comércio, CI, push, atualização de PR, merge, deploy
e lançamento. Sem dependência nova ou subagente.

## Limitações e pendências conhecidas

Banco dos novos testes de ciclo é em memória; SDK Storage é prova separada.
Não houve nova execução visual completa nem auditoria de conta de produção.
Seleção física do arquivo no sistema, revisão de estados internos antigos sem
personaAvailability, auditoria operacional de chaves históricas e coordenação
de clientes/Rules/Admin continuam no gate de rollout. JSON v1–v6 novo é
compatível; replay interno v1 preserva hashes e não recebe reparo por inferência.

Dev server respondeu HTTP 200 em 127.0.0.1:5173; isso comprova o servidor da
interface, não disponibilização em produção dos novos callables. O checkout
master separado permaneceu limpo no hash 522ccaa7bcc92fe5eb4ae4ff54446afee98a52bf.

## Como verificar manualmente

1. Com backend compatível configurado, exportar no editor por Backup privado com
   histórico (.writer); confirmar destino e aguardar conclusão.
2. No Estúdio, restaurar o arquivo, revisar ausências/origem e confirmar Criar
   cópia privada explicitamente. Retomar pedidos após recarga sem trocar arquivo.
3. Depois da finalização, editar lore da cópia, criar/retirar ficha e excluir o
   projeto. Outro livro deve continuar intacto.
4. Antes de operação real, executar os gates operacionais/humanos descritos na
   matriz; esta entrega não os declara concluídos.
