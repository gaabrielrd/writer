# P3 — campos UTF-8 e versão de conteúdo do arquivo

- Data: 2026-10-29.
- Base: b4daa21; sequência de [216](216-semantica-dos-dados-proprios-da-campanha.md).
- Estado: correção interna implementada e checks dirigidos; P3/D abertos.

## Descoberta e prioridade

Ao inspecionar a semântica derivada, uma cena criada/alterada pelo escritor real
e capturada nativamente com 90.007 bytes (BOM, espaços, emojis, acentos e quebra
de linha) falhou ao exportar: campaign-backup-audit-changed. Os chunks nativos
respeitam fronteiras UTF-8 e podem ter 65.533–65.536 bytes antes do último.
Auditor/arquivo exigiam 65.536 exatos. Isso bloqueia a edição congelada válida
antes de qualquer restauração; corrigir antes de completar os joins derivados.

## Contrato e sequência

1. Novos arquivos/manifestos emitem contentVersion 2, domínio lógico
   writer-campaign-logical-units-v2. Manter framing 1 e provenanceVersion 2.
   Leitores/verificador aceitam contentVersion 1 e 2, sem reinterpretar v1.
2. Em v2, somente base:field e anchor:field usam chunks nativos UTF-8:
   número limitado pelo intervalo ceil(bytes/65536) a ceil(bytes/65533),
   partes não finais de 65.533–65.536 bytes e última de até 65.536.
   Zero bytes somente em campo vazio com uma parte. Cada parte é UTF-8 válida,
   SHA/tamanho/contagem são exatos. Não redividir nem concatenar texto inteiro.
3. Own JSON/metadados/imagens continuam com partes fixas. V1 conserva regras
   anteriores. Conferir mesma versão no header/manifesto e domínio correspondente;
   alteração de versão/cadeia não substitui assinatura.
4. Produtor valida o mesmo contrato ao publicar e captura a versão no resultado
   da auditoria. Assinar somente a versão efetivamente auditada. Reconferência
   nativa e geração de imagens continuam obrigatórias.
5. Testes de escritores reais com cena e lore longos, campos vazios, blocos
   principal/adicional, retenção legada, abort/falha, fronteiras/corpus UTF-8,
   v1 realmente assinado e versão adulterada. Ajustar helpers de reassinatura
   para usar o domínio da versão; testes dirigidos, revisão e commit local.

## Limites e continuação

Não muda os limites de texto, o conteúdo congelado, a autoria ou as regras de
acesso. Nenhum adaptador persistente, endpoint, UI ou grant novo. Esta correção
remove um bloqueio real do arquivo; não declara concluída a semântica de todos
os derivados, materialização/ativação ou restauração de campanhas.

Depois retomar joins base/item/parent/fields/corpos/links/lore/imagens/âncoras
com provas e consumidores ordinários. C4 v1–v4 é obrigatório antes de produtores
persistentes. P3/D/F2-09 e macro 8/35 permanecem abertos. Validate no fechamento
do bloco; sem CI, push, deploy ou subagentes.

## Evidência local

Passos 1–5 implementados internamente, com gramática máxima de fronteira UTF-8
compartilhada, inclusive na auditoria nativa sem callback de publicação.
19 novos e 231 regressões Node passaram. Conferir
[ADR 0247](../../../decisions/0247-campaign-backup-utf8-fields-v2.md) e
[evidência parcial](../../../entregas/2026-10-29-writer-v2-campos-utf8-no-backup-de-campanhas.md).
A inspeção derivada continua para os joins completos; não fechar P3/D.
