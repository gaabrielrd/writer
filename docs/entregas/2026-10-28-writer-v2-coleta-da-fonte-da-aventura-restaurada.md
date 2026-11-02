# Writer V2 — coleta da fonte da aventura restaurada

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: 9d7a339.
- Plano: [188](../tasks/writer-v2/execucao/188-coleta-da-fonte-da-aventura-restaurada.md).
- Decisão: [ADR 0210](../decisions/0210-adventure-activated-source-collection.md).

## Objetivo e funcionalidades

O serviço interno descarta fonte e preparação privadas depois de ativar a aventura
e concluir a mídia. Usa páginas, provas nativas, contagens, consulta vazia e controle
separado; preserva o job congelado e confirma exclusões/progresso/recibo atomicamente.

Projeto editado, biblioteca/usos e personas/lote permanecem. Recibos e estados de
ativação/mídia continuam acessíveis sem a fonte. Root ausente ou recriado não é lido
nem autorizado pela coleta. Chave de recuperação pendente e registros inesperados/
recriados nos namespaces privados bloqueiam sem adoção ou exclusão ampla.

## Aceites

- [x] Exige mídia concluída, controle separado e parent congelado.
- [x] Fonte/preparação removidas por provas, contagens e consultas vazias.
- [x] Projeto/biblioteca/personas preservados, inclusive após alterações reais.
- [x] Atomicidade/CAS/replay/ACK/ABA/isolamento e fonte grande cobertos.
- [x] SDK, revisão/documentação e validate integral do bloco 186–188.
- [x] Commit local.
- [ ] Recuperação/transportes/UI/roundtrip integrados.

## Arquivos

ArchiveContracts, ArchiveRead, ArchiveUnits, ArchiveStore e Archive novos;
composição no Transfer. Testes Node/helper, corpus real e SDK novos.
ADR, arquitetura, AGENTS, índice de execução, progresso e plano mantêm as regras.

## Testes dirigidos

Dois casos iniciais **2/2** em **1.977,233 ms** totais confirmaram exclusão privada,
preservação do restante e replay histórico. Rodada ampliada **10/11** em
**16.332,929 ms**: o teste de ABA avançava a primeira página antes de selecionar
um journal do arquivo mínimo, que já tinha sido removido corretamente. Fixture
ajustada para usar o checkpoint zero nessa fase; retake selecionado **1/1**
em **3.148,165 ms**. Onze casos distintos positivos nas seleções.

Cobrem mídia incompleta, conta/token/entrada fechada, rollback de exclusão/
controle/recibo, ACK perdido, journals/definições/chunks/proofs/índice/itens/estado
recriados, registro inesperado e reaparecido atrás do cursor, chave pendente,
root editado/removido/recriado e checkpoint concorrente/recibo recriado.

Fonte histórica com 1.200.000 caracteres atravessou mais de 16 chunks, estados
SHA e páginas, preservando os corpos de histórico nativos. As leituras projetadas
não incluíram Base64, hashState, valueJSON, pointerJSON ou stateJSON.

Corpus real do Writer **1/1 Vitest**, **3,81 s** totais/1,29 s de testes:
duas imagens, detach nativo, coleta integral, leitores normais e edição posterior
funcionam; parent/heads/originais preservados. Uma geração inicial do novo arquivo
foi recusada por CRLF pelo helper de escrita; a tentativa sem arquivo saiu com
No test files found. Após normalizar LF, o corpus foi criado e passou.

Formatação e ESLint dirigidos passaram. Revisão final dos 17 arquivos, diff e
10 hashes de código congelados positivos; nenhum segredo identificado, arquivo
.env ou artefato acima de 5 MiB. Nenhum limite de cobertura alterado.

## SDK e fechamento do bloco 186–188

SDK final **1/1 verde**, sem skips/falhas, em **256.061,190 ms** totais;
caso em **254.704,486 ms**. Firestore demo 1.22.0 em loopback 61383 e Storage
HTTP local com SDK real. Confirma rollback da página, duas chamadas idênticas
concorrentes, nascimento conjunto de controle/recibo, negação SDK dos controles,
oito namespaces privados vazios e preservação do parent, projeto editado e
imagem retirada. Replay e estados de mídia/ativação continuam válidos após
apagar a fonte. JVM dedicada encerrada e ausência conferida; sem produção.

A rodada anterior ao reforço das máscaras também passou, **1/1 em
257.170,683 ms** totais; não soma um segundo cenário distinto. A repetição acima
executa a versão final, com getAll obrigatório e máscara explícita da chave.

**npm run validate integral verde**, saída terminal 0, **1.546,84 s** totais
(25 min 46,84 s). Código congelado antes da execução e dez hashes reconferidos
ao terminar:

- **336 arquivos / 4.331 testes frontend**, sem falhas, em **800,21 s**.
- Cobertura: **89,94% statements / 85,71% branches / 91,12% functions /
  93,24% lines**; limites 85/75/90/85 preservados.
- **90 scripts**, sem falhas/skips/cancelamentos, em **18.857,975 ms**.
- **3.656 Functions**, sem falhas/skips/cancelamentos, em **402.811,404 ms**.
- Sintaxe das **388 Functions**, typecheck, bundle (**2,19 s**) e smoke verdes.
- Skills, arquitetura, documentação, styleguide, formatação e lint integral
  passaram no mesmo comando.

O build conserva avisos existentes de imports dinâmicos ineficazes, incluindo
exportDocx e lore; não foi atribuída aprovação remota nem alterado o bundling.
Este resultado fecha localmente o bloco 186–188, sem atribuir o validate de
183–185 ao código posterior.

## Limites

Serviços ainda internos, sem novos endpoints/UI, dependências, índices, Rules,
CI, push/PR, merge/deploy ou subagentes. São removidos somente os namespaces
privados enumerados; dados arbitrários de Admin não são adotados.

Recuperação/transportes/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e condições
humanas/comerciais continuam abertos. Macro 8/35 inalterada. Coleta não equivale
a apagar o projeto, publicar a obra ou concluir a V2.

## Revisão das máscaras e repetição da validação

A revisão acrescentou recusa explícita do port sem getAll antes de qualquer
leitura/exclusão. Também fixou máscara não vazia de restoreId na conferência
pontual da chave, sem depender da semântica de máscara vazia. Testes negativos
verificam ausência de leituras no port incompatível e preservação da chave
malformada sem hidratar seu material.

A primeira validação integral foi encerrada para esse ajuste após **431,33 s**:
documentação/styleguide/formatação/lint haviam passado e a cobertura frontend
estava iniciada. A árvore própria foi conferida por PID/ancestralidade/início,
encerrando apenas seus processos. Não contabilizar como passe integral nem
como falha funcional da suíte. A execução corrigida está registrada no
fechamento integral acima.

Dois casos novos de máscaras elevam para **13 testes Node novos distintos**.
A seleção final de chave pendente/port sem getAll/chave malformada passou
**3/3 em 1.503,811 ms**; a coleta normal e o guard também passaram **2/2 em
1.951,683 ms**. Todos foram reexecutados na suíte integral verde.
