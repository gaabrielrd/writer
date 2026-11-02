# P3 — Materialização das variantes de lore de campanhas

- Data: 2026-10-29.
- Base: f1c52bb.
- Estado: núcleo interno implementado; checks dirigidos e SDK positivos, sem ativação.

## Objetivo e aceite

Restaurar todas as variantes disponíveis e atualmente autorizadas em uma nova
geração nativa de lore da campanha reservada. Preservar base/override/removed,
previousMode, participação, retainedLegacy, texto literal e relações opacas.
A revisão assinada não substitui autorização atual. Omissões do arquivo não
revivem. Perda de acesso após iniciar uma variante interrompe o avanço.

Escrever corpos com o codec portátil existente, novas revisões e vínculos
nativos da nova campanha/base/geração. Remapear âncoras deterministicamente:
a base ativa quando sua testemunha é a mesma; demais âncoras apontam para
novas bases históricas a materializar no incremento seguinte. Nenhuma raiz
da campanha é ativada, nenhum leitor recebe esses recursos pendentes.

## Solução e sequência

1. Formato opcional do job, inventário de geração/journal e cancel/coleta
   antes do produtor. Coleta de variantes precede base/próprios/índices/chunks;
   sem chave nem grant da origem, sem ler prosa. Proteção do pai contra órfãos.
2. Coordenador interno com checkpoint cifrado pequeno sem acumular texto;
   no máximo um DTO limitado por chamada e até três corpos nativos.
   Ler metadata/testemunhas antes da prosa, reautorizar a mesma origem
   antes do I/O e dentro da escrita. Revalidar alvos de relações e tornar
   indisponíveis os descritores cuja origem não está autorizada.
3. Publicar overlay só após seus corpos. Criar geração preparing após filhos.
   Journal imutável e nascimentos nativos atômicos, CAS/replay/rollback.
   Auditoria registrada reautoriza origens, sem declarar auditoria física final.
4. Testes Node próximos para texto/codec/estados/âncoras, tamanho de checkpoint,
   revogações/omissões, CAS/replay/rollback/cancel e substituição de alvo.
   Jornada SDK demo com Rules e coleta dos novos caminhos.
5. Revisar diff, documentar ADR/arquitetura/AGENTS/inventário/evidência e commit
   local. Testes dirigidos agora; validate integral no fechamento do bloco.

## Limites e riscos

Não materializar bases históricas/ilustrações neste incremento. O certificado
é somente de variantes; não prova que as âncoras já existem. C4 adequado para
novos temporários, mídia, auditoria física, ativação/aposentadoria dos journals
e integração no Estúdio continuam obrigatórios antes de uso. Layouts C4 1–4
permanecem. Conteúdo grande é relido por DTO limitado, sem texto no checkpoint;
não truncar nem elevar o limite de 900.000 bytes do codec nativo.

## Resultado observado

Geração/variantes/corpos, guards e journal/coleta implementados. 296 casos Node
distintos positivos: 295 antes do limite final de auditoria (19 novos + 276
regressões); 20 casos de variantes positivos após o ajuste, incluindo um novo.
Uma jornada SDK/Rules positiva antes desse último limite de lote; origem
nativa, Rules pendentes, retry e coleta com pai protegido foram conferidos.
Arquitetura/sintaxe/lint/formato/docs/diff/segredos positivos.
[Evidência](../../../entregas/2026-10-29-writer-v2-materializacao-das-variantes-de-lore.md).
Sem ativação; bases históricas/mídia/C4/auditoria física/Estúdio permanecem.
Macro 8/35; validate integral no fechamento do bloco, somente commit local.
