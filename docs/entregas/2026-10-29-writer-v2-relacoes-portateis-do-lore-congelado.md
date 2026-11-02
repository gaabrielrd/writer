# Writer V2 — relações portáteis do lore congelado

- Data: 2026-10-29.
- Escopo: [plano 223](../tasks/writer-v2/execucao/223-relacoes-portateis-do-lore-congelado.md).
- Decisão: [ADR 0253](../decisions/0253-campaign-portable-frozen-lore-relations.md).
- Estado: leitores internos da base preparados; corpos de variantes/P3/D/F2-09 abertos.

## Implementação

Validador puro de relationMode/portableRelations em item lore de base restaurada.
Leitura normal, C2/readBaseEntity e backup preservam relações lógicas sem
reconstruir targetEntityId. Ordem/múltiplos tipos são mantidos; self é aceito
conforme o formato de base existente. Ausência explícita não vira grant.

Estrutura é conferida antes de corpo; alvos true exigem a ficha capturada
autorizada na mesma base/âncora. C2 ainda projeta nomes/variantes atuais.
Alvo false não é consultado na leitura normal. Backup verifica ausência física
por metadata para não emitir estado contraditório.

O arquivo mantém os DTOs anteriores e omite nomes/tipo/descrição de relações
sem acesso. Descritor histórico sem alvo continua no registro privado original,
e a projeção reexportada fica não resolvida. A futura revisão de restauração
deve informar essa omissão. Nenhum registro original é alterado pela emissão.

## Testes e resultado real

**199/199**, zero falhas/skips, 10930.1695 ms; log local m146-relations-final.log.
São **20 novos e 179 regressões distintas**, sem somar rodadas repetidas.
Suítes: campaignPortableRelations, campaignBaseRead, campaignLore,
campaignBackupBaseRead, campaignBackupLore, campaignAdoption,
campaignComparison, campaignRestoredSessions e campaignBackupDerivedSemantics.

- DTO nativo real convertido em memória: ordem e dois tipos do mesmo alvo,
  relação indisponível e preservação de DTO/reexportação assinada/revisão completa.
- C2 mostra somente nomes efetivos autorizados; alvo false não é sondado.
- Save/discard de ficha inteira conserva a base e suas declarações não resolvidas.
- Origem recriada não reautoriza descritores; reexporta somente chave/estado.
- Onze violações de marcador/tipo/chave/estado/UTF-8 recusadas pelos três leitores
  antes de corpo; limite 50 aceito pelo validador e 51 recusado, sem truncamento.
- Relação false continua oculta se item aparecer; backup recusa contradição.
- Descritor histórico sem alvo permanece privado e reexporta não resolvido.
- Âncora base-mode retida após adoção nativa e restauração passa na emissão/
  revisão completa, incluindo contagem de alvos externos não resolvidos.
- Base nativa e item não lore não aceitam marcadores portáteis.

As primeiras montagens tiveram três falhas: âncora de backup desatualizada
após descarte; enumeração de um item deliberadamente malformado antes do caso
alvo; e operação remove ainda não confirmada antes da adoção. As fixtures
passaram a reconsultar a âncora, exercitar diretamente o item autenticado do
caso e confirmar as operações C2. Nenhuma regra de produção foi relaxada.

ESLint dirigido e sintaxe de 449 módulos Functions positivos.
Formato, arquitetura, documentação e diff final positivos. Revisão manual sem
achados bloqueantes e scan dirigido sem marcadores de segredo. Não houve
validação SDK/navegador nova; banco de teste com timestamps simulados e
serviços reais do domínio. Sem alterações de interface.

## Continuação obrigatória

Corpos de variantes usam entityInput canônico e ainda não suportam relações
opacas sem labels. Esse modelo e seus caminhos de escrita/adoção são o próximo
incremento, sem inventar descritores ou perder chaves em edições seguintes.
Depois: inventário/cleanup C4 v1–v4, upload/retomada, remapeamento/materialização/
ativação e Estúdio/ciclos. Macro permanece 8/35, sem produtor persistente.

Suite integral não repetida: npm run validate no fechamento do grande bloco.
O validate de f575981 é histórico de 201–218 e não comprova estas mudanças.
Sem CI/push/PR/merge/deploy/agentes; somente commit local e servidor preservado.
