# ADR 0190 — validação retomável do arquivo de aventuras

Data: 2026-10-27. Estado: aceito para implementação local.
[Plano 168](../tasks/writer-v2/execucao/168-validacao-retomavel-do-arquivo-de-aventuras.md).

## Decisão

adventureRestoreValidationStep usa o parser e a máquina semântica próprios de
aventura. Uma chamada processa um frame, finaliza uma unidade JSON limitada ou
resolve até 64 relações. Snapshot fechado até 64 KiB, máquina até 16 KiB,
JSON até 8 MiB/128 spans e ponteiro até 16 KiB no port de índice.

O estado clonado não muda o checkpoint recebido. Fonte/read/signal, métodos de
índice/addItem e factory de hash são fixados antes do primeiro await. O host deve
fornecer fonte imutável/verificada e buffer transacional para todos os efeitos;
só confirma índice, ponteiros e checkpoint juntos. Erro exige descartar o buffer.
Esta primitive não oferece transação nem persistência por conta própria.

O SHA dos bytes JSON recebidos nos frames acompanha o checkpoint. Ao reconhecer
o fim da unidade, a releitura por spans precisa corresponder a esse SHA antes
do uso semântico. O lookahead fica sem confirmação e é relido na próxima chamada.
Não aceitar apenas offsets/tamanho como prova de conteúdo.

Cada JSON conserva record/spans/bytes/SHA. Cabeçalhos que iniciam texto histórico,
draft ou PNG exigem ponteiro raw com cursor/layout/manifesto. A reabertura confere
SHA do JSON, manifesto e identidades declaradas, sem colocar prosa no índice.
Texto UTF-8 e hash retomam com engine nova; parte vazia permanece parte real.

Só EOF/envelope e fechamento semântico produzem stepped-content-only.
O host ainda precisa autenticar job/checkpoint/operação/birth, reconferir bytes
e origem em transações e limpar staging. Checkpoint/índice nunca vêm do arquivo
ou de alegação do cliente. O relatório não é grant nem validação remota final.

## Validação e continuidade

20 Vitest distintos dirigidos positivos, em seleções, com corpus nativo,
comparação ao leitor contínuo, reabertura de todos os tipos de raw, 53 cenas,
128 partes/8 MiB e rejeição do byte excedente, vazio/arquivo/importação,
corrupção resealada, fonte mudada na releitura, falha/rollback/retry e abort.
Lint/sintaxe e checks documentais acompanham a evidência. Não repetir ou atribuir
o validate de 167 ao código novo; fechamento integral no próximo grande bloco.

Transporte, reserva/upload, coordenação persistente, remap/mídia, ativação privada,
UI e roundtrip continuam pendentes. Histórico exige resolver nascimento da raiz
e invisibilidade antes do stager. P2/P3/D/F2-09 e demais gates seguem abertos.
