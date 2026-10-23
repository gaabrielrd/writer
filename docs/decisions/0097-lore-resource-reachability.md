# ADR 0097 — Alcance e coleta dos corpos de lore

- Estado: aceita para inventário de fontes e coleta interna; adoção/rollout pendentes.
- Data: 2026-10-23.
- Contexto: passos iniciais do [plano 82](../tasks/writer-v2/execucao/82-alcance-e-coleta-dos-corpos-de-lore.md).

## Problema e sequência

A adoção de campos precisa preservar corpos herdados, impedir limpeza de
uploads reservados e fechar as referências antes de coletar conteúdo retirado.
A exclusão atual de sceneJobs cobre bookTextBodies, mas ainda não payloads,
segmentos e leases de lore. Portanto, o inventário precede a habilitação da
troca ativa planejada no [plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).

## Decisão

books/bookId/bookLoreGenerations e bookResourceInventory mantêm contextos
imutáveis, estado revisionado e eventos/âncoras nativos. Geração ativa registra
nascimentos do livro/ficha, atualização da cabeça e hash do storage observado.
Corpo registra manifesto, nascimento esperado, cutoff opcional e geração inicial.

Estado, evento e âncora são criados juntos. Cada atualização tem evento
imutável com hash do estado e nascimento igual à atualização nativa.
Token do controle incorpora contexto, caminho e nascimento original.
Referência imutável sob o corpo liga o token/nascimento da geração ao evento
original de registro. Recriar contexto, estado, evento, prova ou referência
não reconecta uma encarnação anterior.

registerBookLoreSourceReference autoriza UID/livro/ficha e sourceToken em cada
unidade. Recebe somente seletor lógico de base/campo/página e deriva o ponteiro
no servidor, usando leitores nativos. Inicializa geração, depois corpo e
finalmente referência, de forma retomável. Corpo initializing é protegido
antes da primeira referência. Registro duplicado não incrementa contador.
Nenhum caminho/manifesto físico é aceito como autoridade do cliente.

Uma referência nova incrementa referenceRevision e invalida a varredura anterior.
Ela é recusada quando o corpo já está collecting ou collected.
Geração só pode ser aposentada quando a cabeça atual não usa mais seu ID.
Aposentadoria não pode ser revertida; o corpo coletado mantém fence permanente.

Antes de cada remoção, a coleta confere dono, nascimento e estado do livro,
cabeça atual e presença de lease. Base e campos são comparados diretamente.
Todas as páginas de relações são examinadas por lotes de até 16, sem supor que
um corpo conserve a posição anterior. A prova de alcance fica vinculada ao
nascimento/atualização nativos da cabeça. Mudar ou recriar a cabeça com os mesmos
dados reinicia a varredura, inclusive depois de reclamar coleta.
Nenhum chunk sai antes de concluir essa verificação na cabeça atual.

As referências de gerações também são examinadas por lotes de até 16.
Geração ativa protege o corpo. Ao terminar, collecting fecha o registro de
referências novas. Nova referência durante a varredura invalida seu cursor;
não há adoção de uma certificação antiga com contador diferente.

Chunks são removidos por índice, em lotes de até 16, usando somente metadata.
Cada delete exige escopo, imutabilidade, nascimento anterior ao header e
partSealBirth quando declarado. Corpo/header recriado é preservado.
Header sai por último, depois de confirmar que não existem chunks extras.

Abertura de página de relações foi extraída do reader sem relaxar os guards:
o objeto de lore pertence à mesma transação autorizada. DTO/clones e outra
transação são recusados; contagens e identidade dos readers v1/v2 permanecem.

## Limites de integração

Serviços são internos, sem callable ou worker automático. Corpos sem controle
são adiados; livro ausente/deleting também. Qualquer lease presente adia a
coleta: não se confia em um campo phase isolado, mesmo se ele disser adopted.
Reserva, adoção e liberação de leases precisam de protocolo/prova coordenados.

Gerações preparing, materialização inline, cópia/alteração de páginas na edição,
troca CAS/clock/privacidade e exclusão de livro/lore ainda serão integradas.
Nenhuma cabeça do produto foi trocada por este incremento. Cabeças que os
testes substituem são harnesses explícitos, não uma implementação de adoção.

Referências, controles e eventos são metadata privada permanente. complete
descreve o ciclo próprio de coleta; não prova que uma encarnação estrangeira
recriada depois esteja ausente, nem autoriza sua exclusão. Guardas finais da
exclusão do livro deverão auditar todos os namespaces antes de remover a raiz.

O inventário não é prova de SHA/domínio completo da prosa nem grant de leitura.
Os readers continuam exigindo autorização e provas dos bytes. Adoção não pode
ser habilitada antes de integrar leases, inventário e exclusão.

## Evidência

A [entrega M38c3e inicial](../entregas/2026-10-23-writer-v2-alcance-e-coleta-do-lore.md)
registra 102 Node distintos e quatro SDK positivos, incluindo 141 partes,
concorrência, páginas deslocadas, cabeça recriada e artefatos preservados.
