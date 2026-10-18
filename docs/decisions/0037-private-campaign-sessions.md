# ADR 0037 — Sessões privadas e evolução da limpeza de campanhas

**Estado:** implementada em `c95253a`; CI e regras verdes.
**Contrato:** [F2-08 S1](../tasks/writer-v2/execucao/21-sessoes-privadas-da-campanha.md).

## Contexto

A preparação de uma sessão precisa sobreviver a mudanças de ordem, conflitos e
respostas perdidas. Ela é texto autoral da mesa e não depende de permissão atual
sobre a aventura original. A campanha já possui exclusão permanente C4 com jobs
persistidos cujo checkpoint depende de um inventário fechado de coleções.

## Decisão

Sessões usam documentos próprios da campanha, controle da coleção e cinco
callables no servidor: listar, consultar, salvar, mover e excluir. O SDK direto
permanece fechado. Autorização confere dono, encarnação precisa da campanha e
reserva permanente antes de qualquer corpo ou replay. Não buscar material da
aventura para preencher texto próprio.

O formulário tem título, preparação privada em texto simples, data civil opcional
e estado planned/running/completed. Data sem horário é suposição inicial registrada
no plano, ainda sem confirmação humana. Alterar estado não conduz sessão, revela
conteúdo ou publica. Referências, pistas e missões pertencem aos próximos recortes.

Cada edição compara a revisão observada. A ordem é independente da data; mover
troca duas ordens e incrementa as duas revisões e o controle da coleção na mesma
transação. Consulta do vizinho é limitada. A listagem contém somente metadados,
cursor vinculado ao dono/encarnação/revisão e tamanho máximo; não devolve resumo.
Excluir grava tombstone sem texto e impede recriação por replay.

Recibos opacos reconhecem o evento original mesmo quando uma edição posterior
mudou o recurso. Sua revisão histórica é distinta da revisão atual no envelope.
Corpo só é devolvido se revisão e hash ainda correspondem ao evento confirmado;
caso contrário session null confirma o pedido sem autorizar adoção de outro texto.
Revisão igual com hash diferente é corrupção e falha fechada.

O cliente reserva um pedido integral por UID/campanha sob Web Locks, confirma a
persistência antes do RPC e compara o snapshot inteiro ao limpar. HTTP fica fora
do lock. Pedido incerto só é repetido por ação explícita. Lista, foco e movimento
não rebaseiam formulário alterado. Respostas atrasadas não reabrem o diálogo.
Uma prova C4 própria permite encerramento explícito apenas do controle congelado.
O coordenador de campaigns compõe closers públicos; campaign-sessions permanece
folha de auth/shared, assim como campaign-deletions.

Novos jobs C4 passam a cleanupVersion 2 interna, incluindo sessions/sessionState
e sanitização seletiva de campaignSessionOperations. Jobs sem versão mantêm o
inventário v1 e continuam retomáveis. Os limites por etapa permanecem. Registros
terminais não carregam versão de limpeza, cursores, inventário ou texto.
Versão desconhecida falha fechada; nunca reinterpretar um índice v1 como v2.

## Consequências e habilitação

- Estrutura privada S1 não conclui a preparação completa de F2-08.
- Movimentar uma sessão também pode causar conflito no formulário do vizinho;
  preservar texto e exigir reconciliação explícita é preferível a adotar revisão
  de metadados com corpo antigo.
- Recibos permanecem enquanto a campanha existe; C4 v2 os reduz a marcadores
  mínimos e remove os novos documentos privados, preservando outras mesas.
- A reserva permanente impede criar sessões em jobs v1 já iniciados. Isso não
  protege contra um start C4 antigo ainda ativo depois de habilitar sessões.
- É condição operacional implantar leitores/escritores/guardas, início e avanço
  C4, regras e índices conjuntamente e drenar versões antigas antes de habilitar
  a interface. Manutenção Admin precisa respeitar o mesmo protocolo. Testes
  locais não comprovam essa drenagem, implantação ou operação em produção.
- Sem dependência nova, calendário externo, notificações, IA ou compartilhamento.

## Verificação

Domínio e SDK real cobrem CAS, replay histórico, ordem concorrente, cursores,
datas gregorianas, tombstones, controle perdido e limpeza v1/v2. Componentes e
navegador verificam preservação de rascunho, retorno de foco, recuperação após
reload e encerramento explícito por C4. Resultados reais estão registrados na
[entrega S1](../entregas/2026-10-18-writer-v2-sessoes-privadas.md): validate com
1.860 frontend, 82 scripts e 369 Functions; cinco famílias SDK e 12 combinações
nativas validadas. Fixtures não comprovam autorização real ou implantação.
