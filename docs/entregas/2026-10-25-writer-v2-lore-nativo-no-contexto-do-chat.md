# Writer V2 — lore nativo no contexto do chat

- Data: 2026-10-25.
- Marco: P1 / M38c9 B.
- Plano: [128](../tasks/writer-v2/execucao/128-projecao-logica-do-lore-para-contextos.md).
- Decisão: [ADR 0148](../decisions/0148-logical-lore-in-editor-chat-context.md).

## Resultado

Chat de cenas de livros reconhece fichas inline, v1, v2 e criadas pelo produtor
nativo, com nomes/aliases lógicos e texto correto no snapshot privado. Mantém
precedência local/global e limites de apresentação, com contagens de omissão.
Detalhes v2 de fichas não selecionadas não são baixados na busca de termos.

Respostas antigas continuam congeladas quando a origem é editada. Alteração
marca freshness desatualizado. Exclusão/recriação/revogação oculta a resposta,
preserva pergunta própria e bloqueia leitura do corpo derivado. Somente a mesma
origem reautorizada pode voltar a permitir a resposta. Revalidação não busca
corpos de lore, nem muda tokens de nascimento para revisão atual.

## Critérios verificados

- [x] Página local por 50 mantém matcher, precedência, cursores e contagem.
- [x] Inline/v1/v2/criação real fornecem campos lógicos ao contexto.
- [x] Nome/apelido 200, aliases 20, resumo 140 e detalhes 2000 sem dividir Unicode.
- [x] Ausências visuais, duplicados, omissões e flags de truncamento corretos.
- [x] Budget por avanço, compartilhado pela página e snapshots finais.
- [x] Complexidade/corrupção falham atomicamente, sem novo contexto/recibo/débito.
- [x] Histórico e snapshot reautorizam a origem antes do corpo derivado.
- [x] Raiz/cabeça/reserva/tombstone próprios e nascimento preservados.
- [x] Universos, aventuras, geração e aplicação mantêm regressões.
- [ ] Demais consumidores e restante de P1/V2: continuam fora deste marco.

## Arquivos

EditorChatContextRead integra projeção local, budget e autorização histórica
metadata; EditorChatContext compartilha budget. Fixtures de contexto/conversa
aceitam banco nativo de teste. Novo editorChatBookLore.test.mjs e três cenários
SDK acrescidos ao arquivo de contexto cobrem as origens. Documentação registra
a decisão e limitações; nenhuma Rule/RPC/DTO/dependência mudou.

## Testes e resultados reais

**99/99 Node** em sete arquivos: 16 novos casos do lore no chat e 83 regressões
de contexto/leitura/histórico/matcher/geração/aplicação. Sem skipped/cancelled.
Cobrem as quatro representações, fonte >8 MiB/128 partes, aliases omitidos e
Unicode, detalhes alheios não baixados, corrupção após prefixo, alias vazio
extenso/budget e rollback. Conversa real do serviço lê resposta sintética com
shape aprovado: freshness, pergunta própria, tombstone, restauração da mesma
origem e cabeça recriada. Não houve chamada real de provedor pago.

**Sete cenários SDK distintos positivos**, Admin real no Firestore 1.22.0
verificado/demo/loopback. Quatro regressões de alvo/autorização/paginação/
personas/cleanup e três novos: contexto grande, v2 seletivo/histórico/tombstone e
criação pelo produtor real/prova original. Fonte e créditos permanecem.

Primeira execução SDK: cinco positivos e dois falharam no setup. Fixture v2
incluía relations entre fields, formato fechado inválido. A fixture antiga de
paginação tentava 52 creates num único batch cliente e excedia o orçamento de
consultas das Rules para tombstones/reservas por documento. Corrigidos somente
os setups: descritor permitido e catálogo histórico semeado com Admin; vencedor/
relógio/retirada ainda passam pelo cliente/Rules. Os dois cenários foram repetidos
isoladamente: 2/2 positivos, sem skipped. Nenhuma Rule ou comportamento foi
enfraquecido. Não é uma execução única com sete positivos.

Primeiro Node tinha incremento de relógio legado ausente gerando NaN na fixture;
corrigido para baseline zero. Lint removeu import sem uso. Execução final 99/99 e
lint dos seis arquivos de código positivos. Sintaxe, formato/docs/arquitetura/diff
conferidos no fechamento. Logs externos:
writer-v2-portability-qa/m38c9b-node-final.tap, m38c9b-sdk.tap,
m38c9b-sdk-retake.tap e respectivos runners/logs de emulador. Logs iniciais mantidos.

## Limitações e continuidade

Budget explícito por avanço: 32 MiB/512 partes/900000 bytes de retenção lógica.
Não mede heap real nem limita autoria/backup. v1 monolítico exige I/O integral;
base percorrida na página e snapshot consome orçamento em ambas as leituras.
Nenhuma interface/tipo cliente mudou; build/browser/typecheck não repetidos.
Validate/cobertura global ficam para fechamento de P1. CI/remoto/deploy não usados.
Backend implementado localmente ainda depende de entrega futura para uso remoto.

Marco B encerra somente plano 128 e o consumidor de chat desta etapa 4.
Referências/cenas/planejamento/publicação/captura de campanhas, inventário dos
namespaces/escritores, backup/restauração, drain/rollout/validate de P1 e fases
3–5/gates humanos/comerciais seguem no objetivo. Auditoria real das chaves
históricas permanece operação pendente. Master e servidor preservados.
Somente commit local.
