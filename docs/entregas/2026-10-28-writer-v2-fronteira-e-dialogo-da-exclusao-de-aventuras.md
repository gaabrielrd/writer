# Writer V2 — fronteira e diálogo da exclusão de aventuras

## Estado e funcionalidades

Preparação local do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 6e5027c. A [ADR 0229](../decisions/0229-adventure-deletion-boundary-and-dialog.md)
registra os contratos. O diálogo é real, mas permanece fora da tela principal.

- Dispatcher fechado confere UID e contexto App Check antes de construir serviço.
  Opções onCall/headers privados preparados, ainda sem export em index.
- Hook/diálogo com confirmação explícita, fonte atual, progresso, pausa,
  fechamento, recuperação e resolução do início/conflito.
- Nova sessão por conta/alvo/abertura recusa fonte ou resposta atrasada.
- Confirmação e recuperação comparam a pendência capturada, preservando outra aba.
- Reserva segura é exigida também no replay: pendência pode nunca ter sido enviada.
- Recibo válido notifica revogação antes de CAS/quota local; resposta forjada não.
- Consulta do próprio diário não provoca repetição infinita por notificações.
- Kit/tokens existentes e uma prévia visual isolada reutilizam os componentes reais.

## Testes e resultados reais

| Rodada                                            | Resultado               |
| ------------------------------------------------- | ----------------------- |
| Feature cliente/hook/diálogo e produtor integrado | 67/67 Vitest, 5,77 s    |
| Fronteira privada e percurso do motor real        | 12/12 Node, 400,9193 ms |
| Chromium: três jornadas × seis variantes          | 18/18, 35,6 s           |

Os 67 incluem os 49 anteriores, três cenários novos do cliente e 15 de diálogo.
Rodadas se sobrepõem e não são cenários adicionais. Casos novos cobrem conta
trocada, fonte de abertura anterior, pausa após etapa, Escape/foco, quota após
prova, pedido aninhado alterado, conflito, início nunca recebido, origem ausente
e consulta conhecida sem ciclo de auto-notificação.

Cobertura dirigida da feature: 92,94% statements, 91,15% branches,
97,03% functions e 97,95% lines, mantendo os limites. Fixtures fora do recorte.
Não substitui cobertura/validate integral do aplicativo.

Os Node usam contexto callable sintético e as factories reais sobre double;
comprovam seleção/guard antes da construção, não assinatura de JWT/App Check.
O SDK instalado confirma que request.app contém appId; a verificação de token
continua sendo do Firebase quando o binding onCall for integrado.

As jornadas Chromium usam AuthProvider/ThemeProvider/componentes/journal reais
com auth e transporte fictícios. Rede externa bloqueada e CSP isolada.
Web Locks/localStorage, reload, Tab/Escape, foco, tamanho e ausência de overflow
foram conferidos em claro/escuro/sépia, 1440×1000 e 390×844.
Doze capturas foram geradas; desktop escuro e celular sépia foram inspecionados.
Nenhuma conta/projeto real foi excluído; o Vite de teste usou porta 4317 e encerrou.

Fontes duráveis: e2e/visual/adventure-deletion-dialog.visual.ts e prévia dedicada,
com alias somente no vite.visual.config.ts. Artefatos fora do Git:
m120-ui.log, m120-coverage.log, m120-final-ui.log, m120-browser.log, m120-visual-results.json,
m120-visual-results/ e m120-final-types.log.

Primeiros checks estáticos apontaram opção exact inexistente em getByRole,
assertion desnecessária no mock de auth e callback de método sem vínculo explícito.
Foram ajustados, com tipo nullable da fonte na fixture; sem desabilitar regras.
Typecheck integral, ESLint dos 13 arquivos de código/teste, sintaxe dos 407
módulos Functions, styleguide, arquitetura, documentação e 11 skills passaram.
Formato e diff conferidos. Revisão sem bloqueador para dispatcher/diálogo ainda
isolados, com integração explicitamente pendente. Nenhuma dependência, Rule ou
export de index do servidor foi alterado; Vite 5173 preservado.

## Pendências

Sem catálogo de retomada, composição em adventures/Estúdio ou export dos seis
endpoints no servidor. Falta conectar a porta existente de mídia e comprovar o
binding HTTP/Auth/App Check, além do ciclo rico restaurado integrado.

Política final de perguntas permanece pendente; o motor preserva perguntas.
Sem novo SDK/Rules ou validate integral. Teste visual do componente isolado
não comprova integração da rota, leitor de tela ou zoom físico de 200%.
Não conclui 199/P2/P3/D/F2-09/V2; macro 8/35 e gates humanos/comerciais inalterados.
Somente commit local; sem CI, push, PR, merge ou deploy.
