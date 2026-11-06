# ADR 0296 — cópias editáveis do contrato e dos planos

- Estado: implementação local interna; testes preparados sem execução.
- Data: 2026-11-04.
- Complementa as ADRs [0294](0294-editorial-restore-inventory-and-projection.md) e
  [0295](0295-editorial-restore-materialization.md).

## Contexto

Preservar bytes do histórico não torna contrato e planos editáveis. Seus formatos
nativos exigem revisão própria e fontes autorizadas atuais; referências portáteis
não contêm tokens. Expandir todos os IDs também pode ultrapassar o limite de um
contrato válido. Os recursos novos precisam pertencer ao inventário de cancelamento.

## Decisão

Preparar somente corrente explicitamente declarado e incluído. Gravar corrente,
primeira versão e pendência de revisão juntos, usando provas nativas, CAS e recibo.
Manter os IDs locais das decisões no escopo do novo contrato e conservar seu grafo.
Reduzir política explícita a orientação; manter ausência de política para não
expandir um contrato já no limite. Nenhum consentimento/job antigo é executável.

Criar planos correntes como propostas sem referências ativas. Preservar referências
remapeadas em revisão privada, sem inventar sourceToken ou adotar fonte externa.
Manter estados e datas originais como história; revisão/datas da cópia nativa são novas.

Ampliar os endereços fechados e a limpeza do inventário interno v15 antes dos
writes. Exigir namespaces vazios, confirmar o nascimento do trio na unidade
seguinte e incorporar as cópias ao ledger existente. Não expor o preparador por
callable público e não ativar a raiz com esse certificado parcial.

## Consequências

O preparo usa formatos compatíveis com os escritores atuais, mas a jornada após
ativação ainda precisa ser integrada e demonstrada. Revisão de vínculos, censo
físico, flags/clocks da raiz, ativação, histórico, recaptura e exclusão seguem
pendentes. A reexportação precisa diferenciar corrente novo e corrente histórico.
Ver [incremento 48](../tasks/producao-literaria/48-contrato-e-planos-restaurados.md).
