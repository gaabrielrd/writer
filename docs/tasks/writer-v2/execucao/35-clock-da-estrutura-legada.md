# F2-09 P1 M3a — Clock de pertencimento da estrutura legada

**Estado:** contrato dirigido para implementação em 2026-10-21.
**Base:** 96ff5e0, checkout limpo. [P1](31-portabilidade-de-livros.md) continua aberto.
Este marco fecha um requisito de captura; não implementa o backup/restauração completos.

## Problema demonstrado no código atual

As Rules permitem criar/remover capítulos legados sem escrever a raiz do livro.
Atos podem ser criados sem escrever a raiz quando a ordem coincide com actCount.
Logo um capítulo/ato pode surgir ou desaparecer entre páginas sem mudar o token
nativo da raiz. Contagem de palavras igual, sobretudo em capítulo vazio, não resolve.
O serviço UI já atualiza updatedAt da raiz atomicamente em criação, remoção e
organização. A lacuna está no conjunto de escritas ainda permitidas pelo SDK.

Metadados de capítulo também podem mudar sem raiz, mas pertencimento e valor de
documento têm provas distintas: o futuro snapshot deverá conferir a identidade
nativa de cada documento. Este marco não afirma que a raiz sozinha cobre metadados,
personas, controle de progresso ou mídia, nem resolve todos os writers Admin.

## Solução e contrato

- Usar updatedAt já existente, sem novo contador/dependência. Escrita SDK que
  cria capítulo/ato ou remove capítulo com livro ativo exige que a MESMA operação
  atômica avance a data válida da raiz desse livro. Atualização posterior não serve.
- Helper de Rules lê get/getAfter do mesmo books/{bookId}. Próximo updatedAt deve
  passar validStudioDate e ser estritamente maior quando o anterior for válido.
  Raiz legada sem data válida pode receber a data válida da mutação; não inventar
  createdAt nem migrar datas históricas para permitir a operação.
- Alterar a data de outro livro, somente título/contagem da raiz, repetir/reduzir
  data ou criar/remover o filho isoladamente não satisfaz o contrato.
- Preservar gates existentes: dono, vínculo de ato/persona, conteúdo legado,
  exclusão, progress resources e mutações reservadas ao servidor.
- Limpeza de capítulos de livro já marcado deleting conserva a autorização atual,
  sem exigir escrita de raiz por filho: captura de projeto deleting já é bloqueada.
  Criação continua proibida nesse estado. Não ampliar acesso a outro dono/anônimo.
- Metadata update de capítulo continua compatível; futura captura usará readset de
  createTime/updateTime, sem confundir essa leitura com o clock de pertencimento.
- Rules não controlam Admin. Auditar/provar writers de Functions antes de declarar
  snapshot integral. Manutenção Admin e rollout terão que respeitar o mesmo princípio.

## Arquivos e sequência

1. Novo tests/firestore/bookStructureBackup.rules.test.mjs reproduz a lacuna no
   SDK real e prova token nativo com createWorkHistoryService. Rodar antes do fix,
   registrar falhas esperadas, sem converter suite vermelha em entrega.
2. firestore.rules: helper de avanço atômico e gates de criação de ato/capítulo
   e remoção de capítulo ativo. Nenhum src/functions alterado nesta etapa.
3. Provar atomicidade, data igual/retrocesso/raiz errada, capítulo vazio,
   isolamento, legado sem data válida, limpeza deleting e lote de 200 capítulos.
   Confirmar metadado direto permanece permitido e NÃO muda o token da raiz.
4. Rodar novo SDK e famílias afetadas (acts, scenes, workProgress, workHistory,
   publication e studio se o inventário apontar escrita SDK de capítulos/atos).
   Ampliar só diante de falha ou risco comprovado. Emulator compilando Rules é
   obrigatório; teste textual/fixture não comprova o gate.
5. Revisar diff, documentar contratos/resultados e regra em AGENTS após validação,
   registrar entrega interna sem fechar P1. Testes/CI do head ficam separados.
   Produto completo do M2 já teve validate verde; para Rules sem runtime novo,
   priorizar SDK real, sintaxe/lint dos testes, formato/links e diff neste ajuste.
   Validate completo continua no fechamento do grande bloco funcional P1.

## Aceites

- Criação/remoção SDK isolada falha e não altera raiz/filho.
- Operação atômica da UI é aceita e muda o token nativo, mesmo sem novas palavras
  ou alteração de historyRevision.
- Clock válido deve avançar no mesmo livro/operação; nenhum novo campo reservado.
- Criação de ato sem mudança da raiz é recusada, mantendo o fluxo válido existente.
- Lote máximo de seleção (200) continua funcional com uma atualização da raiz.
- Limpeza de projeto deleting e metadata direta conservam o comportamento atual;
  estes casos não são usados como prova de snapshot integral.
- Famílias SDK afetadas verdes, sem enfraquecer gates ou expectativas existentes.
- Sem alteração de conteúdo/autorização dos projetos, deploy, merge ou master.
  Coordenação/drain de clientes antigos é requisito antes de implantar Rules.
- P1 ainda exige schema, captura restante/readset, mídia, revisão, nova cópia,
  remapeamento, recuperação e roundtrip; não contabilizar M3a como tarefa ampla.

## Riscos e limites

Mais getAfter por escrita deve usar o cache das Rules para o mesmo livro;
provar lote real de 200, sem presumir limite pelo nome da API. SDKs antigos que
omitem a raiz serão recusados após rollout; escritores atuais foram localizados
e precisam manter o contrato. Não elevar permissões nem relaxar guardas por uma
fixture antiga sem clock: atualizar a operação positiva para a nova política
somente quando sua intenção continuar válida e demonstrada.

## Resultado dirigido em 2026-10-21

Implementado em Rules e validado com SDK/Native reais. Antes do fix, quatro
operações indevidas foram aceitas (6/10); depois 10/10 verdes. Sete famílias
relacionadas tiveram 59/61 positivos: duas operações antigas isolavam criação de
capítulo. Só essas operações foram convertidas ao batch já usado pela aplicação,
mantendo todas as expectativas. Arquivos alterados finais: 26/26 verdes; cinco
famílias inalteradas: 45 positivos anteriores com as mesmas Rules. Total de 71
cenários distintos positivos, em execuções compostas, sem skip/retry/cancelamento.

Inclui lote 200, token nativo com palavras/histórico iguais, legacy updatedAt
inválido/ausente e createdAt ausente preservado. Metadado direto segue sem mudar
a raiz; readset e writers Admin permanecem pendentes. Sem novo validate completo
local: produto anterior confirmado na CI verde de 96ff5e0 e gate novo comprovado
no SDK. Novo head ainda precisa de checks próprios.
Veja [ADR 0046](../../../decisions/0046-book-backup-membership-clock.md) e
[entrega M3a](../../../entregas/2026-10-21-writer-v2-clock-da-estrutura-legada.md).
