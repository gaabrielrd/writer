# P1 / M37b — Backup indexado do texto das fontes

## Objetivo e problema

Eliminar a recomposição integral de original.content a cada página do backup
das fontes externas. M37a mediu 361 leituras de partes para 19 páginas. Manter
bytes/ordem JSON, hashes, contrato cliente e autorização nativa por página.

## Proposta, arquivos e sequência

1. [x] Núcleo puro de bookSceneSourceEncoding: prefixo/sufixo JSON da projeção fechada,
       hash integral e índices dos segmentos escapados, com até 129 offsets e
       carries UTF-8 de 0–3 bytes. Sem persistir texto duplicado.
2. [x] Gravar sceneSourceEncoding no manifesto bookTextBodies já criado com a
       fonte/journals/recibo. Sem novo namespace ou inventário: v5/v7 continuam.
3. [x] Leitura de intervalo JSON pelo BookBackupResourceRead: conferir formato
       fechado/limites/hash dos metadados e ler somente segmentos sobrepostos,
       com memoização apenas dentro da transação. Até três segmentos/quatro
       partes nativas por página; preservar 64 KiB por resposta.
4. [x] Vincular itemToken da fonte externa também ao nascimento e à última alteração nativos do corpo,
       inclusive na varredura final. Cabeçalhos/listas usam máscaras sem prosa.
       Fonte/corpo recriados não herdam o token anterior.
5. [x] Node, SDK real e regressão cliente/tipos/checks necessários; limite de
       8 MiB, Unicode/BOM/escapes, índices inválidos, compatibilidade sem índice,
       corrupção e contagem de leituras. Revisão, ADR/evidência e commit local.

Arquivos: novo módulo de codificação/testes, bookSceneSourceText,
bookBackupResourceRead, Functions check, fixture/testes SDK/Node existentes e
documentação. Nenhuma API, componente, dependência ou subagente novo.

## Requisitos e aceites

- Índice gerado na mesma transação da fonte/corpo, a partir das partes exatas.
  Hash dos bytes originais igual à fonte/manifesto. Não reunir o projeto em RAM.
- Prefixo/sufixo são a serialização portátil existente com original.content vazio.
  A projeção fechada tem uma única propriedade content; não procurar em prosa.
  Divisão deve conservar aspas, escapes, Unicode, BOM e presença dos demais campos.
- Offsets/carry fechados, inteiros seguros e monotônicos; prefixo/sufixo e
  tamanho final conferidos contra o índice. Indexação não reduz o limite de
  entrada do restaurador nem permite exportar item maior que o formato atual.
- Cada segmento reconstruído tem tamanho escapado esperado. Partes conservam
  SHA/nascimento/imutabilidade e escopo pelo leitor de capítulo existente.
  Cliente continua conferindo hash integral e revalidando os tokens antes do selo.
- Fonte legada sem índice mantém leitura correta anterior. Índice presente mas
  inválido falha fechado; não mascarar corrupção como fallback ou texto vazio.
- Fonte nova de 19 partes usa quantidade linear de leituras no teste, sem mudar
  os bytes da saída. Registrar contagem real e contexto, sem alegar benchmark GCS.
- SDK confirma gravação nativa com índice, resultado literal e proteção de token.
  Recriação integral do corpo/partes deve invalidar a fonte/prova anterior.
- Nenhuma alteração do protocolo público/API cliente, crédito, Rule ou ativação.

## Riscos, limites e continuação

Corpos M37a sem índice são compatíveis mas continuam custosos; migração/certificação
desses jobs permanece obrigatória antes de habilitar P1 integralmente.
Não criar cache entre requisições, ignorar autorização ou normalizar texto.

Metadados gigantes e crescimento do JSON após remapeamento ainda exigem contrato
de representação/limite antes da ativação; este índice não autoriza truncamento
nem transforma restauração parcial em roundtrip integral. Outros campos grandes
de lore/cenas/narrativa/livro/histórico continuam em M37 e seguintes.

Capa/biblioteca, certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/
validate integral continuam obrigatórios. P1/F2-09 e Writer V2 abertos.
Testes dirigidos durante ajustes, validate ao fechar P1. CI ignorada; somente
commits locais, sem push/PR/deploy.

## Evidência

[Entrega M37b](../../../entregas/2026-10-23-writer-v2-backup-indexado-das-fontes.md)
e [ADR 0086](../../../decisions/0086-indexed-scene-source-backup.md): 104 backend
distintos, 22 Vitest e três SDK positivos. O SDK confirmou 19 páginas/37 get de
partes e 128 páginas/255 get no caso próximo de 8 MiB. Não houve alteração do
contrato cliente ou ativação. Jobs sem índice, demais campos e P1 seguem abertos.
