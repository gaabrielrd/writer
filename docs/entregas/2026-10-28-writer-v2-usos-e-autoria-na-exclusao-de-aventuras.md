# Writer V2 — usos e autoria na exclusão de aventuras

## Estado e funcionalidades

Preparação interna do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 916490c. [ADR 0225](../decisions/0225-adventure-deletion-images-and-authorship.md)
registra contratos e limites; não é a entrega da exclusão completa ao usuário.

- Portão de mídia revalida fonte/coleta/chaves e recusa preparação remanescente.
- Vínculos tipados de imagens são removidos em páginas de 25 com contador
  agregado por imagem, preservando outros projetos/contas e arquivos ativos.
- Uso órfão é retirado mesmo sem cabeçalho da imagem, sem recriar contador.
- As 23 famílias de autoria são removidas por metadata, inclusive filhos sem
  pais. A raiz marcada permanece até os passos finais ainda pendentes.
- Verificação final reabre uma família conhecida que reapareceu, sem certificar
  children. Retry e recibos mantêm a identidade e os efeitos atômicos.
- Dois índices adicionais declarados localmente; nenhum foi implantado.

## Testes dirigidos e resultados reais

| Rodada                                   | Resultado            |
| ---------------------------------------- | -------------------- |
| Início, quiescência, fontes e inventário | 56/56, 14879,3814 ms |
| Limpeza nova + quiescência, rodada final | 32/32, 2188,7956 ms  |
| SDK/Rules anterior + duas jornadas novas | 13/13, 46195,0875 ms |
| SDK isolado de uso órfão sem heads       | 1/1, 4211,6397 ms    |

Há **78 cenários Node distintos**: 17 de início, dez de quiescência, 18 de fontes,
11 de inventário e 22 novos de limpeza. As rodadas se sobrepõem; não somar seus
totais como cenários novos. São **14 SDK/Rules distintos** em rodadas.

A primeira rodada da limpeza teve uma asserção de timestamp inválida: comparava
também funções do double por referência. Foi corrigida para comparar seconds
e nanoseconds; os campos nativos e as assertivas de preservação foram mantidos.
O SDK real também comprovou updateTime do contador/recibo/checkpoint conjunto.

Os casos novos cobrem contagem compartilhada, 25/25/3/0, conta vizinha, metadata
malformada, quatro pontos de rollback do vínculo, dois de rollback de corpos,
ACK perdido, 54 corpos sem pai, uso sem imagem e raiz, preparação/chave tardia,
reaparecimento atrás da varredura e aventura restaurada com biblioteca/job
ativados preservados. Testes usam dados sintéticos; nenhum projeto real apagado.

Logs fora do Git: m116-regression.log, m116-cleanup.log,
m116-cleanup-retry.log, m116-final-node.log, m116-sdk.log e m116-sdk-orphan.log.
Os processos de teste e emuladores próprios foram encerrados.

## Checks e revisão

Sintaxe dos 402 módulos Functions, ESLint dos oito arquivos de código/teste,
arquitetura, documentação e skills passaram. Formato dos arquivos alterados e
diff conferidos. Revisão sem bloqueador para este incremento interno; não
atribuir o validate anterior ao código atual. Sem alterações de interface,
Rules, dependências ou exports de index.

## Pendências

O job chega a controls em deleting, com recibos/reserva e raiz marcada.
Controles/chat derivado, atividade, vazio terminal/remoção da raiz, exposição
autenticada, cliente/UI/retomada e validação integrada continuam necessários.
Perguntas próprias permanecem preservadas enquanto a política estiver pendente.

Não fecha plano 199, P2/P3/D/F2-09 ou V2. Macro 8/35 e gates humanos/comerciais
inalterados. Testes frontend/build/browser não foram repetidos. Validate integral
no fechamento do bloco 198–exclusão, conforme orientação do operador.
Somente commit local; sem CI/GitHub, push, PR, merge ou deploy.
