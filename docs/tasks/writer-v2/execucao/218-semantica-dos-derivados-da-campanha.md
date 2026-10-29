# P3 — semântica dos derivados do arquivo de campanha

- Data: 2026-10-29.
- Base: e070070; sequência de [217](217-campos-utf8-no-arquivo-de-campanha.md).
- Estado: implementação interna, testes dirigidos e validate integral local positivos; P3/D abertos.

## Objetivo e aceite

Conferir a estrutura derivada completa do arquivo antes da futura materialização:
snapshot/base assinada, itens/origens/pais, manifestos/campos/corpos, vínculos/
ledger de lore, imagens e variantes/âncoras, inclusive legadas e indisponíveis.
Reutilizar validadores do domínio, sem substituir o texto congelado por origem viva.

## Implementação sequencial

1. Parser fechado por DTO derivado, UTF-8/canonical JSON limitado por unidade.
   Campos/imagens são processados por fluxo, sem acumular texto ou binário.
   Novo callback provisório onDerivedUnit conserva onOwnUnit e versões v1/v2.
2. Índice temporário injetado write/seal/read/lookup/reverse/dispose, só metadata,
   com MAC por conta/ordinal/namespace/chave/posição e páginas de 25. Chave em
   RAM, zerada/dispose sempre. Sem adaptador persistente.
3. Ordem/cobertura de campos e grupos segue o produtor; IDs de itens/recursos/
   variantes são estritos por família. Lookups opcionais incluem vizinhos MAC
   consecutivos para provar ausência nos namespaces ordenados, evitando fallback
   baseado em omissão não autenticada do índice. Reverse exige testemunha positiva.
4. Depois do arquivo autenticado, conferir todos os joins nos dois sentidos:
   unidades/evidências, campos/manifestos, corpos físicos, pai/tipo/origem,
   principal compartilhado, imagem/bloco, referência/alvo e ledger/vínculo,
   variantes/âncoras/relações. Ausências legítimas ficam explícitas.
5. Digest estável e prova efêmera campaign-derived-semantics-only, vinculada ao
   arquivo. Revalidar chave pública no fim. Não é autorização atual/grant.
6. Testar arquivo real rico/vazio, UTF-8 longo, legadas/revogações, violações
   reassinadas, omissões/duplicatas/orfandade, índice/MAC/ausência, abort/falhas.
   Checks dirigidos, documentação/ADR/evidência e commit local.

## Limites e continuação

Unidade JSON limitada a 4 MiB; metadata por registro até 64 KiB, páginas de 25;
não montar array/mapa do projeto em RAM. Índice de testes só em RAM. Provas
própria/derivada/origem só podem ser compostas para a mesma cadeia de arquivo.
Antes de persistir recursos, fechar consumidores de procedência e inventário/
cleanup C4 v1–v4; depois upload/retomada, nova cópia/remapeamento, materialização/
ativação e Estúdio/ciclos. Não habilitar endpoint nem UI prematuramente.
P3/D/F2-09 e macro 8/35 abertos. Validate no grande bloco; sem CI/push/deploy/agentes.

## Revisão composta

Compor próprios/derivados/origens em revisão interna única, com fábrica de
índices temporários por etapa, mesma cadeia/tamanho/manifesto e limpeza.
Capturar o leitor antes de I/O; não aceitar mistura de arquivos válidos.

## Evidência parcial

Conferência derivada e revisão composta implementadas; 62 novos e 151 regressões
dirigidas passaram. Conferir [ADR 0248](../../../decisions/0248-campaign-derived-semantics-and-review.md)
e [evidência](../../../entregas/2026-10-29-writer-v2-revisao-completa-do-arquivo-de-campanha.md).
npm run validate passou integralmente neste fechamento do bloco de conferência
(código 0): 4.978 frontend, 94 scripts e 4.456 Functions, sintaxe/typecheck/build/smoke.
Referências externas de âncora são preservadas como não resolvidas, sem grant.
