# P3 — Índice derivado persistente e prova de ausência

- Data: 2026-10-29.
- Base: 8c235dc; revisão própria persistente do plano 229 validada.
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK, pré-ativação.

## Objetivo e sequência da revisão derivada

Persistir o staging real de bases, campos, corpos, links, ledger, imagens,
variantes/âncoras e testemunhas. Reutilizar regras de ordem/pareamento do
revisor existente e provar lookup, ausência e referência inversa sem índices
em memória do tamanho do arquivo. A etapa seguinte terá verificação semântica
retomável inclusive dentro de um item: seu número de dependências pode ser
grande. Não chamar indexação concluída de semântica ou grant.

## Requisitos e proposta

Famílias separadas derivedRows e derivedPositions, schema 1, sob o job. Não
reinterpretar reviewRows kind own. Main possui ordinal, seção/posição, hashes
de lookup/reverso, cifra de metadata e prova no recibo/testemunha. Posição
aponta para ordinal com mesma criação nativa e hash autenticado. Chave lógica,
valor e descriptors ficam cifrados. Lookup exato por hash usa igualdade
limitada; ausência em base:item/variant usa busca binária por posições
autenticadas, com vizinhos adjacentes e cardinalidade selada. Reverse é prova
de existência, sem presumir unicidade de vínculos legítimos.

Preparar cancelamento/coleta antes do produtor. Cada passo coleta até 25 pares
por ordinal, conferindo birth/recibo e ambos os hashes; depois verifica ausência
de posições órfãs antes de índice own/chunks. Não tocar estranhos nem completar
com ponteiros restantes. Terminal preserva somente contadores/recibos mínimos.

Produtor exige integridade e semântica própria, lê até 25 frames e persiste
cursor/staging cifrado. JSON de um DTO continua até 4 MiB; reler somente um
registro concluído, sem corpo no checkpoint. Campos e imagens não são reunidos;
validar UTF-8 incremental com cauda limitada serializável, incluindo legado v1.
Fim exige selo idêntico e envelope/pareamentos fechados. Índice retorna certificado
campaign-derived-index-only, nunca campaign-derived-semantics-only.
Portas internas revalidam job/chave/índice e invalidam após cancelar; sem callable.

## Arquivos e execução

1. Extrair staging comum da revisão derivada; manter revisão atual e seus testes.
2. Contratos, índice/posições e coleta antes de qualquer produtor.
3. Produtor limitado e portas read/lookup/reverse autenticadas.
4. Testes reais de emissão, índice equivalente ao staging completo, campos longos,
   UTF-8 legado, ausência/duplicata/transplante/recriação, paginação/coleta,
   CAS/retry/rollback/cancelamento e SDK Firestore.
5. Checks dirigidos, revisão, ADR/AGENTS/inventário/evidência e commit local.

## Aceite, riscos e gates

Provar que o índice é idêntico ao do revisor completo para o mesmo arquivo
assinado; provar ausência por posições adjacentes, sem confiar em consulta vazia.
Coleta só depois de conferir par/autoria; operação falha sem avanço. Campos,
relações opacas v3 e limites atuais não podem ser reduzidos para caber no estado.
Nenhum índice composto novo: posições permitem busca binária por doc ID e
consultas de igualdade por hash usam índice automático.

Ainda faltam o verificador derivado retomável, origens persistidas, remapeamento/
materialização/mídia, C4 dos novos temporários antes de ativação e Estúdio/ciclos.
C4 1–4 e dados own não mudam de significado. Macro 8/35 e P3/D/F2-09 abertos.
Sem agentes/CI/push/PR/merge/deploy. Full validate no fechamento do bloco
persistente; preservar master e servidor manual.

## Resultado local e próximo incremento

Staging descrito implementado, sem grant/callable. 364 testes dirigidos distintos
(23 novos) passaram: conjunto de 362 mais dois casos de revisão. Uma jornada
SDK/Rules real validou 71 pares, birth, lookup/ausência, privacidade e coleta.
ESLint dirigido e sintaxe de 467 módulos positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-indice-derivado-persistente.md)
registra resultados e correções. Estado cifrado até 256 KiB guarda apenas
staging limitado; DTO JSON até 4 MiB continua fora dele.

Próximo: verificador derivado retomável inclusive dentro das dependências de um
item, com hash incremental sem array do tamanho do projeto. Índice persistido
já atende às buscas do verificador completo em teste; isso não fecha a execução
retomável. Depois origens persistidas, materialização/mídia, C4 da ativação e
UI/ciclos. Macro 8/35 e P3/D/F2-09 abertos; somente commit local.
