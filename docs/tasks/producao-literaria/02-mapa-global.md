# Mapa global do livro

Incremento do item 2.3 do plano integral, com separação dos tempos descrita no item 2.4. A etapa 2 continua aberta: auditorias globais, reconciliação e os demais critérios têm fechamento próprio.

## Comportamento implementado

A área Produção literária oferece o mapa em três visões:

- Ordem de leitura: usa `groupChapters` da interface pública de livros, com atos e capítulos nativos. Unidades sem ato disponível e atos ainda sem capítulos continuam visíveis; tratamentos de ato e intenções de livro/série preservam seus campos. Links usam os IDs existentes do editor.
- Cronologia real: usa os eventos existentes e seu slot ativo de rank. Datas são texto livre; não são ordenadas lexicalmente nem confundidas com as pistas temporais mostradas ao leitor. Fichas só entram no evento ao qual estão vinculadas explicitamente como assunto. Momentos declarados sem esse vínculo continuam consultáveis, sem posição cronológica inventada.
- Trajetória: reúne fichas de conhecimento que descrevem o personagem ou entidade como assunto. Permite ordenar pelos capítulos na leitura ou pelos eventos da cronologia, conservando posições textuais sem inventar uma data. Referências usadas somente como fonte não demonstram presença nem conhecimento. Homônimos permanecem separados por identidade e origem; aliases de escopo da mesma identidade são normalizados.

Fichas conservam tipo, situação, revisão e campos canônicos. Um requisito, hipótese ou intenção aprovada não comprova acontecimento no manuscrito. Referências alteradas ou indisponíveis aparecem para conferência; uma identidade recriada não herda vínculos antigos.

## Leitura e segurança

`readLiteraryBookMapPage`, em `planningApi`, consulta atos, capítulos, eventos e planejamentos. Cada página reautoriza o dono e recusa projeto removido/em exclusão. Não retorna texto do manuscrito, não chama IA, não escreve documentos, não gera recibos e não debita créditos.

A paginação exige a mesma prova dos metadados nativos da raiz, do universo vinculado e do controle da ordem cronológica. A prova inclui nascimento e versão nativos, não depende somente de timestamps fornecidos pelo autor. Uma conferência final repete essa autorização/prova antes de encerrar a leitura. Fontes de cada ficha passam pelo leitor canônico de referências, incluindo o leitor nativo de lore e a checagem de identidade.

Essa prova é uma barreira conservadora para uma visualização de estrutura e intenções; não certifica leitura do manuscrito, não concede autorização para outras operações e não substitui verificações próprias das auditorias e aplicações.

A interface solicita páginas de até 25 itens de estrutura ou três fichas, limitadas pelo esquema existente de 140 kB cada. O cliente lê até 32 páginas por ciclo e permite continuar do mesmo cursor e prova. Esse limite não limita o tamanho do livro. Pausa termina após a página pendente. O checkpoint desta consulta fica na memória da página; recarregar inicia leitura nova, sem reativar trabalhos de IA.

Mudança de conta/livro ou desmontagem invalida respostas tardias. Falha de acesso ou de prova retira o mapa derivado da tela. Rascunhos de outras áreas ficam montados e preservados. O mapa não acrescenta coleções, permissões de SDK, índices ou dependências.

## Verificação

Verificações dirigidas aprovadas: 34 testes de frontend, 23 de backend, seis jornadas Chromium nos três temas e 320 px, build/smoke, lint e regras arquiteturais/de estilo. Resultados e logs ficam no [relatório de validação](validacao-local-2026-11-02.md). A rodada completa de 5.279 testes é anterior a este incremento; não é usada como aprovação do código novo. O gate integral permanece aberto pela cobertura de funções e pelos requisitos funcionais restantes do plano.
