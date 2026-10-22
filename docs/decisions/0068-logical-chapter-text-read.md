# ADR 0068 — Leitura lógica de capítulos

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M24](../tasks/writer-v2/execucao/57-leitura-logica-dos-capitulos.md).

## Decisão

bookChapterText separa abertura de cabeçalho, leitura de uma parte e leitura
integral, mantendo o mesmo contrato M23. A abertura só vale na transação corrente;
não aceitar abertura do cliente. Reusar verificação de contexto, manifesto,
tamanho/hash, nascimento das partes e UTF-8/BOM.

A nova callable readLegacyChapterText é composta por addBookChapterRead na fábrica
workProgress. Exige raiz própria existente e não deleting, capítulo legado ativo
e geração explicitamente esperada. Retorna uma parte binária base64, índice,
manifesto e sourceToken; nunca caminho privado nem fallback para inline/ausência.
Índice zero inicia a leitura; demais índices exigem token observado.

sourceToken fixa UID/livro/capítulo, nascimento da raiz, nascimento/atualização
do capítulo, nascimento do corpo e manifesto. Cada chamada reautoriza projeto,
ponteiro e parte na mesma transação. Troca do ponteiro, metadados, recriação ou
revogação interrompem a captura. A callable usa o wrapper existente com Auth/
App Check e headers private, no-store/Vary Authorization. Isso descreve código;
os testes SDK locais não comprovam transporte ou App Check em produção.

## Cliente e consumidores

chapterTextReadService monta bytes em memória: primeira parte fixa token, lotes
de até oito partes conservam contexto, tamanho/hash total e UTF-8 estrito são
conferidos. Releitura da primeira parte com token confirma origem ao terminar;
troca de conta antes/depois de respostas ou hash invalida o resultado. Nenhum
cache persistente de prosa, token ou corpo é criado.

bookService hidrata capítulos com texto antes de entregá-los a editor/exportadores
existentes. A listagem processa um capítulo de cada vez para limitar concorrência
total de partes. Metadata-only omite corpo externo e mantém contrato anterior;
não é uma fonte para substituir o texto salvo. Null sem descriptor ou representação
dupla falham na leitura com conteúdo. Modelo público Chapter continua contendo
string lógica, sem detalhes de armazenamento.

readHistorySource/sourceToken, projeção de backup, bootstrap e leitura implícita
do ledger, além de hash salvo da análise de lore, usam texto lógico. Backup
continua serializando o item JSON completo em cada requisição de parte, com
limite existente de 8 MiB do item codificado; não reduz, trunca ou amplia o formato.
A quantidade de leituras desse caminho acompanha tamanho/partes, mesmo sem acesso
SDK aos corpos. Interfaces visuais e publicação não foram modificadas.

## Evidência e próximos passos

120 Node distintos dirigidos e 72 Vitest distintos passaram. O arquivo cliente afetado
foi repetido após correções de lint/tipagem; inclui 8 MiB completos e UTF-8 inválido.
SDK real: dois testes positivos, jornada M23 e leitor paginado de livro ativo
simulado, com bloqueio de preparação/foreign, mudança/recriação de raiz/capítulo/
parte. A raiz ativa do teste é criada pela fixture; não prova ativação P1.

Escritores, referências/pins de versões, restauração, coleta, exclusão e conversão
continuam obrigatórios antes da ativação. Chat aplicador também depende do
escritor seguinte. Demais recursos/campos grandes, mídia/personas, autorização/
ativação e host/UI/roundtrip/validate integral seguem em P1/F2-09.
Somente commits locais; CI ignorada e nenhum deploy.
