# ADR 0142 — Revisão e interface da seleção de visibilidade

- Status: aceito, interface exportada, sem montagem no compêndio.
- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco C.

## Contexto

O executor durável da ADR 0141 precisa de revisão autorizada e confirmação
explícita, sem converter um resultado local em promessa de visibilidade atual.
Pedidos pendentes e rascunhos protegidos devem sobreviver à recarga na mesma
conta, após conferir a origem, conforme decisão do operador.

## Decisão

Exportar BookLoreVisibilitySelectionDialog e BookLoreVisibilitySelectionRecoveries,
além da revisão pela sessão Auth existente. A abertura de uma tentativa nova
não cria manifesto ou pedido; Conferir seleção fixa a seleção e o bool desejado.
Mudanças posteriores de props não substituem a tentativa. Ao retomar, o bool
vem do manifesto, sem assumir um padrão a partir das props do host.

Revisão percorre todas as páginas, confere emissão C1/v2 contra a origem
original e captura nomes e consentimento completos somente em RAM. Ausência
de isPublic é privada por padrão e permanece distinta de false explícito.
Resultados já encerrados são ignorados, evitando abrir tokens obsoletos.
Reautorizar cada fonte e a seleção antes de exibir a confirmação. Retry exige
consulta nativa anterior e revisa somente o membro do cursor original; conferir
que outro handle não o encerrou durante a revisão.

Confirmar visibilidade e reenviar são ações distintas. A interface explica
processamento por ficha, efeitos parciais e ausência de publicação automática.
Verificar progresso consulta/prepara, sem aplicar; salvar dívida local executa
uma unidade e para. Retry envia somente o pedido original da ficha revisada,
sem aplicar as demais. Cancel usa handle fresco e invalida o produtor visual
anterior, podendo repetir falha sem aguardar a rede do produtor.

Descoberta é paginada, metadata, por conta e filtrada pelo livro. Valores locais
são neutros até provas originais conferidas; não carregar nomes nem prosa na
lista. Filhos com writeId lore-selection-visibility- seguido de 64 hex são
omitidos da lista de edição manual isolada, mantendo registros e paginação:
devem retomar pelo grupo, sem oferecer um apply que contorne sua confirmação.
Não apagar, revogar ou descartar as cópias protegidas ao esconder ou cancelar.

Callback exige seleção, valor, contagens e todos os resultados conferidos,
sem dívida; dispara uma vez por seleção/host. IDs aplicados e unchanged são
separados. O futuro host deve reler os valores atuais: efeito histórico não
congela isPublic nem certifica publicação, atomicidade de grupo ou GC.

A mesma instância Auth permite mudança de perfil; outro actor, mesmo UID,
ou outro livro invalida a UI e os resultados tardios. Usar Dialog e estados
do kit, variáveis de tema e CSS existente, com foco no aviso/erro/resultado,
Voltar, Tab contido, Escape e restauração do gatilho.

## Consequências e continuidade

Não criar backend, método no transporte 18/22/7, schema cifrado, dependência,
env ou Rules. Revisão não cria filhos, chaves ou pedidos de edição.

Etapa 4 implementada; etapa 5 do plano 125, composição do compêndio com todas
as ações existentes, permanece necessária. Lifecycle, consumidores, backup,
rollout e validate integral de P1, fases 3–5 e gates humanos/comerciais
continuam no objetivo. Somente commits locais, sem CI/push/PR/merge/deploy.
