# P1 / M38c9 — Lore lógico nos contextos do editor

## Objetivo

Integrar etapa 4 do plano 80 ao contexto de chat de cenas. Termos e fichas
devem vir da representação lógica inline/v1/v2/criação, preservando seleção,
precedência local/global, limites de apresentação e autorização por nascimento.
Não transformar stubs em campos vazios ou impor o tamanho da ficha ao contexto.

## Constatações

readEditorChatLorePage projeta campos diretamente da cabeça; snapshots leem
details do documento. Payloads não carregam esses campos. Reutilizar a leitura
integral da análise imporia custo de relações/detalhes não utilizados e montagem
inteira na RAM, mesmo para procurar nomes.

## Sequência

A. Leitor seletivo certificado para contexto:

1. Observadores opcionais nos parsers puros de campo/base, sem mudar formatos
   de checkpoint, gramática ou validação. Observação não certifica bytes.
2. Coletor só em RAM: textos integrais ou prefixos, aliases integrais ou primeiros
   itens/prefixos, contagem exata e flags de truncamento; literais, ausências,
   vazios, duplicados, BOM e Unicode preservados. Sem prosa no estado do parser.
3. Leitor interno autoriza o livro e usa abertura C1 na mesma transação. Base
   v1 é validada/hasheada em fluxo, sem montar detalhes não pedidos. v2 lê somente
   campos escolhidos efetivos e ignora os substituídos na coleta da base.
   Relações e campos adicionais não pedidos não são baixados.
4. Cada parte conserva Merkle/nascimento/escopo e SHA integral do corpo consumido,
   UTF8/JSON/domínio; prefixo não dispensa a certificação do corpo utilizado.
   Verificar privacidade efetiva quando declarada na cabeça.
5. Orçamentos de I/O e retenção explícitos fornecidos pelo consumidor; reservar
   custo antes de ler partes e impedir crescimento por arrays de strings vazias.
   Não são limites de autoria/C1/backup. Nenhum dado parcial sai em erro.

B. Integração do chat: 6. Página local lê nomes/apelidos/categoria lógicos para o matcher. Snapshot
aplica os limites atuais (nome/apelido 200, 20 aliases, resumo 140,
detalhes 2000), com contagens e truncamento corretos. 7. Proveniência de histórico deve conferir origem/cabeça sem baixar corpos
de texto ou mudar o significado dos tokens de nascimento. Universos e
aventuras conservam seus contratos. Metadata e textos só em memória/contexto
privado já previsto, sem fonte visual alimentando writers. 8. Budget agregado por avanço do contexto, erro explícito de complexidade e
nenhuma escrita/cobrança em falha; não publicar página parcial ou contexto
pronto de dados divergentes.

## Arquivos e validação

Marco A: bookLoreFieldValidation/BaseIndex com observação opcional, novos
bookLoreTextProjection e bookLoreContextRead, testes puros/Node/SDK. Marco B:
editorChatContextRead/Context e respectivos testes/regressões de contextos,
proveniência e chamadas. Documentar ADR/AGENTS/arquitetura/testes/evidência,
com commit local coerente por marco.

Cobrir inline/v1/v2/criação, texto >8MiB/128 partes, substituições/remoções,
aliases extensos/duplicados/vazios, UTF8/escapes/BOM/fronteiras, corrupção,
budget antes do download, memória retida limitada, origem/chave/header/parte
recriados, tombstone/autorização e rollback. Gramática/checkpoints antigos
permanecem idênticos quando observador não é fornecido.

Nenhuma nova RPC, Rule ou dependência. Somente commits locais, sem CI/push/
PR/merge/deploy. Validate integral no fechamento de P1.
O marco A sozinho não integra o chat nem conclui este plano. Todos os demais
consumidores, inventário de exclusão, backup/restauração, drain/rollout e fases
3–5/gates humanos/comerciais continuam no objetivo.

## Estado de execução — 2026-10-25

Marco A implementado e validado: 156 Node distintos (123 regressões, 33 novos)
e quatro SDK no emulador verificado. Lint/sintaxe/formato/checks locais positivos.
[ADR 0147](../../../decisions/0147-selective-book-lore-context-projection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-projecao-seletiva-do-lore.md).
Marco B não implementado: editorChatContextRead/Context continuam legados.
Próximo passo é integrá-los sem carregar corpo para reautorizar histórico ou
mudar matcher/precedência/tokens. Este plano e P1 permanecem abertos.
