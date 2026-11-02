# P2 — consumo autenticado e remapeamento da aventura validada

Base: 6d50d3d. Continuidade do plano 170 e ADR 0192.
Grafo writer-v2 consultado, sem resultado suficiente; conferidos os contratos
de validação de aventura, DTOs/identidades centrais/imagens, referências nativas
e contrato de consumo de livro. Não converter tipos/domínios por cast.

## Plano sequencial

1. Criar factory interna de leitura que autentica content-verified, snapshot
   atual e resultado reconstituído, comparando summary/reportHash/fonte.
   Fixar conta/job/índice antes de I/O; recusar consumo anterior à aprovação.
2. Autenticar validationItems por ordinal, contexto, nascimento/operação/hash,
   shape/canonical pointerJSON. Reusar readAdventureValidationItem e fonte
   com provas 170. Expor verify(tx) que reconfere contexto, snapshot/item/fonte
   antes de qualquer escrita consumidora. Valores JSON imutáveis.
3. Abrir raw de versão/draft/imagem a partir do item autenticado. Um frame por
   leitura, limite 64 KiB, cursor privado vinculado à fonte/item/layout/manifesto;
   SHA incremental e UTF-8/fixed-text ou utf8-parts, PNG/contagens/bytes no término.
   Checkpoints são de host confiável e futuros stagers devem autenticá-los por
   recibo/estado privado antes de uso: nunca aceitar checkpoint do cliente.
4. Criar remapper puro, com contexto de job/origem/destino e IDs nativos <=80.
   Partes, cenas, blocos, arcos/marcos/eventos, lore/relações, checklist,
   controles/links, personas, histórico/draft e mídias ficam coerentes.
   Recalcular chaves determinísticas de referência/ordem/vínculo.
5. Imagem é identidade por asset/uso: mesmo imageId original em cena e bloco
   não deduplica suas cópias. Head, binding, manifesto e raw concordam.
   Mapeamento é projeção de identidade, não novo backup validado; hashes/contagens
   originais continuam prova da entrada e serão reconstruídos pelo stager.
   Universo e referências externas não ganham acesso por remapeamento.
6. Compor readMappedItem/openMappedRaw com prova original preservada; não tornar
   mapper puro ou sourceToken uma credencial de escrita. Bytes e estado retornados
   têm proteção contra mutação acidental antes da verificação.
7. Testes com arquivo produzido pelo Writer, todas as famílias/raw, vários
   destinos/contas/jobs, alteração/recriação de item/estado/provas, I/O/cancelamento,
   cursor cruzado/limites/UTF-8/SHA, IDs e relações. SDK demo de prova consumida
   antes de escrita e recusa de adulteração. Checks dirigidos após ajustes.
8. Revisão, ADR/docs/evidência e commit local. Validate integral do bloco anterior
   é base, não prova deste código; nova rodada ao fechar o próximo grande bloco.
   Sem CI/push/PR/deploy/agentes.

## Aceites

- [x] Report e unidade autenticados, fonte/observações verificadas antes de consumo.
- [x] Raw limitado com hash/UTF-8/contagens e checkpoint privado vinculado à origem.
- [x] Remapeamento coerente e por uso, preservando provas e referências externas.
- [x] Casos adversariais/SDK pertinentes e checks dirigidos positivos.
- [x] Revisão/docs/evidência e commit somente local.

Não implementa staging/ativação, concessão/religação de universo, Storage/biblioteca,
revisão visual, recuperação cifrada/UI ou roundtrip utilizável. São próximos
consumidores destes contratos, não substituídos por um relatório de identidade.
P2/P3/D/F2-09, gates humanos/comerciais e 8/35 permanecem abertos.
