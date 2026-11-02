# Writer V2 — materiais restaurados nas sessões

- Data: 2026-10-29.
- Escopo: [plano 222](../tasks/writer-v2/execucao/222-materiais-restaurados-nas-sessoes.md).
- Decisão: [ADR 0252](../decisions/0252-campaign-restored-session-materials.md).
- Estado: incremento interno preparado; P3/D/F2-09 e macro 8/35 abertos.

## Implementação

Cenas e blocos de S2 reutilizam a autorização por item da base restaurada.
Candidatos e janelas de blocos passam pelo gate, em vez de somente validar
a forma dos dados. Máscaras de metadata incluem a prova privada; DTOs de
sessão/material não expõem os marcadores.

Mantém a resolução pela base ativa/C2 atual, sem fallback histórico, nome
ou lore vivo. Vínculo ausente continua neutro. Adoção explícita invalida
o contexto antigo e permite consultar a nova base autorizada sem reescrever
a preparação S1. Não há novo marcador de sessão ou alteração do formato.

## Testes e resultados

**43/43**, zero falhas/skips, 1238.7105 ms; log local m145-sessions-final.log.
São 16 cenários novos de campaignRestoredSessions e 27 regressões de
campaignSessionReferences, campaignSessionScenes e adventureLoreCampaign.
Rodadas anteriores/repetidas não são somadas.

- Captura/testemunhas e cópia restaurada em memória; sessão e vínculos criados
  pelos serviços do domínio. Plano, blocos principais/adicionais, UTF-8 longo,
  lore efetivo e imagem com pin/geração próprios.
- Cinco violações de prova de cena recusadas na listagem, candidatos,
  nova vinculação, plano e blocos, sem corpo/Storage ou escrita parcial.
- Quatro violações de prova de bloco recusadas em lista/texto/imagem.
- Declaração própria de alvo ausente passa pela serialização/parser de backup;
  leitura fica neutra sem buscar base antiga ou origem viva. Reexportação
  assinada passa pela revisão completa própria/derivada/origens.
- Recriação da aventura suprime material antes do corpo; recriação do universo
  deixa cenas autorizadas acessíveis e lore neutro, após reconsultar a projeção.
- Adoção nativa real invalida contexto antigo; contexto novo consulta a base
  nova, mantendo preparação própria íntegra. Variante C2 é a fonte efetiva.
- Mudança da prova durante download impede devolver a imagem.
- Nenhum DTO inclui sourceEvidence/archiveHash/sourceMode.

O primeiro caso de perda do universo usava um sourceContext antigo; o gate
corretamente exigiu nova consulta. A fixture foi corrigida para usar a projeção
atual, sem relaxar o contrato de produção.

ESLint dirigido, sintaxe de 448 módulos Functions, formato, arquitetura,
documentação e diff final positivos. Revisão manual sem achados bloqueantes;
scan dirigido sem marcadores de segredo. Não houve nova validação SDK/navegador:
os serviços rodaram no banco de teste com timestamps nativos simulados.
PNG real foi convertido em WebP; a porta de download do teste confere path e
geração, sem consultar serviços de produção.

## Limitações e continuação

Relações externas portáteis de lore/variantes pendem. Depois: inventário/cleanup
C4 v1–v4, upload/retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
Nenhum produtor persistente de restauração foi habilitado. Não houve push,
PR, CI, merge ou deploy; somente commit local e servidor manual preservado.

npm run validate não repetido neste incremento: fica para o fechamento do
grande bloco. O resultado de f575981 é histórico de 201–218 e não comprova
estas mudanças. Dependências já instaladas no bloco anterior.
