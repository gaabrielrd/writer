# P3 — autorização dos materiais restaurados nas sessões

- Data: 2026-10-29.
- Base: e6f2700; sequência de [221](221-referencias-portateis-da-base.md).
- Estado: leitores implementados e validação dirigida positiva; P3/D abertos.

## Objetivo e contrato existente

Preparar S2 para bases restauradas. Os contratos aprovados
[22](22-referencias-de-lore-da-sessao.md) e
[23](23-cenas-completas-na-preparacao-da-sessao.md) já resolvem vínculos pela base
ativa/C2 atual. Cena ausente fica indisponível, sem fallback histórico, busca
por nome ou lore vivo. Adoção explícita de base nova muda o contexto e invalida
páginas; preserva texto/revisão de preparação própria. Não criar um estado
permanente que conflite com esse comportamento ou se perca no formato portátil.

## Escopo, requisitos e aceite

Não alterar o DTO próprio target={kind,sourceKey} nem o formato do backup.
Referência é declaração própria, nunca grant. Alvo ausente continua neutro,
e seu conteúdo não é reconstruído pelo hash. Lore continua usando C2 e âncoras
autorizadas, inclusive legado. Conservar remoção/revinculação e preparação própria.

Cenas e blocos da base restaurada devem conferir a prova exata por item antes
de candidatos, listas de materiais, texto e imagem. Marcador ausente/malformado,
cadeia/base/chave divergente ou testemunha indisponível falha fechada; revogação
de fonte produz material indisponível conforme o gate de base. Capturas nativas
conservam o contrato anterior. Não ler prosa ou Storage antes da autorização.

## Sequência e arquivos

1. campaignSessionReferenceContracts.sceneRecord reutiliza baseItemAvailable;
   todos os candidatos de cenas usam esse gate em vez de somente sceneCandidate.
2. campaignSessionSceneContracts.readBlockMetadata aceita metadata de janela e
   reutiliza baseItemAvailable depois dos vínculos estruturais; listagem de
   blocos usa o gate para cada item. Reusar nos leitores de texto/imagem.
3. Testar cópia real/captura/testemunhas, sessão e vínculos pelos serviços:
   texto e blocos completos, imagem com pin, lore/variante, alvos ausentes,
   provas inválidas, revogação/recriação, mudança explícita de base e S1 íntegro.
   Reexportação/revisão completa conserva declarações de vínculos próprios.
4. Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

## Limites e continuação

Sem produtor persistente, novo marcador de sessão, mudança de API/formato ou
dependência. Fixtures de restauração somente no banco de teste. Relações
portáteis externas de lore/variantes permanecem para o próximo incremento;
depois inventário/cleanup C4 v1–v4 antes de jobs/prosa/pins/índices. Upload/
retomada, materialização/ativação, Estúdio e ciclos ainda são necessários.
P3/D/F2-09 e macro 8/35 abertos. Testes dirigidos neste incremento; suite integral
no grande bloco, sem agentes/CI/push/PR/merge/deploy. Preservar servidor manual.

## Resultado dirigido

43/43 positivos (16 novos e 27 regressões), incluindo imagem/UTF-8 completo,
reexportação/revisão de vínculo ausente e adoção nativa com S1 preservado.
Confira a [evidência parcial](../../../entregas/2026-10-29-writer-v2-materiais-restaurados-nas-sessoes.md).
Próximo: relações externas portáteis de lore/variantes, depois C4 e restauração
persistente; este incremento não habilita o materializador.
