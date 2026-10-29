# ADR 0260 — Índice derivado persistente com posições autenticadas

- Data: 2026-10-29.
- Estado: aceita para staging interno pré-ativação.
- Plano: [230](../tasks/writer-v2/execucao/230-indice-derivado-persistente.md).
- Continua [ADR 0259](0259-campaign-persistent-own-semantic-review.md).

## Decisão e sequência

campaignBackupDerivedStaging compartilha ordem, campos pendentes, pareamento
variante/âncora e envelope com o revisor completo. O produtor persistente exige
integridade e semântica própria concluídas. Avança até 25 frames, com checkpoint
cifrado, CAS, recibo original e releitura de job/chave/barreira nas portas.

A conclusão é campaign-derived-index-only. A verificação semântica derivada tem
dependências potencialmente numerosas dentro de um item; a próxima etapa deverá
retomar também esse percurso e o hash, sem limitar textos ou repetir todo o
revisor em uma chamada. Índice não concede origem, compra, derivado ou ativação.

## Modelo físico e autenticação

Famílias novas e separadas de reviewRows own:

- JOB/derivedRows/ORDINAL guarda metadata cifrada, seção/posição e hashes
  determinísticos de lookup/referência inversa. IDs ordinais têm 15 dígitos.
- JOB/derivedPositions/SEÇÃO-POSIÇÃO aponta para ordinal e metadataHash da linha.
  Não contém chave lógica nem prosa. Seção é enum fechada, sem caminho do cliente.

Ambos são schema 1 e imutáveis, nascem atomicamente com recibo/testemunha e job.
Efeito do recibo prova metadataHash e pointerHash por ordinal. Leitura verifica
conta, encarnação, nascimento/imutabilidade dos três documentos e hashes antes
de decifrar. Ciphertext usa AAD de domínio/UID/RID/jobToken/ordinal. Mudança ou
recriação com valores iguais não substitui o recurso original.

Chave lógica e descriptors permanecem na cifra. Payload de metadata mantém os
65.536 bytes do staging anterior, mais envelope limitado a 4 KiB. Não guarda
texto, imagem ou corpo JSON. Progresso/recibos guardam contagens/hashes mínimos.

## Lookup, ausência e reverse

Igualdade em identityHash usa query limitada a dois resultados, sem índice
composto. Duplicata ou identidade decifrada divergente falha fechada. Uma query
vazia não certifica ausência: em base:item/variant, busca binária por posições
autenticadas encontra vizinhos adjacentes, conferindo cardinalidade selada,
seção/posição e ordem da chave. Se achar a chave que a query omitiu, falha.

Reverse usa hash por tipo em índice automático e autentica o resultado. É
testemunha de existência; vários vínculos legítimos ao mesmo alvo não são
duplicidade inválida. O verificador confirma o papel do proprietário.

Portas internas read/lookup/reverse só abrem após selo e envelope fechados,
revalidam job/chave/índice em cada chamada e deixam de funcionar ao cancelar.
Read limita páginas a 25. Certificado é de staging, sem semântica persistida.

## Texto, JSON e estado

O leitor JSON limitado foi compartilhado com a revisão própria: no máximo
4 MiB de um DTO concluído, sem corpo no checkpoint. Apenas esse registro pode
ser relido ao completar; não reunir arquivo inteiro. Não aumentar limites
nativos das fichas para fabricar casos maiores.

Campos e imagens são consumidos sem reunir corpos. UTF-8 legado admite caractere
dividido entre frames; checkpoint conserva cauda canônica de até três bytes,
revalidada com decoder fatal. Campo vazio permanece válido. Gramática nativa
2/3 e flags unresolved v3 são preservadas.

Estado de staging fica cifrado no job com schema 1 e limite de 256 KiB, para
envelope, pareamentos e mapas de seções limitados. derivedIndex guarda contadores,
cardinalidade por seção e selo, não conteúdo. Tamanhos ficam dentro do documento
Firestore; buffers de DTO são externos ao job. Jobs anteriores sem campos
continuam válidos. Nenhuma linha own é reinterpretada.

## Coleta antes do produtor

Antes de ligar o produtor, cancelamento passou a limpar derivedReview com os
outros estados e revogar chave atomicamente. Counters mínimos permanecem.
Cleanup lê metadata por ordinal, verifica par e recibo, e retira até 25 pares
por passo (até 50 documentos). Sem chave ou leitura de payload.

Após as linhas, consulta posições por metadata e exige ausência, incluindo
órfãos sem linha. Só depois avança para índice own e chunks. Buraco, estrangeiro,
recriação, par ausente ou rollback mantém o passo sem avanço; não apagar órfão
alheio para completar. Reservas/recibos terminais conservam apenas metadata.

Rules recursivas existentes negam SDK inclusive ao dono. Não mudar C4 1–4:
integrar jobs, índices e posições no C4 apropriado antes de ativação. Antes de
novo produtor de origens, preparar seu inventário/coleta.

## Evidência e continuação

Testes com arquivo real assinado comparam todas as linhas ao staging do revisor
completo. Um adaptador de MAC apenas de teste permite ao verificador completo
usar read/lookup/reverse persistidos; isso não implementa execução semântica
retomável em produção. SDK real prova posições/birth/ausência/coleta.

Verificador derivado por dependência, origens persistidas, materialização/mídia,
C4 da ativação e UI/ciclos continuam necessários. Sem endpoint público ou grant.
