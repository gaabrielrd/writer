# Writer V2 — Formato de relações não resolvidas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base f8d13ea.
- Escopo: etapa A do [plano 224](../tasks/writer-v2/execucao/224-corpos-de-variantes-com-relacoes-opacas.md).
- Decisão: [ADR 0254](../decisions/0254-campaign-unresolved-relation-format.md).
- Estado: implementação e validação dirigidas locais; P3/D/F2-09 continuam abertos.

## Implementado

Emissão e revisão de conteúdo v3 distinguem relação não resolvida da
disponibilidade do alvo. Manifesto/header/raiz lógica concordam em 3;
framing 1 e procedência 2 permanecem. A leitura 1/2 conserva sua gramática,
e campos textuais 2/3 usam o mesmo contrato UTF-8 nativo.

O marcador unresolved true é aceito somente em relação false de variante,
sem labels, self ou campos extras. Alvo disponível precisa ser lore; o
marcador não concede autorização nem provoca busca por hash na origem viva.
Relações clássicas e relações da base/âncora conservam o contrato anterior.
Callbacks derivados recebem a versão do header; continuam provisórios.

Foi extraído um helper de teste para reescrever unidades, recalcular raízes
e reemitir assinatura Ed25519 e framing reais. Não há codec privado, novo
endpoint ou produtor persistente nesta etapa.

## Validação observada

22 casos novos e 542 regressões passaram: 564/564, zero falhas, skips ou
cancelamentos, em 20.208,5586 ms. Resultado final em
m147-wire-final.log no diretório local de QA.

A execução cobre todos os testes campaignBackup e os consumidores
campaignRestoredBackup, campaignPortableReferences, campaignPortableRelations
e campaignRestoredSessions. Inclui arquivos assinados 1/2/3, downgrade
reassinado com flag inválida, relações clássicas, alvo disponível/ausente,
tipos/campos proibidos, UTF-8 longo e callbacks disponíveis/indisponíveis.
A revisão completa não escreveu na campanha e descartou os índices temporários.

ESLint dirigido aos 11 arquivos de código/teste passou. Sintaxe de 449
módulos Functions positiva. Formato, arquitetura, documentação e diff final
conferidos; revisão sem achados bloqueantes e scan de marcadores de segredo
dirigido. Sem interface alterada ou validação SDK/navegador nova.
Testes usam serviços reais do domínio e banco de teste em memória.

## Limites e continuação

A dependência de formato foi explicitada antes do código: o join v1/v2 não
representava uma relação sem descritor após o alvo reaparecer. Somente a
etapa A está implementada. O codec privado e a preservação das chaves em
edições, remoções/restaurações, descarte, adoção e reexportação são a etapa B
obrigatória seguinte; nenhum desses caminhos novos é declarado concluído.

Depois: inventário/cleanup C4 v1–v4 antes de qualquer produtor persistente,
upload/retomada, materialização/ativação e Estúdio/ciclos. Macro 8/35 (22,9%)
permanece aberta. npm run validate não foi repetido neste incremento;
o resultado de f575981 comprova somente o bloco histórico 201–218.
Somente commit local, sem CI/push/PR/merge/deploy/agentes.
Servidor manual preservado, sem reinicialização.
