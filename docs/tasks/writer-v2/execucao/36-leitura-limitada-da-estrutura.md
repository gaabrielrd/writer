# F2-09 P1 M3b — Leitura limitada da estrutura salva

Estado: contrato técnico para implementação em 2026-10-21, após M3a e a decisão
de commits locais. P1/F2-09 continuam abertos; este marco fornece a leitura da
estrutura que alimentará o arquivo completo, sem oferecer ainda backup na UI.

## Objetivo e decisões

Capturar metadados próprios do livro, estado editorial/meta total, atos e
capítulos salvos com memória independente da quantidade de documentos. Preservar
texto exato, inclusive vazio, Unicode, composição por cenas, referências de ato,
complemento de persona e datas presentes, sem inventar campos legados ausentes.
Rascunho do editor, cenas/fontes, narrativa, lore, personas completas, histórico,
mídia e restauração continuam no contrato P1 e nas próximas etapas.

Usar três leituras autenticadas, sem jobs, gravações, novos recursos privados ou
dependências: getBookBackupSource, listBookBackupStructure e readBookBackupStructure.
A raiz ativa do próprio autor é revalidada na transação de cada chamada. Publicação
não concede acesso ao backup. A configuração padrão das callables conserva App Check.

O token de origem vincula UID/livro, createTime/updateTime precisos da raiz e
presença/createTime/updateTime do controle workProgress/current. Não usar a data
numérica do produto como identidade. A ausência do controle é observada, sem
criar um controle como efeito da leitura. Writers ativos não removem o controle;
a limpeza do projeto ocorre depois de deleting. Manutenção Admin deve conservar
esse protocolo, além de avançar a raiz ao alterar pertencimento de atos/capítulos.

As páginas, de até 50 itens, consultam por ID com máscara vazia: somente identidade
nativa, sem prosa. Cada item tem token próprio vinculado à origem, tipo, ID e
createTime/updateTime. O cursor é fechado e vinculado à origem/tipo/livro. Tokens
não concedem autorização nem são metadados portáteis a gravar no arquivo.

O leitor de item reautoriza a raiz e compara ambos os tokens antes de projetar os
campos conhecidos. Cada resposta contém no máximo 64 KiB de bytes em base64
canônico, índice, total de partes, tamanho e SHA-256 do JSON UTF-8 completo. Um
item serializado é limitado a 8 MiB, acima do pior escape JSON de um documento
Firestore de 1 MiB. Falha explícita em dado não representável; nunca truncar.
Campos desconhecidos, publicação, contadores, operações, credenciais, URLs de
capa e grants não entram na projeção. Capa é sinalizada como biblioteca, legado
indisponível ou ausente; bytes/autorização continuam na etapa de mídia.

No cliente, o serviço escreve um item por vez em um sink que aceita os registros
M2. Reconstrói/confere somente esse item (máximo 8 MiB), sem juntar o livro inteiro.
O sink é aguardado antes da próxima leitura; erros/abort não repetem pedidos.
Uma cadeia SHA-256 incremental dos pares ID/token, em ordem por tipo/ID, registra
a seleção usando memória constante, sem guardar um readset ilimitado.

A verificação final reenumera atos/capítulos sob a mesma origem, compara a cadeia
e contagens e revalida a origem. Metadados alterados/restaurados e recriação de
mesmo ID invalidam pelo tempo nativo. Pertencimento depende de M3a e dos writers
Admin que avançam a raiz atomicamente. A interseção dos intervalos entre leitura
e conferência prova um corte coerente; não promete que seja o estado mais recente.
Todos os registros permanecem provisórios: o orquestrador completo deverá verificar
esta prova depois de capturar as demais capacidades e antes do selo M2/EOF.
Este marco não expõe um botão nem trata sua prova como arquivo completo.

## Sequência e arquivos

1. Contrato puro functions/src/bookBackupStructure.mjs e declaração de tipos:
   projeções fechadas, limites por item/chunk e envelopes de transporte.
2. functions/src/bookBackupRead.mjs, index.mjs e package check: três APIs somente
   de leitura com origem nativa, paginação e corpos limitados.
3. book-portability/services: adaptador callable e captura/verificação com sink;
   exportações públicas sem importações internas de outras features.
4. Testes Functions e Vitest de estado preservado, seleção completa, Unicode,
   chunks/hash, resposta inválida, abort/backpressure, isolamento e invalidação.
5. SDK/emulador real: leitura privada, metadata isolada sem alterar raiz, criação/
   remoção atômicas, Admin legado, controle de progresso, origem recriada/deleting.
6. Tipos/lint/sintaxe/arquitetura/formato/docs/diff dirigidos; registrar evidência
   e commit local. Validate completo no fechamento do grande bloco P1, sem CI.

## Aceites e riscos

Nenhuma gravação/débito/publicação; lista sem prosa; corpo exato reconstituível;
mais de 50 itens sem corte; ordem determinística; IDs Unicode sem normalização;
origem/controle/item alterados ou indisponíveis impedem aceitar aquela captura.
Resposta fora do contrato e fonte inválida falham antes da confirmação. Cancelamento
ou falha do sink interrompem leituras; memória do serviço limitada por item/página.
O sink final ainda precisa de contrato de arquivo persistente e cancelamento:
este marco não prova uso de memória do consumidor, disco ou exportação completa.

O grafo foi consultado primeiro e não contém os helpers recentes de Functions;
caminhos atuais e testes foram conferidos no checkout. Tokens ausentes, clocks
incompletos de manutenção ou callers antigos após rollout não são tolerados como
snapshot válido. Nenhuma evidência deste marco fecha schema de todas as capacidades,
restauração, piloto humano, condições comerciais ou uma tarefa ampla adicional.

## Resultado da implementação

Leituras, projeções e captura/verificação implementadas. Nove testes Functions,
25 de captura, três de adaptador, regressão Blob/M2 e nove cenários SDK positivos.
Chromium ligado ao emulador validou cinco casos com 108 capítulos, partes de
64 KiB e arquivo M2 íntegro. Import estático inicialmente tentou inicializar App
Check; mantido bloqueio externo, corrigido por import adiado, execução final sem
runtime errors ou requests externos. Falhas estáticas, resultados e limites na
[entrega](../../../entregas/2026-10-21-writer-v2-leitura-da-estrutura.md).
Nenhum selo desta estrutura demonstra completude das demais capacidades P1.
