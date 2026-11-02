# Writer V2 — Materialização da base congelada

- Data: 2026-10-29.
- Branch: codex/writer-v2; base 211910e.
- Plano: [234](../tasks/writer-v2/execucao/234-materializacao-da-base-congelada.md).
- Decisão: [ADR 0264](../decisions/0264-campaign-frozen-base-materialization.md).
- Estado: núcleo interno validado com checks dirigidos; ativação/UI pendentes.

## Implementado e critérios atendidos

Base congelada é reconstruída nos caminhos ordinários com partes/cenas/blocos,
arcos/marcos/eventos, lore e texto exato. Campos vazios e corpos emprestados
são preservados; UTF-8 legado é convertido em chunks nativos sem perda,
inclusive quando muda a quantidade de partes. Itens são publicados após campos;
snapshot narrativo e evidência da edição arquivada são mantidos.

Localizador cifrado opcional no índice permite autorizar antes de abrir prosa.
Read/lookup e hash semântico anteriores permanecem. Guard da origem é repetido
na escrita, comparando sua prova com a observada antes do I/O.
Aventura inicialmente indisponível omite toda a base; perda apenas de universo/
ficha omite lore correspondente antes da cópia. Revogar a aventura durante
a seleção/cópia impede avanço, sem adotar texto novo ou liberar a campanha.

Journal nativo foi compartilhado com own, preservando seu wire, e baseWrites
foi integrado ao cancel/coleta antes do produtor. Auditoria e coleta leem
metadata/birth; pai não é retirado com filho desconhecido. Próprios e índices
são coletados depois da base. Raízes continuam pending/preparing.

## Testes e validação observados

276 testes Node distintos positivos em rodadas, sem somar reexecuções:
258 regressões existentes e 18 casos novos. m157-directed.log registrou
274/274 (16 novos + 258 regressões), zero falhas/skips/cancelamentos,
em 111.779,0013 ms. Após o guard adicional de seleção, os 17 casos novos
passaram em 55.585,7719 ms (m157-base-final.log). Um caso adicional de 2 MiB
passou em 36,0237 ms: muda chunkCount e preserva BOM/texto/hash e estado limitado.

Cobertura nova inclui arquivo real longo, lore local/global, leitura ordinária
após liberação exclusiva de fixture, legado, origem removida, omissão seletiva,
rollback em cinco pontos, CAS/replay, serviço recriado, revogação antes/depois
do I/O e na seleção, cancelamento com leitura pendente, key/recurso recriados,
órfãos, localizadores ausentes e proteção do pai/coleta sem prosa.

SDK/Rules: 1/1 cenário positivo em 273.167,7792 ms (m157-sdk.log).
Aventura, cena, lore local e campanha congelada foram produzidos pelos serviços
nativos. Arquivo foi assinado/enviado/revisado/materializado. Mudança nativa de
ownership durante leitura impediu escrita/checkpoint; reautorização da mesma
origem permitiu retry. Birth de raiz/journal, texto, evidência e Rules negando
raiz/corpo pendentes foram conferidos. Cancel com origem revogada preservou pai
com corpo estrangeiro; retirar somente o dado injetado permitiu coletar tudo.
Campanha original e recibo histórico foram preservados. Emulador demo/JAR
verificado, porta efêmera e encerramento pelo próprio runner.

Arquitetura, sintaxe de 480 módulos Functions, ESLint dirigido aos 14 arquivos
de código, formato, documentação/diff e scan de segredos positivos.
Nenhum build ou teste visual repetido: frontend não mudou.
Validate integral permanece para o fechamento de materialização/ativação;
o baseline de 9.871 testes de 3c1cefa cobre 227–232, não este código novo.

## Correções e revisão

A primeira regressão encontrou regex numérica escapada incorretamente no
localizador; corrigida e índice completo voltou a passar. O teste de procedência
foi ajustado para comparar a testemunha do arquivo atual, preservando a cadeia
da cópia anterior. A medição de I/O passou a contar leituras de bytes,
distinguindo abertura do adaptador de acesso à prosa.

Fixtures SDK foram alinhadas ao envelope kind/campaign da captura e ao limite
de IDs de operação. A inspeção usava query descendente de chave não suportada
pelo emulador; passou a consultar o ordinal conhecido do journal. Prazo do teste
foi dimensionado para o pipeline nativo completo, sem aumentar limites do produto.
Não houve redução de guards, permissões, quotas ou cobertura.

Revisão manual de módulos/diff, limites, autorização por transação, formato
nativo e coleta concluída sem achados restantes bloqueadores.

## Limitações e continuação

A liberação para leitores ordinários é exclusiva da fixture Node. Raiz da
campanha e base produtivas permanecem indisponíveis. O certificado interno
não substitui auditoria física final e autorização de ativação.

Índices antigos sem location permanecem revisáveis/coletáveis; materialização
exige nova preparação explícita em outra restauração quando faltar o localizador.
Variantes/âncoras, binários/biblioteca/pins, universo autorizado, C4 dos jobs,
auditoria física/ativação e Estúdio/ciclo rico continuam pendentes.
Macro 8/35 (22,9%) e P3/D/F2-09 abertos; master/servidor preservados.
Somente commit local, sem agentes/CI/push/PR/merge/deploy.
