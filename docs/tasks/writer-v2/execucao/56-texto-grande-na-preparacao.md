# P1 / M23 — Texto grande de capítulo na preparação

## Objetivo

Superar a rejeição nativa de content demonstrada em M22, preservando texto grande
sob raiz ausente. Não reduzir o formato de 8 MiB nem expor capítulo cujo leitor
ainda não compreende o corpo externo. A ativação continua bloqueada em P1.

## Solução e requisitos

- Texto de capítulo acima de 512 KiB UTF-8 usa corpo imutável versionado, com
  manifesto de tamanho/hash/partes; abaixo disso conserva representação inline.
  Este limiar físico não limita o texto lógico.
- Novo bookTextBodies/bodyId com chunks de até 64 KiB binários, identificados por
  índice. Identidade inclui livro, recurso, operação e hash, sem caminho do arquivo.
- Capítulo tem content null e contentStorage explícito; nunca usar string vazia
  como substituto de corpo indisponível. Ledger recebe texto original completo.
- Corpo nasce com um pin do capítulo; futuras versões/histórico precisam poder
  referenciá-lo sem copiar dois corpos grandes na transação. Referências, coleta
  e edição após ativação ainda exigem integração antes de habilitar a cópia.
- Gravar partes/corpo/capítulo/ledger/journal/cursor/recibo na mesma transação,
  em até 136 documentos nativos e seus journals. Mesmo conteúdo/checkpoint após
  retry, sem gravação parcial.
- Cleanup v5 amplia v4 com corpo e partes, removendo filhos por páginas antes do
  pai. Parte sem journal, alteração/ABA/contexto estrangeiro bloqueia remoção.
  Body journals restantes bloqueiam a transição; nenhum delete recursivo.
- V4 existente continua descartável; próxima unidade de estrutura pode atualizar
  para v5. Snapshot de validação continua fixado em validationCheckpoint.
- Acrescentar leitor interno que valide manifesto, contexto, tamanho de cada
  parte/hash, total e UTF-8/BOM, sem considerar isso autorização de usuário.

## Sequência e aceites

1. [x] Codec/projeção de corpo grande e leitor interno com contrato fechado.
2. [x] Inventário v5, limpeza de filhos/pares e compatibilidade v1–v4.
3. [x] Escritor de estrutura/ledger com corpo externo, sem raiz visível.
4. [x] Testes dirigidos e SDK reais (1,1 MiB e limite lógico), revisão,
       documentação e commit local.

## Limites e próximas entregas obrigatórias

Este incremento resolve armazenamento do content na preparação, não campos
grandes arbitrários (títulos, lore, fontes, etc.). Não omitir essa diferença.
Leitores/escritores de editor, histórico, chat, conversão, backup e exclusão precisam
ser adaptados antes da ativação. Não apresentar content null como manuscrito vazio.

Faltam demais recursos de P1, integração completa dos corpos, campos grandes
restantes, pins/coleta/edição, perfis/mídia, autorização/ativação, host/UI/roundtrip
e validate integral. Rascunho diferente continua destinado a versão separada.
Somente commits locais; CI ignorada.
