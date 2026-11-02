# ADR 0141 — Seleção durável de visibilidade do lore

- Status: aceito, núcleo e sessão implementados localmente (marco B).
- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md).

## Contexto

A ação de tornar várias fichas públicas/privadas deve sobreviver a recarga,
pedidos sem resposta e cancelamento parcial. Não pode perder ações existentes
do compêndio, limitar a seleção a 50 ou inferir aceite pelo estado atual da ficha.
A edição protegida e a prova histórica já existem nas ADRs 0139 e 0140.

## Decisão

Criar writer.book-lore-visibility-selections v1, com selections, pages e members.
O manifesto fixa UID, livro, seleção, bool desejado, quantidade e hashes das
páginas. IDs filhos vinculam também posição, ficha e token original.
Páginas têm até 50 membros; a seleção inteira não possui esse teto.
Manifesto, páginas e estados iniciais são gravados atomicamente antes de RPC.

Estados guardam somente hash da intenção, referências originais de inspeção/
upload/edição, tokens observados, flags e outcome. Sem nomes, prosa, manifest
de conteúdo ou chave. Referências/hash são imutáveis e tokens observados não
podem mudar. Outcome e cursor/contadores atualizam na mesma transação CAS,
resolvida somente em oncomplete. CancelRequested é monotônico.

Compartilhar a rotina curta IDB/Web Locks já usada pela seleção de retirada.
A fábrica parametriza nome e stores, preservando literalmente nome/versão/
stores/DTOs/domínios de hash antigos. Nenhum lock compartilhado cobre rede.
Não representar visibilidade com o schema ou contadores de retirada.

Preparação confere emissão C1/v2 contra o token original e captura a ficha
completa. A única mudança é isPublic. A intenção é comparada ao ticket protegido;
o gate da ADR 0140 registra referências antes da RPC. Fontes inline/v1/v2 usam
o mesmo fluxo. Não promover tokens, usar stubs nem regenerar pedidos a partir
de metadata. Cópia filha ausente antes de aplicar exige verificar/cancelar;
aceite original continua consultável sem essa cópia.

Antes de apply, gravar applyRequested e referência original. Enquanto incerto,
advance/apply consultam a prova da ADR 0139; retry separado exige consulta
anterior e nova conferência, reenviando somente o pedido original explícito.
Fixar jobToken/outcomeToken e conferir alteração exclusiva de isPublic e
privacidade final desejada. Se não houve aceite e a origem mudou, fechar como
conflito sem adotar a origem nova. Erro de prova não vira ausência/conflito.

Dívida local conhecida salva sozinha na ação seguinte. Não avança outra unidade.
Cancel grava intenção independentemente do produtor, consulta eventual aceite,
fecha inspeção antes dos demais controles e limpa preparação por unidades.
Visita todos os IDs, inclusive nunca iniciados, preserva aceites e cópias
protegidas e não requer chave. Limpeza bloqueada pelo inventário permanece
pendente, sem certificado falso de encerramento ou GC.

Estado desejado já presente é outcome unchanged: origem real e final conferidas,
sem edição fictícia; fecha a inspeção original. Isso registra que nenhuma alteração
foi feita, não que a visibilidade atual ficou congelada. Ausência de isPublic
virando false explícito é uma edição, não unchanged.

Resultados locais são neutros até conferência nativa no novo handle.
Aceites consultam o recibo original; cancel/conflito/unchanged exigem controles
originais fechados. Contagens locais sozinhas não concluem a seleção.
Toda observação assíncrona fica vinculada ao membro e à geração originais;
callback antigo não usa o membro ativo mutável depois do cancelamento.

A sessão Auth expõe criação/retomada/descoberta e captura o mesmo actor SDK
para leitor e editor; perfil preserva, substituição de actor/host invalida.
O acesso a unidades continua no transporte fechado bookLoreEdit, sem métodos
novos nos conjuntos 18/22/7. Nenhuma mudança backend, Rules, env ou dependência.

## Consequências e continuidade

API/serviço exportados, ainda sem diálogo/revisão/lista de retomadas de
visibilidade montados. Na composição, filhos de seleção devem ser retomados
pela seleção, evitando oferecer apply isolado na lista manual. O callback
deverá recarregar dados atuais, sem projetar o efeito histórico sobre uma edição
posterior. Não declarar atomicidade de grupo ou coleta de todos os recursos.

O marco B conclui manifesto/ledger/executor/sessão; o plano 125 permanece aberto
para revisão/retomada/UI e compêndio com todas as ações. Também seguem abertos
lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates humanos
e comerciais. Desenvolvimento e commits locais, sem CI/envio remoto/deploy.
