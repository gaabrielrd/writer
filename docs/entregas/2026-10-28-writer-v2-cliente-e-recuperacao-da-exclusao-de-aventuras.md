# Writer V2 — cliente e recuperação da exclusão de aventuras

## Estado e funcionalidades

Núcleo cliente local do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 3628888. A [ADR 0228](../decisions/0228-adventure-deletion-client-recovery.md)
registra fronteiras e recuperação. Ainda sem composição na interface do produto.

- Feature folha própria, com tipos/verificadores, adaptador de seis comandos,
  coordenador por conta/aventura e diário metadata por Web Locks/localStorage.
- Fonte, lookup, catálogo, progresso, recibos e cancelamento validados antes da adoção.
- Pedido reservado antes do envio, retry com mesmo ID/token/checkpoint e CAS integral.
- Recuperação de início/avanço após ACK perdido e recarga, sem avanço automático.
- Cancelamento do pedido inicial não desfaz job confirmado.
- Conta trocada, resposta incompatível, quota/entrada ilegível e alteração por
  outra aba preservam o pedido; leitura remota funciona sem reserva de escrita.
- Conflito só aposenta etapa após erro definitivo e consulta atual do mesmo job.
- Progresso permite reabrir fases, com pisos e conclusão estáveis.
- Diário sem título, prosa, perguntas/respostas, arquivo ou chave de recuperação.

## Testes e validações reais

| Rodada                                             | Resultado               |
| -------------------------------------------------- | ----------------------- |
| Contratos/coordenador/transporte/produtor, final   | 49/49 Vitest, 4,62 s    |
| Verificador arquitetural, incluindo fronteira nova | 21/21 Node, 430,4376 ms |

Quatro arquivos Vitest cobrem schemas fechados, tokens/UID/recibos trocados,
pisos e conclusão, reserva antes de I/O, ACK perdido, reload, conflito, quota,
duas abas, resposta tardia, troca de conta e diário ilegível. O ciclo integrado
consome as factories reais de chat/exclusão sobre o double transacional,
percorrendo início perdido, novo cliente e remoção terminal da raiz/corpos,
com perguntas próprias legíveis. Não é execução de SDK/HTTP ou Auth/App Check.

Os dois casos do adaptador Firebase conferem seis nomes de comandos, região,
timeout e payload original; erros são propagados sem retry implícito.
O SDK Firebase está mockado nesse arquivo; nenhum endpoint novo foi chamado.

Cobertura dirigida do núcleo de contratos/coordenador/recuperação:
93,24% statements, 90,71% branches, 100% functions e 98,49% lines.
As fixtures ficam fora desse recorte de produção; limites existentes preservados.
O relatório não substitui cobertura integral do aplicativo.
Logs/HTML fora do Git: m119-client.log, m119-client-integrated.log,
m119-coverage.log, m119-production-coverage.log, m119-final-client.log e m119-types.log.
O primeiro typecheck apontou estreitamento de unknown/import não usado e
anotações de this nas spies de Storage; foram corrigidos sem relaxar os guards.

Typecheck integral, ESLint dos 13 arquivos de código/teste, arquitetura,
documentação e sincronização das 11 skills passaram. Formato e diff conferidos.
Revisão final sem bloqueador para o núcleo ainda não composto. A ponte de teste
com módulos JavaScript usa tipos explícitos e respostas unknown; os mocks
retornam Promises sem desabilitar regras de lint. Sem mudança em Functions,
Rules, dependências ou UI. Logs finais: m119-final-client.log e m119-final-types.log.

## Pendências

Não há hook/tela, composição em adventures/Estúdio, endpoints novos exportados,
transporte autenticado testado nem recuperação em navegador real. A lista de
retomada/diálogo e testes nos três temas/mobile/teclado continuam no plano 199.
Política final de perguntas permanece pendente e nenhuma pergunta foi removida.

Sem nova rodada standalone de Functions/SDK/Rules/build/browser ou validate integral. O fechamento
integral do bloco 198–199 continua previsto. Não conclui 199/P2/P3/D/F2-09/V2;
macro 8/35 e gates humanos/comerciais inalterados.
Somente commit local; sem CI, push, PR, merge ou deploy.
