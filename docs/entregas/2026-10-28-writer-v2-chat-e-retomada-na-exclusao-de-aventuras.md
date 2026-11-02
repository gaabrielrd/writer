# Writer V2 — chat e retomada na exclusão de aventuras

## Estado e funcionalidades

Incremento interno parcial do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 4a9e46e. A [ADR 0226](../decisions/0226-adventure-deletion-chat-and-activity.md)
registra os contratos. Não entrega ainda a exclusão completa ao usuário.

- Remoção de corpos derivados de contextos e turnos em páginas de dez,
  com máscaras de metadata e escopo por UID/projeto/nascimento.
- Órfãos prontos são atribuídos somente por recibos e hashes originais,
  sem reconstrução de pais ou leitura de prosa.
- Órfão temporário sem origem verificável recusa e conserva a página.
- Perguntas próprias e recibos históricos preservados; leitura da pergunta
  continua disponível, com resposta nula após revogação.
- Verificação de controles e reabertura de varredura para corpo reaparecido.
- Retomada canônica retirada com revisão da conta/checkpoint/recibo atômicos,
  preservando accessedAt e outros projetos.
- Quatro índices declarados localmente, sem implantação.

## Testes e validações reais

| Rodada                                            | Resultado                |
| ------------------------------------------------- | ------------------------ |
| Controles/atividade, limpeza e quiescência, final | 56/56 Node, 2091,5089 ms |
| SDK/Rules local após corrigir fixture             | 3/3, 37555,5574 ms       |

Os 56 são 24 cenários novos de controles/atividade, 22 de limpeza e dez de
quiescência; rodadas anteriores se sobrepõem e não são cenários adicionais.
Os três SDK são testes com serviços reais e Admin SDK contra Firestore demo
local, dados sintéticos e Rules carregadas. Não provam Auth/App Check,
índices implantados, serviço publicado ou comportamento com dados reais.

Os casos incluem 10/10/3/0 no double e 10/3/0 nativo, pedidos concorrentes iguais,
hash/nascimento de órfãos, revisão inválida, outras conversas criadas após o
início, recusa de metadata alterada, rollback de corpo/job/recibo, ACK perdido
e pergunta legível sem reidratar respostas. O SDK confere updateTime original
dos dados preservados e revisão/recibo com o mesmo commit nativo.

Na primeira rodada SDK, dois cenários passaram e um falhou: a fixture de livro
retornava um WriteResult síncrono no callback de runTransaction, enquanto o SDK
exige Promise. O callback foi corrigido; a rodada seguinte passou integralmente.
A guarda de revisão inválida recebeu depois teste Node específico.

Logs fora do Git: m117-sdk.log, m117-sdk-fixed.log e m117-final-node.log.
Sintaxe dos 405 módulos Functions, ESLint dos nove arquivos de código/teste,
arquitetura, documentação e sincronização das 11 skills passaram. Formato do
conjunto alterado e diff conferidos. Revisão final sem bloqueador para este
incremento interno; os passos públicos/terminais permanecem indisponíveis.
Processos de teste/emulador encerrados; servidor Vite preservado para teste local.

## Limites e pendências

O job chega a verify em deleting, mantendo reserva permanente e raiz marcada.
Verificação terminal/remoção da raiz, transporte autenticado, cliente, interface
e retomada após reload ainda faltam. Perguntas são preservadas enquanto a
política final da exclusão permanece pendente. Não foi apagado projeto real.

Nenhum novo teste frontend/build/browser ou validate integral nesta etapa.
A suíte completa fica para fechar o bloco 198–exclusão, conforme orientação.
Não fecha 199/P2/P3/D/F2-09 nem V2; macro 8/35 e gates humanos/comerciais seguem
inalterados. Somente commit local; sem CI, push, PR, merge ou deploy.
