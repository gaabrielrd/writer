# Incremento 22 — Contexto editorial na análise de lore

## Estado

Implementado em código, com testes preparados e não executados neste turno. O impedimento
anterior de cota da revisão automática não se repetiu: a gravação pendente do incremento
21 foi aprovada. O objetivo integral permanece ativo; este incremento não encerra E3.

## Captura e geração

A análise de lore passa a usar composeEditorialContract, a mesma composição pura do
guia e decisões dos demais recursos. readLoreAnalysisEditorialContext autoriza livro e
capítulo, confere a revisão salva e produz instrução e prova de nascimento/revisão/hash.
O escopo declarado é editorial-contract-only, com wholeBook false. O guia não é prosa
observada, não comprova acontecimentos e não confere autorização operacional.

A consulta getLoreAnalysisEditorialContext é autenticada e somente de leitura no loreApi,
sem chave de geração. São 436 ações nos mesmos 16 setores; não há nova Function, preço
ou dependência. O diálogo consulta antes de gerar e congela o token no pedido. BYOK
recebe a mesma composição; o registro servidor exige a prova exata quando há guia.
O caminho da plataforma também confere o token fornecido antes de iniciar o provedor.

A instrução pura do provedor agora é compartilhada entre Functions e BYOK. Exige evidência
literal do texto selecionado e distingue fato narrado, fala, crença, interpretação e
proposta. Proíbe usar lore/guia/reservas futuras como evidência ou promover hipóteses a
fatos observados. A classificação estruturada dessas afirmações ainda está pendente;
a instrução sozinha não comprova o cumprimento sem revisão humana.

## Invalidação e aplicação

A revisão da análise incorpora a origem editorial quando configurada ou retirada.
Nascimento nativo do guia, revisão, hash e clock distinguem recriações com os mesmos IDs
ou texto. O resultado guarda somente a prova no registro privado; a instrução enviada
é transitória e apresentada no diálogo, sem copiar o guia para o ticket persistido.

Para cenas, a prova inclui sceneRevision e revisões de composição/estrutura do capítulo.
Assim uma mudança da prosa invalida a análise mesmo com o cache legado intacto. Essa
é uma prova de base nativa, não afirmação de que a consulta do guia leu todas as cenas.
A análise continua sobre o texto explicitamente selecionado, inclusive rascunho não salvo.

Após cada resposta do provedor e antes do resultado ready, o servidor reautoriza as
fontes. Replay, aplicação legada, reserva preparada e cada autorização da preparação
conferem a revisão/token atuais. Guia alterado, removido ou recriado exige nova análise,
sem reaplicar nem debitar. Recibos já aplicados conservam seu replay histórico sem nova
publicação ou escrita. Limites, evidências literais e operações atômicas existentes
permanecem; nenhum fallback para SDK foi acrescentado.

## Interface

O diálogo permite inspecionar a composição exata utilizada, sua revisão e a fronteira
de leitura. A prévia é textual, escapada pelo React, com quebra de linha e altura limitada.
Não declara leitura integral do livro. BYOK mantém credenciais fora da chamada de registro,
do contexto editorial e de sua prova persistida.

## Casos preparados, não executados

- Captura sem escrita e instrução igual à composição canônica; ticket sem texto do guia.
- Guia alterado durante a resposta impede ready e cobrança.
- BYOK com guia exige a prova exata antes de reservar resultado.
- Resultado ready não aplica depois de mudar o guia, mesmo com o texto idêntico.
- Recriar guia com mesmos bytes/revisão altera a identidade e impede replay antigo.
- Retirada do guia produz ausência explícita; outro dono e livro deleting não o leem.
- Clock nativo de cenas invalida análise mesmo com cache e guia iguais.
- Cliente BYOK envia o guia como orientação; diálogo mostra a composição e vincula
  registro à prova sem encaminhar a chave. Os testes antigos de diálogo foram adaptados
  para a nova consulta autenticada, e o registro de ações passa a esperar 436 destinos.

Não foram executados testes, tipos, lint, formato, build, navegador ou cobertura neste
turno. O grafo consultado tinha linhas desatualizadas de index.mjs; a leitura local atual
foi usada como fonte antes da edição. Reformatar e validar no fechamento autorizado.

## Pendências

Completar a classificação estruturada de fato observado/interpretação/proposta e sua
revisão/proveniência no fluxo de lore. Auditar todas as entradas de IA, snapshots,
contextos limitados e fontes alteradas conforme E3, sem confundir o contrato comum com
leitura global. Fechar E5: inventário/visão de impacto e portabilidade .writer editorial
como nova cópia privada, sem restaurar grants ou execuções antigas. Permanecem os
aceites E1–E4, cobertura de funções >=90% e validação integral.

Antes dos testes finais, conferir/incorporar a principal conforme pedido do autor.
Última base incorporada identificada: 16d8af5. Sem commit literário, merge de volta,
push ou deploy. Nenhuma etapa formalmente encerrada por este incremento.
