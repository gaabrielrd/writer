# Writer V2 — auditoria da aventura restaurada

Data: 2026-10-28. Base: dd89774.
[Plano 184](../tasks/writer-v2/execucao/184-auditoria-da-aventura-restaurada.md)
e [ADR 0206](../decisions/0206-adventure-private-native-audit.md).

## Implementado

A preparação privada pode ser auditada antes da futura ativação. A rotina confere
journals e documentos físicos em ambos os sentidos, com páginas de oito e
cursores de pais. Corpo de texto e bytes de imagens não são carregados nessa
varredura; metadata, recibos e tokens nativos comprovam as versões preparadas.
A lista compartilhada preserva exatamente as 19 coleções anteriores e inclui
os filhos conhecidos do contrato, preparedRoot e personas da origem.

Writers ficam congelados. Contexto de job/origem/validação/layout/inventário
e anchor nativo são reconferidos por avanço. Mídia passa por verificação da
geração privada fora da transação, com revalidação da intenção e controles no
ACK. Replay precede I/O; falhas mantêm checkpoint/provas. Cancelamento continua
fechando personas e imagens antes da limpeza dos artefatos.

audit-ready certifica somente esse inventário/layout. Raiz reservada continua
sem ownerId, countReady false, personas preparing e imagens privadas. Instalar
biblioteca/usos depois requer invalidar e refazer o selo antes da ativação.
Nenhum endpoint, dependência, índice ou permissão pública foi acrescentado.

## Testes e validações

Onze casos Node novos distintos passaram em seleções: dez em duas rodadas de
cinco, 4.647,131 ms e 5.248,571 ms totais, e um rollback dirigido em
807,442 ms de teste/1.107,578 ms totais. Esse último recusa a criação do recibo
após a escrita planejada do job, conserva integralmente o estado e retoma uma vez. Cobrem inventário vazio, texto/PNG sem leitura
dos payloads, documentos físicos sem journal, alvos alterados/recriados, replay,
filhos/perfis estrangeiros, anchor e freeze, geração estrangeira de Storage,
ACK de mídia perdido e cancelamento enquanto a verificação está retida.
Não houve falha nessas seleções.

Um Vitest com arquivo real do Writer passou em 3,55 s totais/1,01 s de testes.
Duas imagens independentes de cena/bloco conservam bytes exatos e privacidade;
totais de journals/físicos conferem e o cleanup posterior fecha os dois caminhos,
preservando o original. Três regressões selecionadas da reconciliação passaram
em 3.668,785 ms. Comparação com o Store commitado confirmou a mesma lista de
19 coleções após sua extração para módulo puro.

Um teste integrado de SDKs Firestore/GCS reais passou em 212.534,010 ms totais.
Emulador demo Firestore 1.22.0, porta loopback dedicada 58226, e servidor GCS HTTP
local conferiram reserva concorrente da auditoria, rejeição de documento físico
sem journal com checkpoint intacto, recuperação após sua retirada pelo próprio
teste, falha de resposta da verificação sem avanço, replay sem novo I/O,
geração original/bytes exatos ainda privados, Rules e cleanup integral.
O teste removeu somente o documento estrangeiro que ele mesmo injetou no demo.
JVM dedicada encerrada no finally; ausência dos processos conferida depois.

Formatação, ESLint e sintaxe dos arquivos alterados, documentação, arquitetura,
styleguide e diff dirigidos positivos. Revisão conferiu layout/correspondência
dos inventários, páginas limitadas, controle de fase, provas de mídia e preservação
de recibos históricos/cleanup. Sem novo achado bloqueador identificado.

A suíte integral não foi repetida neste incremento. O último validate completo
continua sendo 10708fd, fechamento de 180–182, e não é atribuído ao código novo.
O próximo grande bloco conserva o gate integral, conforme a orientação de testes
dirigidos por ajuste. Sem redução de cobertura/limites e sem CI remota,
push/PR/merge/deploy ou subagentes.

## Limites

O selo não ativa a aventura, biblioteca ou URLs e não autoriza instalações
posteriores. Permanecem biblioteca/usos, sua auditoria final, ativação atômica
com reautorização do universo, aceitação/URL, recuperação/UI/roundtrip,
P2/P3/D/F2-09, fases 3–5 e gates humanos/comerciais. Macro 8/35 inalterada.
Nenhum teste em serviços de produção.
