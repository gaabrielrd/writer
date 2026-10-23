# P1 / M38b — Produção privada de lore grande

## Objetivo e requisitos

Materializar dados gerais e todas as relações de lore em unidades retomáveis,
sem reduzir valores nem acumular tudo num documento Firestore. Preservar o fluxo
inline, os recibos anteriores, raiz ausente e countReady false.

## Plano sequencial

1. Certificar namespace vazio e ampliar o inventário antes da primeira parte.
   payloadInventoryVersion 1 é uma capacidade independente do inventário de fases
   6–14, porque lore é preparado antes de histórico, capa e personas.
2. Usar coleções planas bookResourceBodies, bookResourceChunks e bookLoreSegments.
   Emendar ADR 0088 antes do primeiro produtor: assim consultas limitadas provam
   ausência também de partes sem cabeçalho, sem collectionGroup não limitado.
3. Selecionar representação por limite superior conservador dos bytes originais
   e expansão de IDs. A seleção não rejeita nem trunca o objeto.
4. Dados gerais em um payload, relações em páginas de 64 entradas remapeadas.
   Partes em unidades de até 16, cabeçalho imutável depois das partes, ponteiro
   com nascimento nativo após o cabeçalho. Sem teto de 128 partes após remapear.
5. Acrescentar lorePayload opcional fechado ao progresso. Fonte validada,
   CAS/journals/recibos em cada commit. Sem vetor crescente de ponteiros no job.
6. Criar o stub somente ao terminar todos os segmentos. Fixar geração, base,
   presença/quantidade/páginas de relações e sealBirth do último recibo.
   Só então incrementar loreCount. Não oferecer stub como objeto lógico completo.
7. Cancelar segmentos/partes/corpos por páginas com provas nativas e contagem de
   artefatos, inclusive partes sem cabeçalho. Recriados/alheios ficam preservados.
8. Conferir dados gerais e contagens lógicas na reconciliação. Certificação final
   ainda deve conferir todos os segmentos antes da ativação.
9. Node/SDK reais, documentação/ADR/evidência, revisão e commit local.

## Riscos, compatibilidade e continuação

Jobs anteriores permanecem legíveis/canceláveis. Implantar parsers e cleanup e
drenar handlers antigos antes de habilitar a capacidade. Nenhum deploy agora.

Prefixos de relações já iniciados no formato antigo exigem migração conservando
recibos e contadores antes de alegar compatibilidade integral; nunca reiniciar
contadores nem descartar o prefixo silenciosamente. Migração permanece requisito
de P1 se não for concluída junto desta etapa.

M38c cobre consumers/edição/exclusão de lore e exclusão do livro ativo. Demais
campos grandes, saída portátil ampliada, capa/biblioteca, ativação, limpeza
posterior e host/UI/roundtrip/validate continuam obrigatórios.
Testes dirigidos por ajuste, validate no fechamento de P1. CI ignorada;
somente commits locais, sem push/PR/deploy.

## Estado e evidência

Produção nova, capacidade/inventário, reconciliação e cancelamento implementados.
[Entrega M38b](../../../entregas/2026-10-23-writer-v2-producao-privada-de-lore-grande.md):
487 backend e quatro SDK distintos positivos. Raiz ausente/countReady false.
A compatibilidade dos prefixos antigos foi acrescentada e validada em M38b2,
conforme o [plano 79](79-migracao-dos-prefixos-de-lore.md). Prosseguir com M38c.
