# Writer V2 — revisão renovada na ativação

## Resultado local parcial

Quando o universo muda antes da criação, pedido antigo é retirado atomicamente
e a revisão atual reaparece. Outro clique explícito é necessário. Se a ativação
já venceu, o mesmo comando confirma o efeito original. Rascunho/manuscrito e
materiais preparados não são descartados nem regravados.

A retirada compartilha operationId/fingerprint originais; preserva intenção
local até recibo e CAS. Erro de rede ou unknown no mesmo checkpoint, sozinhos,
não apagam intenção. Resposta perdida e conta/CAS divergentes mantêm recuperação.

Selo de auditoria é conferido e preservado sob a nova identidade, sem relaxar
igualdade de checkpoint/preparação na revisão. Histórico admite somente a
transição estrita certificada entre selos. Limpeza conclui sem tocar a raiz ativa.

[Plano 142](../tasks/writer-v2/execucao/142-revisao-alterada-na-ativacao.md)
e [ADR 0165](../decisions/0165-retire-stale-book-activation.md).

## Testes dirigidos

Node: 65 casos distintos positivos em seleções, não rodada única de 65.
Primeira rodada activation/callable teve 60/63, 9350.2659 ms; três falharam.
Quatro casos afetados passaram 4/4, 1370.3907 ms, após conferir o selo e corrigir
expectativa da fixture (transação só de leitura não equivale a escrita).
Dois casos de integridade adicionados: 1/2, 676.8273 ms; segundo tinha fixture
sem records ao fornecer db próprio. Composição corrigida, 1/1, 456.4083 ms.

Seis casos novos de servidor: retirada/fingerprint/novo clique, ativação vencedora,
isolamento/entrada, universo que retorna, transição histórica com recusas de
selo/contagens/contexto alterados e selo nativo recriado preservado. Contrato
callable tem um comando novo fechado; APIs internas continuam inacessíveis.

Vitest: 29 casos distintos positivos em seleções (16 sessão, 12 callables e
um UI), sem rodada única. Primeira rodada teve 27/28, 6.39 s. Caso da revisão
renovada revelou dependência do selo; após correção passou 1/1, 1.72 s.
A prova do navegador chegou à ativação, mas revelou recusa dos recibos históricos;
teste de sessão ampliado para mídia/limpeza reproduziu a falha. Corrigida a
transição estrita, caso completo passou 1/1, 2.05 s. UI adicional 1/1, 2.13 s
(12 não selecionados), prova revisão de universo alterada e segundo clique.

Sessão também cobre resposta perdida da retirada/restart sem outra retirada,
pedido original idêntico, transporte sem retirada automática, conta inválida,
CAS concorrente e confirmação histórica. Falhas iniciais não contam como sucesso.

## Firestore real isolado

Um caso SDK com três ordens: retirada primeiro, ativação primeiro e chamadas
concorrentes, todas positivas. Duração do caso 189525.1357 ms; runner total
190454.8052 ms, zero skipped. Emulador verificado 1.22.0 loopback, projeto demo.
Cada par devolve o mesmo recibo; documento/job e recibo têm nascimento/update
atômicos; nova revisão e ativação explícita funcionam após retirada. Dono lê raiz
ativa, outro não lê; SDK não grava recibo e outra conta não usa o comando.
Replay após excluir raiz não a recria. Logs PERMISSION_DENIED são recusas esperadas.

## Chromium com armazenamento nativo

Oito verificações positivas no roteiro m54-retire-ui, com React/serviços reais,
OPFS/IndexedDB/Web Locks/WebCrypto e HTTP local de chave. Banco em memória;
identidade/callable e abertura final simulados. Origem real da fixture é marcada
deleting antes da primeira ativação, produzindo o erro definitivo do servidor.

Revisão inicial para explicitamente; retirada renova checkpoint e mostra universo
indisponível sem criar raiz. Segundo clique cria cópia sem vínculo. Respostas de
start/append/ativação perdidas e três reinícios confirmam pedidos originais;
finalização conclui com chave revogada e raiz preservada. 15818 bytes, 393 pedidos
de chave, 1313 RPC locais; não medem produção.

Foco/Escape, retorno ao botão, armadilha de Tab, contraste principal e ausência de
overflow a 360 px conferidos. Captura m54-renewed-review-360 revisada visualmente.
Primeira execução tinha seletor errado no QA; corrigido. Segunda revelou a falha
real de limpeza descrita acima; terceira passou integralmente. Artefatos/perfil
fora do Git, sem manuscrito real nem credenciais.

## Checks e limites

Typecheck, formato/lint dos arquivos, syntax de 297 módulos Functions,
arquitetura, links de docs e diff passaram. Revisão do diff sem bloqueador no
escopo; nenhuma alteração alheia foi incluída.
Sem alteração visual, novo schema no navegador, namespace, dependência ou Rules.
Novo callable exige rollout coordenado Functions/cliente. Sem implantação real,
CI, push, PR, merge ou subagentes. Validate global de P1 ainda não executado.
Inventários gerais, certificação/migração v1 e rollout seguem pendentes.
P1/F2-09/V2 e demais fases/gates continuam abertos.
