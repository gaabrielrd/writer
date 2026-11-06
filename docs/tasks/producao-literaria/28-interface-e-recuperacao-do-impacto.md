# Incremento 28 — interface e recuperação do mapa de impacto

Estado: implementação local com testes preparados, sem execução. Não encerra E1–E5.

## Comportamento implementado

A produção literária ganhou a área **Impacto editorial**, separada do mapa global
existente. O autor seleciona livros e fontes por nomes, com paginação pelos serviços
públicos de planejamento, confere o escopo e confirma o registro em diálogo próprio.
A preparação dos índices antigos do guia exige escolha explícita na seleção.

Abrir o painel apenas lê o journal local. Consultar mapas, fontes, estado ou resultado
original não inicia produção. Um avanço corresponde a um passo servidor; também há
lote explícito de até vinte passos, com pausa após o passo em andamento. O lote não
continua ao reabrir o painel. Não há IA, débito ou aplicação de manuscrito nesse fluxo.

As páginas mostram vínculos, propagação, recursos e notas próprias. Os nomes são
consultados na origem atual autorizada, ficam em RAM e não são apresentados como
nomes históricos capturados. Identidade, versão, associação e revisão literária são
apresentadas separadamente. IDs técnicos ficam em detalhes para distinguir registros.

Resoluções usam a observação nativa do vínculo e CAS da decisão. Justificativa e até
oito evidências separadas ficam no rascunho em RAM, seguindo para o servidor somente
no pedido explícito. O rascunho não é substituído por uma atualização remota. Fechá-lo
exige confirmação; cancelar o mapa avisa sobre o descarte de texto não confirmado.
Notas próprias já salvas continuam consultáveis após perda de acesso a outra fonte.

## Recuperação e concorrência

O journal `writer:literary-impact:<actor>:<book>` tem esquema fechado, limite local,
identidade de sessão e CAS integral sob Web Locks curtos. Nenhum lock atravessa HTTP.
Ele guarda IDs, tokens nativos e hashes de correlação, a intenção original de início,
o pedido de avanço e metadados do pedido de resolução. Nunca guarda os textos da
resolução, rótulos, páginas, provas de aceite, credenciais ou configurações de IA.

O write-ahead termina antes da RPC. Falha de quota ou conflito local impede o envio.
Uma confirmação só limpa a dívida após conferir a origem do recibo e consultar o
estado atual. O resultado histórico do recibo não é adotado como estado atual. Conta,
livro, sessão, revisão local e intenção de cancelamento impedem ACK tardio de apagar
ponteiros. A guarda de sessão também é conferida dentro do lock que consome o ACK.

Reabrir um pedido incerto exige consulta explícita. Resultado desconhecido conserva a
dívida e não reenvia. Repetição usa o mesmo pedido; resolução após reload não reconstrói
texto ausente. O autor pode confirmar o resultado ou encerrar aquele pedido original.

A décima ação `cancelLiteraryImpactOperation` cria um recibo negativo permanente para
um avanço/resolução ainda não observado, ligado à conta, livro, nascimento do controle,
método e hash originais. O retry tardio encontra esse recibo e não aplica. Se já havia
aplicação, retorna o resultado original e não altera o mapa. O encerramento não é
aceito como recibo de cancelamento do mapa inteiro. O setor continua planningApi, com
446 ações no registro local e as mesmas 16 Functions setoriais.

Cancelar o mapa tem intenção monotônica própria, durável antes de HTTP e independente
de produtor em andamento. Invalida o ACK antigo e preserva índices canônicos já
produzidos. Liberação local exige confirmação do cancelamento ou mapa encerrado sem
dívida. `not-found`, conteúdo atual ou mera existência de checkpoint não liberam dados.

## Arquivos e testes preparados

- Modelo `model/impact.ts`, serviço `literaryImpactService.ts`, journal
  `literaryImpactStorage.ts` e coordenador `hooks/useLiteraryImpact.ts`.
- `LiteraryImpactPanel`, `LiteraryImpactScopeFields`, ligação ao painel de produção e
  exportação pública. Controles compartilhados e classes semânticas existentes.
- `literaryImpactLabels.mjs` e extensão do controlador/registro setorial.
- 27 casos de frontend: 10 journal, 9 coordenador, 4 transporte e 4 interface.
- 5 casos adicionais de backend e 1 caso nativo SDK de corrida entre avanço/fence.
- Fixture visual isolada, alias próprio e cenário de teclado, temas e largura de 320 px.

Nenhum teste, typecheck, lint, formatação, build, navegador, cobertura ou validação
foi executado neste incremento. Houve leitura e revisão manual das fontes; os arquivos
novos ainda precisam de formatação e todos os gates finais. A rodada anterior de
5.422 testes/86,24% e Rules incompletas não valida este snapshot.

## Pendências do plano integral

O inventário ainda encerra parcial pela lacuna explícita de origens legadas. A seleção
visual inicial cobre livro, contrato, planos e referências narrativas/lore, sem prometer
um seletor para todos os tipos internos do grafo. A auditoria legada e o inventário
histórico completo permanecem necessários antes de afirmar cobertura completa.

Também seguem abertos a portabilidade editorial `.writer`, a restauração como nova
cópia privada sem grants/execuções herdados, a auditoria dos critérios E1–E4 e os gates
integrais, incluindo cobertura de funções de 90% e Rules completas. São **0/5 etapas
formalmente encerradas**. Nenhum commit, merge de volta, push ou deploy foi realizado.

A principal local e esta worktree foram reconferidas em `16d8af5`. Antes da próxima
rodada final, atualizar a principal remota, incorporar mudanças adicionais preservando
o trabalho e então executar os testes, conforme a instrução do autor.
