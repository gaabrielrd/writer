# P3 — Retomada das variantes após reautorização nativa

- Data: 2026-10-29.
- Base: be6a8ca.
- Estado: implementado e validado com checks dirigidos/SDK; sem ativação.

## Problema e requisitos

Reprodução isolada confirmou que uma variante com três corpos já gravados
não retoma após revogar/devolver acesso à mesma origem: o hash persistido
inclui timestamps correntes. Preservar bytes/revisões/estados e permitir nova
tentativa revalidada. Alterar ou revogar/devolver acesso durante os mesmos
bytes deve invalidar aquela escrita. Origem recriada não herda permissão.

Manter congeladas as decisões de disponibilidade dos alvos durante o corpo;
omissões/relações opacas não revivem. Autorizar origem e alvos antes da prosa,
e comparar prova corrente estrita na escrita, incluindo mudanças nativas.

## Solução e sequência

1. Capturar fixture de wire anterior, somente dados fictícios, antes da mudança.
   Inclui fonte assinada, job/corpos parciais e metadata nativa; comprovar retomada
   pelo código antigo. Arquivo comprimido com codec nativo, sem dependência.
2. Introduzir discriminante opcional authorizationCodec edition-v1 no estado/job
   e journals novos. Decisão persistida vincula arquivo/testemunhas/mapeamento/
   disponibilidade dos alvos, sem timestamps correntes; prova estrita continua
   comparada entre antes/depois de I/O. Jobs sem discriminante usam validação
   legada, sem reescrever ciphertexts/journals/recibos.
3. Estender somente campos opcionais de binding no journal nativo. Preservar
   wire antigo e atualizar seleção/coleta dos journals de variantes pelas
   âncoras. Rejeitar codec desconhecido/mistura de codec no job e journal.
4. Quando job legado parcial não consegue mais validar seu hash corrente,
   preservar dados e oferecer motivo explícito de nova preparação necessária.
   Sem conversão silenciosa de decisões que não podem ser reconstruídas.
   Cancel/coleta legados seguem funcionando sem grant ou chave.
5. Testes dirigidos: owner/alvo com atualização nativa e mesma origem,
   revogação antes/durante bytes, revogar/devolver no mesmo I/O, recriação,
   relações opacas/decisão alterada, compatibilidade do wire/limpeza legada.
   Jornada SDK demo de corpo parcial, âncora histórica e coleta versionada.
6. Revisão, ADR/AGENTS/arquitetura/plano/inventário/progresso/evidência e
   commit local. Testes necessários agora; validate integral no fim do bloco.

## Arquivos e limites

Formato/origens/coordenador/writes de variantes, journal nativo, contratos
opcionais e seleção de journals por âncoras; testes/helper/fixture e SDK próximos.
Não alterar limites de 900.000 bytes/8 KiB/até três corpos ou uma auditoria por
chamada. Não mudar o codec do corpo, criar grants, recapturar texto ou ativar
campanha. Sem dependência nova, frontend/CI/push/PR/merge/deploy.
Mídia/universo organizacional/C4/auditoria física/ativação/Estúdio continuam.
Layouts C4 1–4 intactos; macro 8/35 e P3/D/F2-09 permanecem abertos.

## Resultado observado

Falha reproduzida e corrigida com decision codec interno edition-v1,
mantendo prova corrente estrita. Wire legado anterior à mudança retomou
sem reescrever prefixos; quando sua prova antiga muda, motivo explícito
preserva conteúdo e coleta. 326 casos Node distintos positivos (sete novos),
uma jornada SDK/Rules positiva e arquitetura/sintaxe/lint/formato/docs/diff/
segredos positivos. [Evidência](../../../entregas/2026-10-29-writer-v2-retomada-nativa-das-variantes.md).
Mídia/universo/C4/auditoria física/ativação/Estúdio continuam; macro 8/35 aberto.
Validate integral no fechamento do bloco, somente commit local.
