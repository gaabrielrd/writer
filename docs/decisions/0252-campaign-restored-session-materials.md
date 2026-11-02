# ADR 0252 — Materiais restaurados nas sessões

- Data: 2026-10-29.
- Estado: aceita para leitores internos, sem produtor persistente.
- Relacionadas: [0249](0249-campaign-restored-source-readers.md),
  [0250](0250-campaign-restored-backup-readers.md) e
  [0251](0251-campaign-portable-base-references.md).

## Contexto

S2 já guarda somente declarações próprias target={kind,sourceKey}, resolvidas
pela base ativa/C2 atual. Não há fallback histórico de cenas. Restaurar exige
conferir também a prova de cada cena/bloco antes de expor material ou imagem.

## Decisão

Reusar baseItemAvailable em sceneRecord e readBlockMetadata. As janelas de
candidatos e blocos passam pelo mesmo gate usando a metadata já selecionada.
As máscaras incluem sourceEvidence para detectar misturas inconsistentes.
Vínculos estruturais, sessão/revisão e contexto continuam obrigatórios.

Leitura, nova vinculação, candidatos, plano da cena, blocos e imagens rejeitam
provas ausentes/malformadas ou de outra cadeia/base/chave. Não ler corpo ou
Storage antes desse gate. Imagens voltam a conferir os gates após I/O pelo
contrato existente, recusando resposta se a prova mudar durante o download.

Conservar o contrato aprovado de S2: alvo ausente permanece neutro, sem
reconstruir origem por hash, buscar nome ou consultar lore vivo. Lore usa C2
efetivo, com variante/legado autorizados. Adoção explícita troca a base ativa
e invalida o contexto antigo; não altera preparação própria/revisão S1.

Não introduzir marcador permanente de indisponibilidade em sessionReferences
nem alterar seu DTO de backup. A ausência no material congelado já é suficiente
para impedir resolução; declaração própria não concede acesso. Reexportação
mantém o vínculo, inclusive sem alvo, com os gates semânticos atuais.

## Consequências e limites

Sem mudança de formato/API, dependências, endpoint ou produtor persistente.
Capturas nativas conservam seu comportamento. Base restaurada ainda requer
provas de origem exatas de 219–220. Fixtures em memória não comprovam produção.

Relações externas portáteis de lore/variantes continuam necessárias. Depois:
inventário/cleanup C4 v1–v4 antes de jobs/prosa/pins/índices persistentes,
upload/retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
