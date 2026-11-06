# Sequência na interface e nos setores de Functions — E4

Incremento sobre a base principal incorporada `1bc6ba8`, na worktree literária isolada.
Acrescenta a interface utilizável e o registro público local do driver dos incrementos
11–13. Não encerra as cinco etapas do plano nem declara publicação em produção.

## Seleção, prévia e consentimento

A área **Sequência de capítulos** de LiteraryProductionPanel consulta capítulos por
páginas e permite selecionar, retirar e ordenar até 25 capítulos por execução. O livro
não tem tamanho fixo. A prévia consulta o escopo nativo: livro, capítulos e sua ordem,
nascimentos, modo salvo e token. A ordem incorreta ou um capítulo sem modo cenas são
recusados pelo servidor, sem criar execução ou debitar créditos.

O autor escolhe orçamento total de aplicações/créditos/passos, fases que podem passar
continuamente e passagem entre os capítulos selecionados. O padrão é aguardar decisão.
A IA é a da plataforma; gerar/analisar não debita créditos, cada aplicação custa um.
Orientação usa zero aplicações/créditos e não autoriza fases automáticas. Supervisionado
mantém decisões por fase/cena. Apenas contínuo oferece autorizações de fases/passagem.

A intenção, incluindo instrução e geração, é capturada antes do await de prévia.
Alterar seleção, orientação ou limites retira a prévia; o modo salvo precisa coincidir.
A prévia apresenta capítulos, limites e permissões antes do botão de consentimento.
Registrar apenas grava/ativa o job. **Avançar sequência até a próxima decisão** é uma
ação separada. A passagem entre capítulos pode exigir autorização e a fronteira de ato
exige escolher uma integração nativa integral aceita. Não se publica pelo registro da
sequência.

## Coordenação e decisões autorais

O avanço usa um nonce e revisão/origem por passo. O loop cliente segue apenas enquanto
o servidor devolve execução ativa, sem parada ou resultado pendente. O driver continua
sendo quem congela e executa uma ação por RPC; o cliente não escolhe fases internas nem
substitui o ledger por soma de respostas. O relatório de ato de um passo incerto não
pode ser trocado no replay.

O ciclo do capítulo é mostrado vinculado ao pai. A UI gerenciada conserva confirmação
da primeira versão manual, aceites de fase e reconciliação, mas oculta registro de
outro ciclo, orçamento independente e avanços próprios. Os painéis nativos vinculados
permitem o aceite explícito da cena e inspeção de análises/evidências. Seus produtores,
controles de modo e seleção de outros jobs não aparecem nesse contexto. A segurança
continua no servidor; ocultar controles não concede nem revoga autorização sozinho.

O pai conserva o checkpoint filho durante pausa/cancelamento para não perder uma
confirmação local em andamento. Edições/pendências locais impedem avanço do conjunto.
Uma resposta tardia do loop é ignorada depois de pausa/cancelamento/troca de conta; o
cancelamento consulta a revisão atual, mas exige a mesma origem observada. Alterações
de limites são uma nova decisão explícita e preservam o consumo real anterior.

## Descoberta e outro dispositivo

A listagem metadata tem paginação inclusive após página filtrada/vazia. Abrir consulta
checkpoint, sem gerar. Se houver busyStep, uma retomada explícita usa seu nonce original.
Com diário local, confere a cópia íntegra. Sem diário, consulta o outcome autorizado e
registra só conta/livro/IDs/método/revisão/hash nativos antes de retomar. Não reconstrói
wire a partir do formulário, índice de capítulo ou prosa atual. Hash ausente/inválido,
outra sequência local e sessão alterada bloqueiam a adoção; não se inventa correlação.

## Registro por setor

O catálogo passa de 422 para **430 ações**, mantendo **16 setores**. O app já usa
FUNCTION_ROUTES para configurar o transporte; nenhuma Function individual foi criada.

| planningApi                  | generationApi                   |
| ---------------------------- | ------------------------------- |
| getLiterarySequenceScope     | advanceLiterarySequence         |
| startLiterarySequence        | resumeLiterarySequenceOperation |
| getLiterarySequence          |                                 |
| getLiterarySequenceOperation |                                 |
| listLiterarySequences        |                                 |
| setLiterarySequenceControl   |                                 |

Somente os dois métodos produtores usam o setor com segredo de geração. Hooks do núcleo,
completeLiterarySequenceChapter e fábricas não são ações públicas. Não há método escolhido
pelo payload, fallback de geração ou acesso SDK ao job. A coleção entra por deny explícito
nas Rules, com inventário de exclusão já existente em sceneJobs. Não há dependência,
índice ou coleção nova neste incremento.

## Provas e fronteira restante

O teste pela interface real usa o cliente, os handlers setoriais reais e os serviços
nativos sobre double transacional. Conclui dois capítulos preparados com três aplicações,
três créditos e dois ciclos, sem dívida local. Outro percurso nativo supervisionado
confere aceite das duas cenas e das fases, com duas aplicações, dois créditos e as
versões preservadas. Ao abrir o checkpoint durante avanço, os frames novos do
coordenador agora atualizam os painéis filhos; modal/aceite pendentes são conservados,
e um frame anterior não regride o contador já confirmado por leitura nativa. O SDK real também percorre as oito ações
no setor correto e recusa hooks/setor incorreto. Browser com backend fictício verifica
prévia, consentimento por Enter, orçamento compartilhado, fronteira autoral, pausa,
retomada, três temas e 320px. Essa prova visual não é um smoke autenticado de produção.

Totais terminais, ressalvas e logs estão no [relatório](validacao-local-2026-11-02.md).
Faltam política tipada de publicação anterior quando escolhida pelo autor, aceites finais
de E1–E4 e impacto/portabilidade editorial de E5. A última cobertura global reprovou
86,23% de funções do frontend < 90%, antes destes incrementos; não foi recalculada aqui.
Nenhuma etapa formalmente encerrada, commit, push, integração de volta ou deploy.
