# Writer V2 — disponibilidade de personas restauradas de aventuras

Data: 2026-10-27. Base: 13325c8.
[Plano 178](../tasks/writer-v2/execucao/178-disponibilidade-de-personas-restauradas-de-aventuras.md)
e [ADR 0200](../decisions/0200-adventure-restored-persona-availability.md).

## Incremento implementado

Origem v2 própria de aventura com target discriminado, restoreId e jobToken.
Livro conserva origem v1/bookId, bytes e contratos existentes, sem migração.
Parser e tipos são compartilhados, fechados e clonam target. O helper de projectId
evita usar uma aventura como livro no serviço da biblioteca.

A prova de lote escolhe namespace e ações próprios de aventura, exige metadados/
recibos nativos originais e só libera estado active. Listagem, inscrição e edição
da biblioteca usam o lote correto; revogação/erro oculta apenas seus perfis.
Observadores são deduplicados/removidos e callbacks antigos ignorados. Edição
preserva origem nativa, revisão e createdAt; saída e backup omitem a marca.

Rules incluem v2, preservando bloqueios de edição/vínculo antes da ativação,
origem imutável e lotes controlados pelo servidor. Leituras privadas do dono
mantêm sua permissão atual; disponibilidade não decorre da leitura direta.

## Testes executados

- 27 Node positivos em 334,105 ms: 12 novos de aventura e 15 de disponibilidade
  existente. Incluem parser/clones/namespace/ações/conta/geração, estados, ABA/
  recriação de batch/primeiro/último recibo e revisão posterior do perfil.
- Leitores reais de IA e backup de aventura recusam preparing e prova recriada;
  aceitam lote nativo ativo e preservam perfil/revisão sem origem operacional.
- 15 Node da instalação de livros positivos em 3.904,699 ms, cobrindo snapshots
  únicos, replay/CAS/rollback/retry, zero perfis, namespace ocupado e cleanup.
- 13 Vitest da biblioteca positivos em 1,29 s totais/13 ms de testes: sete
  existentes e seis novos, incluindo lotes mistos, estados, observadores e edição.
  Após ajustes nos mocks, somente os casos afetados foram repetidos: um em
  1,26 s e dois em 1,25 s, positivos; não somar repetições como casos novos.
- 12 SDK reais positivos em uma chamada de 7.872,832 ms no Firestore 1.22.0 demo
  local: oito novos de aventura e quatro de livro existentes. Verificam edição/
  vínculo apenas com lote ativo, origem imutável, conta/geração/target, recriação
  nativa, compatibilidade manual e todas as posições de atributos relevantes.
  O runner encerrou a JVM dedicada no finally.

## Correções e revisão

A primeira chamada SDK falhou com limite real de 1.000 expressões na edição
válida. Não é considerada suite verde. A correção calcula tamanho dos atributos
uma vez, mantendo oito posições obrigatórias e oito opcionais, todas validadas
como mapas com valor inteiro de 0 a 100. SDK aceita 8/16 e recusa 7/17, fração,
texto, null e valores fora da faixa nos índices 0/7/8/15.

A revisão automática rejeitou a tentativa de remover uma checagem duplicada de
origem por risco de aceitar dados forjados. Essa remoção não foi aplicada.
A alternativa mantém as checagens de origem e reduz somente o custo de avaliar
atributos. SDK também confirma que persona manual não pode ganhar marcador null
ou forjado, sem bloquear sua edição normal.

Typecheck inicialmente apontou uma propriedade extra inline no fixture de
metadado forjado; input agora é variável, como o teste existente de livro.
O lint apontou mocks async desnecessários e acesso a chamadas sem tipo; mocks
passaram a usar valores resolvidos e callback tipado. Sem relaxar as regras.
Typecheck passou. Formatação, ESLint dos módulos/testes alterados, sintaxe Node,
documentação, arquitetura, styleguide e diff --check passaram. Declarações .d.mts
foram verificadas por TypeScript/formatação; não estão no escopo do ESLint.
Revisão final preservou as condições de origem e atributos; sem achado bloqueador.
AGENTS.md registra o discriminante e namespaces; CLAUDE.md permanece coerente.
Escopo/LF/tamanho/marcadores de segredos conferidos antes do commit local com
hooks normais.

## Limites e continuação

Sem novo validate integral: o de 176 é base anterior; o fechamento do novo bloco
permanece obrigatório conforme o operador. Nenhuma dependência ou limite de
cobertura alterado; sem CI/push/PR/merge/deploy/agentes.

Não instala perfis nem ativa lotes ou aventuras. Fixtures ativos são harnesses;
instalador retomável, dedupe/journals/cleanup e integração com ativação real são
obrigatórios no próximo incremento. Mídia, agregados/audit/ativação e recuperação
cifrada/UI/roundtrip de P2, P3/D/F2-09 e fases seguintes permanecem abertos.
Gates humanos/comerciais e macro 8/35 (22,9% de tarefas) não mudam.
