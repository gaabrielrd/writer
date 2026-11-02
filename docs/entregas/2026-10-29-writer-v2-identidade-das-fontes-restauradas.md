# Writer V2 — identidade das fontes nos leitores de campanhas restauradas

- Data: 2026-10-29.
- Escopo: [plano 219](../tasks/writer-v2/execucao/219-identidade-das-fontes-nos-leitores.md).
- Decisão: [ADR 0249](../decisions/0249-campaign-restored-source-readers.md).
- Estado: incremento interno local; P3/D/F2-09 e macro 8/35 abertos.

## Implementação e aceite

Leitores de base/item/referências, lore/âncoras retidas e comparações reconhecem
evidência privada de restauração. A autorização confere nascimentos originais
exatos, dono, versão e C4, sem inferir acesso pela data da nova cópia. Provas
malformadas/parciais não voltam ao modo nativo e não aparecem nos DTOs públicos.
Gates por metadata antecedem snapshots e leitura de texto nos caminhos alterados.

O conteúdo congelado permanece íntegro após mudanças legítimas das fontes e
remoção da campanha/base antigas. A campanha pode comparar e adotar uma captura
nova pelos serviços normais; a evidência da base anterior continua utilizável em
âncoras retidas. Notas próprias não dependem da disponibilidade da origem.

## Testes e validação local

31 cenários novos em campaignRestoredReaders.test.mjs: captura/testemunhas reais
em banco de teste, cópia privada sem base antiga, texto congelado e DTOs,
recriações de aventura/universo/ficha, nanossegundo, C4/dono/exclusão, provas
inconsistentes, lore global/local, referências e universo organizacional.
Inclui notas após revogação, âncora após troca de base e ciclo real de comparação/
adoção de candidata nativa. Fixture prepara dados somente no banco em memória.

122 regressões pertinentes passaram: campaignBaseRead, campaignComparison,
campaignAdoption, campaignLore, campaignBackupOriginReview, adventureLoreCampaign
e campaignNotes. Total de 153 cenários distintos; rodadas repetidas não somadas.
A primeira execução nova teve sete falhas de montagem por tentar alterar
testemunhas congeladas; a fixture passou a copiar esses valores antes da alteração.
Os cenários passaram após a correção, sem relaxar o contrato de produção.

Checks finais de formato/lint, sintaxe Functions, arquitetura, docs e diff são
registrados no fechamento abaixo. Suite integral não repetida neste incremento:
o fechamento anterior do bloco 201–218 passou em f575981, e não comprova o código
deste incremento. A próxima suite integral fica para o fechamento do grande
bloco de restauração, conforme orientação do operador.

## Limitações e continuação

O materializador ainda não existe: este incremento não torna a restauração de
campanhas utilizável no Estúdio. Próximo: backup/reexportação com a evidência
original, referências opacas, inventário/cleanup C4 v1–v4, antes de persistir
jobs/prosa/pins/índices. Depois upload/retomada, remapeamento/materialização,
ativação e interface/ciclos. Sem CI, push, PR, merge ou deploy; commit local.
Não executar npm ci novamente: dependências já instaladas/validadas no bloco anterior.
O servidor manual em 127.0.0.1:5173 permaneceu disponível e não foi reiniciado.

## Fechamento dirigido

Rodada final conjunta: **153/153**, zero falhas/skips, 11728.5582 ms;
log local m142-readers-final.log no diretório de QA. ESLint dirigido positivo,
sintaxe de 447 módulos Functions positiva, arquitetura e documentação positivas.
Revisão manual do diff preservou API/provas de origem e ausência de produtor
persistente. Formato e diff conferidos antes do commit, sem alterar limites de testes.
