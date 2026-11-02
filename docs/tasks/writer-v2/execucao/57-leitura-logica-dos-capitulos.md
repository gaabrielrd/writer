# P1 / M24 — Leitura lógica dos capítulos

## Objetivo

Integrar a representação M23 aos leitores de capítulos em uso, mantendo o texto
exato e impedindo leitura de preparação, livro alheio ou corpo fora do ponteiro
atual. P1 e ativação continuam abertos até escritores/histórico/coleta integrados.

## Requisitos e solução

- Extrair leitura autenticada do cabeçalho e de uma parte de M23, reutilizada pelo
  leitor integral e API paginada. Nenhum fallback vazio para content null.
- readLegacyChapterText exige livro próprio ativo, capítulo legado ativo e
  bodyId esperado, índice e token observado a partir da primeira parte.
  Retorna uma parte binária base64 de até 64 KiB e manifesto, sem caminho privado.
  Token fixa UID/livro/capítulo/nascimento e atualização nativos do capítulo e
  nascimento do corpo. Cada página reautoriza projeto e ponteiro.
- Cliente monta bytes com limites, valida todos os metadados, token, hash total,
  UTF-8/BOM e conta atual antes/depois da resposta. Reconfere a primeira parte ao
  terminar para detectar revogação/mudança durante a captura.
- bookService resolve corpo externo antes de devolver capítulo com conteúdo;
  listagem metadata-only pode omitir texto, mas não muda o descriptor armazenado
  nem inventa conteúdo utilizável. Nenhum acesso SDK direto ao corpo.
- Histórico/sourceToken, exportação de estrutura, verificação do ledger e hash de
  análise usam o texto lógico. Backup conserva limites existentes do item JSON;
  não truncar nem aumentar implicitamente a compatibilidade do formato.
- API usa contrato/transporte callable existente, com cache privado. A
  implementação local não autoriza deploy nem prova Auth/App Check produtivos.

## Tarefas e critérios de aceite

1. [x] Helpers de cabeçalho/parte e API somente leitura com autorização por página.
2. [x] Leitura cliente e integração bookService, sem alteração visual.
3. [x] Consumidores servidor de histórico, backup, contagem e hash de análise.
4. [x] Testes dirigidos Node/Vitest/SDK, documentação, revisão e commit local.

## Não escopo e riscos

Escritores de capítulo, criação/restauração de versões por referências, pins,
coleta, exclusão e conversão ainda devem ser integrados antes da ativação.
Chat que aplica texto continua dependendo do escritor seguinte; não declarar a
restauração pronta. Outros recursos/campos grandes/mídia/autorização final/host
e roundtrip continuam em P1.

Suposição: dono de livro privado pode ler seu capítulo ativo; ponteiro atual
confere acesso ao corpo. Chamadas paginadas podem falhar após mudança concorrente,
sem devolver texto parcial ao editor. Livro sem raiz nunca autoriza a leitura.
Não expandir SDK Rules, dependências ou distribuição nesta entrega.
Suite integral apenas no fechamento P1; somente commits locais e CI ignorada.
