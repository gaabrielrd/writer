# P3 — universo organizacional no backup de campanha

- Data: 2026-10-29.
- Base: 496f6af; sequência de [214](214-revisao-autorizada-das-origens.md).
- Estado: implementação interna e checks dirigidos locais; P3/D/F2-09 abertos.

## Objetivo e contrato

Preservar o universo organizacional da campanha separadamente do universo da
base congelada, inclusive em campanhas independentes ou com derivados indisponíveis.
Adicionar evidência project, com campaignId e universo none, unavailable ou
reference com nascimento nativo. Ler somente metadata em transação após conferir
fonte própria/derivada e reserva C4; mudança do universo entre passagens impede
assinatura. A prova não copia lore nem autoriza acesso futuro.

Novos arquivos usam provenanceVersion 2 e raiz writer-campaign-witnesses-v2;
contentVersion e framing permanecem 1. Leitores e verificador continuam aceitando
provenanceVersion 1, sem inventar nascimento: resultado organizationalUniverse
unproven exige escolha e autorização posteriores. Versão 2 exige project antes
da base e vinculado à campanha; não usar o universo da base como substituto.

## Sequência e aceite

1. Projeção pura fechada e leitor nativo project, sem prosa nem escrita.
2. Auditor e emissor incluem project nas duas passagens e na assinatura v2.
3. Parser confere versão/ordem/unicidade e integridade; revisar universo
   organizacional por autor, nascimento e deleting, separadamente dos derivados.
4. Testes dirigidos: independente, universo diferente, indisponível, removido/
   recriado, owner/deleting, mudança durante auditoria/revisão, v1 real assinado,
   downgrade e project ausente/duplicado/trocado. Preservar testes existentes.
5. Checks locais, revisão do diff, ADR/documentação/evidência e commit local.

## Limites

Sem endpoint, UI, materialização ou adaptador persistente. Vínculo semântico
completo de todos os corpos e restauração permanecem tarefas seguintes; não
apresentar integridade/autorização como ativação. Antes de persistir recursos,
fechar inventário C4 v1–v4. npm run validate no fechamento do grande bloco;
somente testes pertinentes aqui. Sem CI/push/deploy/subagentes. P3/D/F2-09
abertos, macro 8/35 sem mudança.

## Evidência local

Os passos 1–4 foram implementados internamente; Node 138/138 (21 novos e
117 regressões) passou, assim como lint dirigido, arquitetura e links.
Conferir [ADR 0245](../../../decisions/0245-campaign-organizational-universe-provenance.md)
e [evidência parcial](../../../entregas/2026-10-29-writer-v2-universo-organizacional-no-backup.md).
O consumidor semântico e a restauração seguem pendentes; não fechar P3/D.
