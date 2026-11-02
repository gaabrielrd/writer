# P3 — backup de campanhas restauradas com identidade original

- Data: 2026-10-29.
- Base: 9dc4bdd; sequência de [219](219-identidade-das-fontes-nos-leitores.md).
- Estado: leitores implementados e validação dirigida positiva; P3/D abertos.

## Objetivo e aceite

Integrar a evidência privada de base/item aos leitores de backup, incluindo
âncoras retidas. Reexportar uma cópia usa seu novo ID privado de base, mas mantém
capturedAt e os nascimentos originais autorizados; não procura a base antiga.
Texto congelado, variantes e omissões continuam submetidos à autorização atual.
Recriar aventura/universo/ficha com o mesmo ID nunca libera o arquivo anterior.

## Suposições e não escopo

Reutilizar sourceMode/sourceEvidence definidos em 219 e o núcleo exato de
campaignSourceAccess. Provas gravadas somente pelo futuro materializador servidor
após revisão autenticada; fixtures persistem apenas em banco de teste. Capturas
nativas sem marcadores conservam a regra anterior, sem mudança de formato público,
limites ou contratos v1/v2. Sem produtor persistente, endpoints ou interface.

## Sequência e arquivos

1. Expor validação pura compartilhada da testemunha de item em
   campaignRestoredSource, preservando os leitores normais.
2. campaignBackupDerivedSource seleciona os marcadores, valida a origem exata
   antes de qualquer conteúdo e inclui sua prova no token privado.
3. campaignBackupBaseContext aplica os mesmos gates na base/âncoras e itens:
   validação fechada/vínculos, nascimento exato e ausência explícita de fonte.
   Testemunhas de reexportação usam IDs privados atuais com nascimento original.
4. Conferir bindings de corpos em campaignBackupLoreContext e os consumidores
   de inventário/leitura/imagens. Distinguir endereço de armazenamento da
   autorização da ficha, já provada pela âncora. Não atribuir data nova à fonte.
5. Testar cópia sem base antiga, exportação real assinada e revisão completa,
   UTF-8, lore local/global, variantes/âncoras legadas, recriações, C4/dono/
   exclusão, provas inconsistentes, mudanças no meio da captura e regressões.
6. Checks dirigidos, revisão do diff, ADR/documentação/evidência e commit local.

## Riscos e continuação

Não importar inventário de backup no núcleo de autorização: evitar ciclos.
Não ler prosa antes do gate nem expor sourceEvidence/IDs operacionais em DTOs.
A identidade do destino físico pode mudar; a fonte autorizada não é inferida
por nascer antes da nova base. Guardar indisponibilidade em vez de promover
uma origem exportada sem prova. Revalidar fontes antes/depois de I/O.

Após estes leitores: consumidores de referências opacas e inventário/cleanup
C4 v1–v4 antes de jobs/prosa/pins/índices persistentes; depois upload/retomada,
remapeamento/materialização/ativação e Estúdio/ciclos. P3/D/F2-09 e macro 8/35
abertos. Testes dirigidos neste incremento, suite integral no grande bloco,
sem CI/push/PR/merge/deploy/agentes. Preservar servidor manual.

## Resultado dirigido

20 novos e 373 regressões positivos, emissão assinada/revisão completa de
arquivo rico e âncora retida após adoção nativa. Confira a
[evidência parcial](../../../entregas/2026-10-29-writer-v2-backup-das-campanhas-restauradas.md).
Consumidores de referências opacas e C4 v1–v4 são os próximos gates antes de
qualquer escrita persistente de restauração.
