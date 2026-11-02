# P2 — estrutura privada da aventura restaurada

Base: 6366aba. Contratos 170/171, ADRs 0192/0193 e escritores nativos de
cenas/partes/blocos/importação conferidos. Grafo parcial consultado sem resultado
suficiente; não repetir indexação. Implementar staging real e sua limpeza juntos.

## Sequência

1. Estender metadata/recibos/progresso de job com staging fechado e compatível,
   mantendo state content-verified e raiz mínima sem ownerId. Progresso não
   retorna títulos/textos. Phase structure-ready ainda não autoriza ativação.
2. Acrescentar lookup autenticado de recurso ao leitor 171 pelo índice privado
   e sourceItemIndex, reconferindo índice/item/fonte na transação consumidora.
   Permite unir head/corpo ou parte/controle sem varrer o arquivo inteiro.
3. Registro de artefatos por endereço canônico, vinculado ao job/token e a
   criador/último atualizador imutáveis. Journal/target nascem juntos e efeitos
   selam ambos. Endereços fechados relativos à aventura/job, sem caminhos livres.
   Não adotar documento existente ou filhos inesperados de head novo.
4. advanceAdventureRestoreStructure percorre unidades até adventure-resources:
   definição privada da raiz, workProgress incompleto, partes/controle,
   cenas e blocos com corpos nativos preparados juntos, controle sem parte.
   Preservar conteúdo/ranks/arquivo/audiência/IDs mapeados e datas autorais quando
   presentes; reiniciar revisões operacionais. Contagens agregadas serão reconstruídas
   antes de ativar. Demais recursos ficam para a etapa seguinte.
5. Usar limites nativos de texto/documento (800.000 bytes/900.000 JSON) sem
   truncar. Unidade incompatível falha explicitamente, preservando fonte e
   permitindo cancelar; validação de formato não promete representabilidade nativa.
6. Revalidar todas as provas antes das escritas; confirmar targets, journals,
   checkpoint e recibo atomicamente. Replay, concorrência, falha/rollback e
   cancelamento durante I/O não podem criar duplicações ou restos sem journal.
7. Estender cleanup para journals/targets e preparedRoot, inclusive jobs antigos.
   Provar nascimento/última versão por operação e hash; usar metadata de corpos
   grandes na remoção. Verificar filhos conhecidos dos heads, contagens e
   namespaces finais; não apagar conteúdo alheio ou certificar órfãos/faltas.
8. Testes nativos Node/Vitest e SDK demo de staging invisível, texto exato,
   replay/corrida/rollback/cancel, orçamento/representabilidade, ABA/mutação e
   cleanup. Checks dirigidos após ajustes; validar integralmente ao fechar
   o próximo grande bloco de materialização.
9. Revisão/ADR/docs/evidência e commit local; sem CI/push/PR/deploy/agentes.

## Aceites

- [x] Lookup de recurso autenticado com prova consumida na transação.
- [x] Partes/cenas/blocos/textos preparados privadamente com journal atômico.
- [x] Metadata, replay e conflito corretos, sem exposição/ativação prematura.
- [x] Cleanup de targets comprovados, com recusa de dado estrangeiro/ausente.
- [x] Testes dirigidos/SDK, revisão/checks/docs e commit locais.

As próximas etapas continuam obrigatórias: recursos restantes/índices, lore,
personas/imagens, universo autorizado, histórico e draft como versão separada,
contadores/audit/ativação, recuperação cifrada/UI e roundtrip. Não publicar nem
criar ownerId na raiz neste incremento. Não reviver recurso somente histórico.
P2/P3/D/F2-09, gates humanos/comerciais e 8/35 seguem abertos.
