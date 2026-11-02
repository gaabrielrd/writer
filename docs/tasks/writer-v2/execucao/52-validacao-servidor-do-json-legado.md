# F2-09 P1 M19 — Validação servidor de JSON v1–v6

Contrato em 2026-10-22 sobre a88b93c. M17/M18 implementaram scanner, catálogo,
normalização e readback compartilhados. Ligar agora esses passos ao job M16.

## Objetivo e requisitos

advanceBookRestoreValidation mantém pedido fechado (IDs/checkpoint), sem receber
cursor/DTO/relatório. A fonte M14 já validada alimenta scanner JSON, catálogo e
normalizador M18 e núcleo M15. Versão declarada deve coincidir com bytes reais.
Retomar em novos serviços, com índice/itens/estado/recibo atômicos e todas as
observações nativas reconferidas antes dos writes.

Unidades: janela lexical de até 64 KiB/64 spans, finalização do catálogo, um passo
de normalização, até 64 relações/referências ou rechecagem de 16 provas.
Scanner em EOF + fingerprint M14 formam procedência, sem fabricar selo.
Não guardar texto/DTO no índice ou em pointers; item guarda cursor anterior e
record/hash para releitura privada. Campos globais ignorados continuam sem cópia.

validationVersion 2 é exclusiva de writer-book-backup. Snapshot privado guarda
estado como JSON canônico em campo string de até 640 KiB, além do envelope fixo,
para comportar cursor lexical de até 512 KiB e demais estados sem arrays/mapas
de entrada profundamente indexados. Snapshot v1/archive continua com 64 KiB.
Conferir tamanho real do payload, schema, contexto, hash, checkpoint e nascimento
pelo recibo. Não devolver stateJSON em metadados/recibos/listas.

Progresso acrescenta fases do legado e resumo metadata-only com procedência/
ausências e avisos legados. content-verified continua sem raiz, grant ou ativação.
Só erro determinístico de formato rejeita; I/O/identidade/CAS não avançam.

## Inventário e compatibilidade

Nenhuma coleção nova: chunks, validationIndex/Items/State, integrityProofs/State
e chave já pertencem ao cleanup v3. Novo snapshot mantém envelope de contexto
schemaVersion 1; versão interna 2 e stateJSON. Cleanup por máscaras remove estado
mesmo corrompido, sem carregar payload e sem apagar dados de outro contexto.
Manter recibos/jobs v1/v2 e validação archive v1; testar replay e limpeza.

## Arquivos e sequência

1. Adaptador legacy de validação, codec de snapshot v2 e dispatch do coordenador.
2. Guardas de job/progresso/recibo e resumo versionados; script check.
3. Recusa determinística de dados não codificáveis no ponto de encoding M18.
4. Node: seis formatos/paridade, fontes reais via upload/hash, retomada/replay/CAS,
   fanout e leitura por pointer, conteúdo inválido/version mismatch, origem
   alterada/ABA, checkpoint grande, corrupção/cleanup e pedido fechado.
5. SDK Firestore real: estado grande opaco, Rules deny, nascimento/ABA, commit
   conjunto, retomada/finalização/replay e cleanup preservando outros livros.
   Regressão archive v1. Sem UI nova ou necessidade de repetir seu navegador.
6. Revisão/ADR/docs/AGENTS/entrega e commit local; CI/push/deploy ignorados.

## Riscos, suposições e continuidade

Estado privado é controle confiável do host, não autorização dada pelo arquivo.
Prosa de strings não entra no checkpoint, mas chaves JSON parciais são privadas.
Snapshots grandes precisam caber no documento nativo: testar no SDK, não inferir
pela fixture. Payload é até 640 KiB reais, abaixo do teto do documento com margem
para o envelope; evitar limite sobre JSON duplamente escapado.

P1 permanece para materialização/remapeamento/mídia, reautorização de universo,
ativação atômica e host protegido/UI/roundtrip/validate integral.
Decisão pendente de draft não bloqueia validação intrínseca.

## Aceites

- [x] Seis versões chegam a content-verified com paridade completa e procedência.
- [x] Unidades/checkpoint/índice/recibo são retomáveis e atômicos.
- [x] Snapshot v2 grande e privado, sem reduzir limites M17.
- [x] Recusas determinísticas separadas de I/O/CAS/identidade.
- [x] Cleanup v3 e compatibilidade archive provados em Node/SDK reais.
- [x] Documentação/evidência/revisão/commit local.

Resultado local: 85 Node, oito cliente e seis SDK reais positivos.
[Evidência M19](../../../entregas/2026-10-22-writer-v2-validacao-servidor-do-legado.md)
separa limites/estados/provas e checks executados. P1/F2-09 seguem abertos.
