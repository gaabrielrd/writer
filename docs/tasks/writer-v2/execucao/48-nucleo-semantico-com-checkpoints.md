# F2-09 P1 M15 — Núcleo semântico com checkpoints

Contrato em 2026-10-22 sobre d9bde15. M14 foi progresso verificado: commit local,
SHA retomável, leitor com provas nativas e testes. Sem CI/push/subagentes.
P1/F2-09 e a V2 completa permanecem abertos.

## Objetivo e sequência obrigatória

Tornar a validação semântica existente continuável em etapas, mantendo um único
núcleo para arquivo novo e normalização legada. O servidor precisa desse controle
antes de persistir índices/checkpoints: hoje validateRecordContent encerra
todo o arquivo, referências e ranks dentro de uma coroutine em memória.

Este marco extrai a máquina pura e a usa nos validadores atuais. Não introduzir
uma segunda versão permissiva para o servidor ou declarar um endpoint de
restauração pronto. A sequência completa continua: integridade, parser e índice
privado servidor, validação semântica retomável, remapeamento/materialização/mídia,
revisão de origem e ativação atômica, host protegido/UI/roundtrip e cleanup.

## Descoberta

Grafo writer-v2 consultado primeiro para os validadores; sem resultados. Fontes
bookBackupContent, bookLegacyReview/Catalog/JSON, Package/Container e Schema
conferidas diretamente. M11/M12 já verificam todos os recursos/hashes/índices,
mas acumulam seu controle em closures e varrem todas as arestas/linhas ao final.

Arrays de relações de lore não têm corte artificial. Reservar trabalho de
fanout em metadados e processá-lo em lotes; não limitá-lo a 50 ou 500 relações
para caber numa transação. Checkpoint não pode conter prosa/nomes/perfil/capa
inteira; somente IDs, hashes, contadores, tags, descritores mínimos e cursores.

## Contrato do núcleo

createBookContentState(bookId,legacy) e createBookContentMachine(checkpoint,ports)
são internos de Functions/pure code, sem reexport pela feature pública ou RPC.
Checkpoint JSON fechado, schemaVersion 1, até 16 KiB, modos novo/legado fixados
pelo adaptador autorizado, fases records/edges/rows/done.

acceptJSON valida DTO/identidade e registra provas/referências. Prosa/perfil são
descartados do estado. Corpo histórico/draft/capa produz expectativa raw mínima;
o adaptador lê partes reais e calcula hash antes de acceptRawProof.
Nunca aceitar uma prova raw fornecida pelo cliente como autorização.

Relações numerosas deixam cursor e hash do item. advanceRelations recebe o mesmo
item verificado e processa até 64 relações por chamada, sem copiar descrição/
prosa ao checkpoint. O host futuro deve reler o item fixado e vincular cursor
à origem/geração do índice. Não adotar item diferente por mesmo ID.

beginFinish confere completude/livro/origem/capa. advanceFinish processa até
64 arestas/linhas por chamada, conservando warnings e detecção de duplicatas
de ranks. result somente em done, com resumo semantic-only. O adaptador compõe
content-only com o relatório de framing/procedência conferido. Novo formato mantém regras estritas; legado mantém apenas
as exceções já aprovadas de ausência de persona/override.

Instância clona o checkpoint, impede chamadas concorrentes e invalida após falha.
snapshot não é permitido durante operação pendente ou depois de falha.
Checkpoint é controle confiável do host, não prova de autorização/framing.
Índice e checkpoint devem ser confirmados juntos pelo futuro protocolo servidor;
o núcleo não faz I/O de Firestore nem rollback de um índice externo.

## Arquivos e execução

1. Novo bookContentMachine com estado fechado, operações e validação semântica
   extraída. Manter schema e regras observáveis atuais.
2. bookBackupContent vira adaptador de leitura/JSON/raw, usando a mesma máquina
   para novo e legado. Preservar APIs/tipos e relatório content-only.
3. Testes Node de regressão M11/M12; testes novos de checkpoints entre todas as
   etapas, fanout grande, ranks/referências, corrupção, falha, cancelamento e
   isolamento por cópia. Testar perda/duplicação das portas, sem alegar Firestore.
4. Checks dirigidos e interoperabilidade cliente; build/type/lint conforme impacto.
5. Revisão, ADR/docs/entrega/AGENTS e commit local.

Sem dependência, coleção, endpoint, Rule, crédito ou arquivo de produção novos.
Nativo/SDK do host final e validate completo permanecem no fechamento P1.
O próximo escritor de índice/checkpoint servidor deve ampliar cleanup antes de
criar qualquer filho. Parser retomável de contêiner/JSON legado e coordenação
de persistência serão ligados na próxima etapa, sem inventar selo legado.

## Aceites

- [x] Validadores atuais usam um único núcleo e preservam relatórios/falhas.
- [x] Pausar e recriar a máquina por JSON mantém resultado e regras.
- [x] Fanout/referências/ranks terminam por lotes sem truncamento.
- [x] Snapshot fechado/limitado não contém dados autorais descartados.
- [x] Falha/abort/concorrência não produzem relatório nem checkpoint parcial.
- [x] Regressão de pacote novo/legado e interoperabilidade cliente passam.
- [x] Evidências, revisão e commit local, com limites explicitados.

## Resultado local

Núcleo e adaptação implementados, sem reimplementar nem afrouxar as regras.
Treze casos novos e 22 regressões Node, 46 Vitest e 20 cenários nativos positivos
em dois probes. Checkpoints testados por JSON não constituem persistência remota.
[Evidência M15](../../../entregas/2026-10-22-writer-v2-nucleo-semantico-com-checkpoints.md).

O núcleo entrega somente semantic-only. O adaptador público compõe content-only
com seu framing/procedência. Antes de criar índice/checkpoint servidor, ampliar
inventário e confirmar efeitos/controle juntos; parser retomável e integração
com fonte M14 ainda são requisitos. P1/F2-09 continuam abertos.
