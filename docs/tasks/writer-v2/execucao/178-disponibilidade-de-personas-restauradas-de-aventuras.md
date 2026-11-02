# P2 — disponibilidade de personas restauradas de aventuras

Base: 13325c8. Dependência da instalação dos perfis privados de 174 na biblioteca.
O grafo foi consultado; módulos recentes sem cobertura suficiente, fonte atual
e consumidores reais conferidos.

## Requisitos e escopo

Livro conserva restoreOrigin v1 com bookId e lotes existentes. Aventura recebe
restoreOrigin v2 com target {kind: adventure, id}, restoreId e jobToken.
Nenhuma aventura será identificada como livro. Biblioteca e consumidores devem
reconhecer apenas o lote correto, próprio e ativo; preparing/cancelled/ausente/
inconsistente não permite edição, vínculo ou uso de IA/backup.

## Sequência

1. Evoluir personaAvailabilityContracts e declarações para uma união fechada:
   v1 inalterado, v2 exclusivo de aventura com ID restore-a e helper de projectId.
   Verificar discriminante, namespace, dono, jobToken, campos extras e clones.
2. Evoluir personaAvailability no servidor: máscara de batch inclui target,
   namespace e ações/recibos próprios de aventura. Prova continua exigindo mesmo
   nascimento de batch/primeiro recibo, último recibo imutável e versão nativa
   da atualização do batch. Sem leitura de instruções antes de disponibilidade.
3. Atualizar exportação/modelo e personaService: listagem, inscrição/deduplicação/
   remoção de observadores e salvamento usam projectId do contrato. Preservar
   origem no documento e removê-la do perfil devolvido, como no formato atual.
4. Evoluir regras de origem/batch para v2 sem alterar permissões de leitura,
   criação de persona manual ou servidores. Edição/binding continuam bloqueados
   antes de ativo; cliente não cria/modifica a origem nem lotes.
5. Testes dirigidos Node/Vitest/SDK demo de livro legado e aventura, estados,
   erro/revogação, edição, divergências e recriação nativa. Validar consumidores
   reais de aventura (backup/IA), não somente o parser.
6. Checks de tipo/lint/sintaxe/docs/arquitetura/styleguide/diff, revisão,
   ADR/evidência/progresso e commit local com hooks normais. Validate integral
   no fechamento do bloco maior; sem CI/envio remoto/agentes.

## Não escopo e riscos

Este incremento não instala perfis nem ativa lote/projeto. Instalador retomável,
dedupe, journals/cleanup e ligação com ativação real seguem obrigatórios no
próximo incremento. Fixtures de lote ativo são harnesses, não prova desse fluxo.
Não mudar permissões de leitura da biblioteca nem colocar profiles preparing
nos seletores. Não duplicar personas por binding nem perder overrides na futura
instalação. O cliente protege seleção e edição; a prova de metadados nativos
também protege consumidores no servidor. Não confundir essas garantias.

## Aceites

- [x] Origem própria de aventura sem alterar o formato de livro existente.
- [x] Prova nativa, cliente e regras isolam projetos/contas/gerações e estados.
- [x] Consumidores reais de aventura só usam perfil após prova válida.
- [x] Testes/checks dirigidos, revisão/docs/evidência e commit local.

27 Node de disponibilidade +15 da instalação existente, 13 Vitest da biblioteca
e 12 SDK reais positivos. Correções/limites e gate integral pendente estão na
[evidência](../../../entregas/2026-10-27-writer-v2-disponibilidade-de-personas-de-aventuras.md).

P2/P3/D/F2-09, fases seguintes e gates humanos/comerciais permanecem abertos.
Macro 8/35 não muda.
