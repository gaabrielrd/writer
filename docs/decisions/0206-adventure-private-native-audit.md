# ADR 0206 — auditar a preparação privada de aventuras

Data: 2026-10-28. Estado: implementado internamente e validado por testes dirigidos/SDK.

## Decisão e fundamentos

A auditoria usa o inventário puro compartilhado com o Store, preservando seu
reexport histórico. O layout cobre as coleções da raiz, filhos conhecidos de
cenas/blocos/arcos, preparedRoot e personas da origem tipada da aventura.
Coleções sem endereço de staging permitido precisam estar vazias.

Primeiro percorrer journals em páginas de oito, conferindo operação criadora,
última operação, nascimento/atualização e metadata do alvo. Depois percorrer
documentos físicos pelas mesmas famílias, com cursor independente por pai e
sem carregar corpos de texto ou arrays de bytes. Totais de journals e documentos
devem ser iguais a artifactCount. O último par journal/alvo vira anchor com
tokens nativos, reconferido antes de cada avanço.

Os writers de preparação ficam congelados pelas fases de auditoria. Rules
mantêm o SDK privado sem uma raiz ativa. Essas barreiras preservam páginas já
conferidas; a rotina não concede autoridade a escritores Admin arbitrários nem
faz consultas globais ao conteúdo de outros usuários.

A passagem de mídia abre uma intenção nativa por unidade, confere estado prepared
e verifica a geração privada de Storage fora da transação. O ACK revalida contexto,
controle, anchor e intenção no mesmo snapshot do checkpoint/recibo. Replay ocorre
antes de I/O. Falhas de leitura conservam o checkpoint; resposta perdida de commit
retoma o recibo, sem verificar novamente ou repetir o contador.

O contexto hash inclui job/origem/validação, inventário, contagens, personas, mídia
e layout. Cursores, anchor e ID do selo ficam privados; somente os três contadores
são públicos. Metadados das fases anteriores continuam obrigatórios.

## Consequências e limites

audit-ready é um selo da versão preparada, não uma autorização de ativação.
A raiz continua reservada, countReady false, personas preparing e imagens privadas.
Controles conferem palavras, processed/phase/cursor, índice narrativo completo e
quantidade de imagens. Cancelamento ainda revoga personas e confirma fences
antes de remover fonte e journals.

Instalar biblioteca/usos ou alterar o layout/inventário depois do selo exige
invalidar e refazer a auditoria. A ativação futura precisa conferir esse mesmo
contexto e reautorizar o universo na transação final. O selo atual não certifica
uma biblioteca que ainda não foi instalada nem substitui aceitação/URL posterior.

Testes dirigidos verificam inventário vazio/com texto e mídia, foreign/órfãos,
filhos/perfis sem journal, identidades recriadas, anchor, freeze, replay e
cancelamento durante Storage. O corpus do Writer mantém duas imagens por recurso
separadas. Não há novo endpoint, dependência, índice ou acesso público.
