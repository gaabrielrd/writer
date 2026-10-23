# ADR 0086 — Backup indexado das fontes congeladas

- Status: aceito para fontes externas novas
- Data: 2026-10-23
- Contexto: P1 M37b, depois da ADR 0085

## Problema

Recompor a fonte inteira para cada página JSON gerou 361 leituras de partes
para 19 páginas em M37a. É necessário reduzir esse custo sem cache entre
requisições, nova cópia do texto ou alteração do contrato cliente.

## Decisão

BookSceneSourceEncoding gera um índice a partir das partes exatas antes de
criar a geração. O manifesto bookTextBodies recebe sceneSourceEncoding na mesma
transação da fonte/partes/journals/cursor/recibo. Nenhum namespace, pin ou
inventário novo; v5/v7 e delete-book v2 continuam cobrindo a família.

Índice fechado: schemaVersion 1, contentHash do JSON portátil integral,
byteLength, prefixHash, suffixHash, offsets e carry. Até 129 offsets e carries
UTF-8 de 0–3 bytes, sem texto duplicado. O construtor confere SHA dos bytes
originais contra a fonte/manifesto. Não reduzir limite de entrada da restauração
nem liberar saída maior que o orçamento atual do formato.

Prefixo/sufixo vêm da projeção portátil existente com original.content vazio.
A projeção fechada tem uma única propriedade content; strings com aparência
desse marcador são escapadas pelo serializador. Preservar a ordem/bytes JSON
anteriores, campos ausentes, Unicode, BOM, aspas e controles.

O leitor valida formato/tamanhos/offsets/carries e hashes do prefixo/sufixo.
Reconstrói somente segmentos sobrepostos à página, lendo até três segmentos e
quatro partes nativas. Memoização dura somente essa transação. Conferir tamanho
escapado de cada segmento; partes ainda exigem SHA/escopo/nascimento/imutabilidade
pelo leitor de capítulo. Resposta continua limitada a 64 KiB.

O cliente conserva a conferência do hash JSON integral antes de emitir registros
provisórios da fonte e a verificação final das provas antes do selo. Leitura de
intervalo não equivale a conferir todos os bytes do recurso a cada página.

## Prova nativa

itemToken da fonte externa inclui agora nascimento e última alteração nativos
do manifesto, além da identidade da fonte e do contexto existente. A lista usa
máscara original.contentStorage e metadata do corpo, sem prosa. Cada página
recalcula a identidade; a varredura final também observa o corpo.

Alteração, ABA ou recriação integral de corpo/partes não herda a prova antiga.
Novo token não é autorização por si só: dono/estado/origem continuam conferidos
antes das partes, inclusive quando o item recebe um token recém-listado. Nenhuma mudança de DTO, API, Rules ou componente.

## Compatibilidade, evidência e limites

Fonte sem índice mantém o leitor anterior. Índice presente mas inválido falha
fechado, sem fallback que esconda corrupção. Jobs M37a sem índice continuam
compatíveis, mas precisam de migração/certificação antes da habilitação completa.

Node e SDK mediram 37 leituras de partes para 19 páginas; o SDK próximo de 8 MiB
produziu 128 páginas com 255 leituras de partes. São chamadas get de partes,
não contagem de faturamento ou benchmark isolado de latência. SDK também
comprovou o índice pelo fluxo real de restauração e sua limpeza.

Outros campos grandes, metadados e crescimento do JSON após remapeamento ainda
precisam de suporte integral antes da ativação. Capa/biblioteca, certificação,
migração dos jobs antigos, limpeza pós-ativação e host/UI/roundtrip/validate
permanecem. P1/F2-09 e Writer V2 abertos. Sem dependência, subagente ou
CI/push/PR/deploy novo.
