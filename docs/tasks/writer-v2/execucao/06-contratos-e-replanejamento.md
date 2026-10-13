# W2-F1-06 — Consolidação e portão de execução

**Data/base:** 2026-10-13, `3482a63`. **Estado:** consolidação documental revisada; validate local verde, aceite integral pendente.

## Plano e arquivos afetados

1. Reconciliar PRD/README: base vigente e primeira versão pública do ecossistema,
   mantendo autores, mestres, distribuição externa e venda dos dois produtos.
2. Formalizar domínio/acesso como contratos para implementação incremental;
   atualizar arquitetura/ADR sem afirmar que os módulos futuros existem.
3. Atualizar somente regras de trabalho verificáveis no AGENTS e testes documentados.
4. Estimar as 41 tarefas, conferir somas e capacidade; separar espera de trabalho.
5. Revisar portão por incremento, executar validate, registrar evidência e commit.

Arquivos: PRD, architecture, testing, README, AGENTS; ADR 0025; arquitetura/timeline
V2, estimativas JSON, registro de decisões/execução, tarefa F1-06 e READMEs das fases
1–5; registro de entrega após gate verde. ADR 0024 pertence a um trabalho paralelo
no checkout original; o número 0025 evita colisão. CLAUDE aponta corretamente para AGENTS.
Sem código produtivo, migração, credenciais, configuração de conta ou implantação.

## Contratos e aprovação

| Origem                                         | Conteúdo consolidado                                                                                               | Natureza                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Escolhas explícitas do operador                | Públicos iguais, 20 h/semana, convidados, Brasil/BRL, vendedor criador, políticas de compra/reversão               | Decisões de produto/comerciais recebidas                        |
| [Domínio](02-modelo-de-dominio.md)             | IDs/coleções legados, recursos distintos, revisões, idempotência, base congelada/variante inteira, paginação/bytes | Decisões técnicas para a implementação autorizada               |
| [Acesso](03-permissoes-e-privacidade.md)       | Operação/recurso, projeções fechadas, convites verificados, revelação/revogação e arquivos autenticados            | Contratos futuros; regras reais ainda precisam de implementação |
| [Comércio](04-regras-comerciais-e-direitos.md) | Comissão/reversões, edição adquirida, direitos, atendimento e proposta Connect                                     | Modelo técnico condicionado à configuração/capacidade real      |
| [Protótipo](05-prototipos-e-pilotos.md)        | Cinco espaços com livros/aventuras/campanhas no Estúdio                                                            | Organização explicitamente aprovada após preview                |

O objetivo global autoriza implementar e validar sequencialmente as capacidades
aprovadas. Não autoriza inventar preços, assumir contratos Stripe, eliminar controles
de privacidade ou declarar um piloto realizado. Mudanças de escopo continuam explícitas.

## Matriz de decisões e condições

| Decisão                              | Situação para o próximo incremento                                  | Incremento condicionado                                              | Condição de fechamento                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D-01: paginação, tamanho, identidade | 25/50, bytes e compatibilidade definidos                            | F2-01 pode detalhar listagem; F2-05/F2-09 ainda têm limites próprios | Definir cursor/filtros em F2-01; política de snapshots/crescimento em F2-05; mediaTypes/roundtrip em F2-09 |
| D-02: originais/campanhas/cânone     | Tipos distintos e campanha independente definidos                   | F2-01; variantes F2-07                                               | API e regras efetivas por recurso; comparar/aceitar origem em F2-07                                        |
| D-03: convites/papéis                | Originais privados do dono; convite não é autoria                   | Participação/revisão F3-01 a F3-03                                   | Identidade/aceite/revogação reais e testes negativos                                                       |
| D-04: revelação                      | Liberação explícita; projeções separadas                            | Portal/revelação F3-04/F3-05                                         | Provar resposta/cache/arquivo sem segredo com contas diferentes                                            |
| D-05/D-06/D-08: operação comercial   | Escolhas registradas; direct charges candidato                      | F4-04/F4-06 a F4-11 e ativação live                                  | País/configuração/capacidades, contratos, tarifas, reserva/calendário e sandbox Writer comprovados         |
| D-07: compra/acesso                  | Edição, update opcional, parcial/suspensão/integral/perda definidos | F4-01/F4-09/F4-10/F4-12                                              | Contratos efetivos e remediação excepcional por direitos/privacidade                                       |
| D-09: dados/retenção                 | Classificação e notas separadas definidas                           | Histórico F2-05; banco/atendimento comercial                         | Justificar política de histórico/custo; fundamentos/prazos dos dados comerciais reais                      |
| D-10: direitos/SRD                   | Aventura narrativa autoral pode começar sem engine de regras        | Produto distribuível F4-01 a F4-04                                   | Licença/autoria/manifesto por componente e autorização comercial                                           |
| D-11: pilotos                        | Roteiro preparado; participantes/resultados ausentes                | Coleta/aceite humano F1-05, F3-08, F5-01/F5-06                       | Participantes, tratamento das observações, critérios e resultados reais                                    |
| D-12: navegação/plataforma           | Cinco espaços aprovados; PT-BR, web, três temas, 320 px             | F2-01 e operação F5-02                                               | Contratos técnicos de rotas/listagem/criação; custo operacional medido na implementação                    |

Nenhuma dessas condições concede permissão para publicar conteúdo/operar dinheiro
sem o portão pertinente. Pendências de fases posteriores não viram dependência de
compra para uma campanha independente.

## Portão: significado e estado

- **Direção suficiente para planejar F2-01:** sim. Tipos, autoria, criação independente,
  ID/retry, versões, paginação, compatibilidade, UI e navegação estão definidos.
- **Contrato executável F2-01:** ainda deve fixar campos mínimos/tetos, filtros,
  ordenação/cursor entre tipos, rotas e criação persistida. É parte do plano desse incremento.
- **Consolidação F1-06:** artefatos revisados e gates técnicos verdes em `079d4e9`; aceite integral segue pendente.
- **CI/PR:** [PR 21](https://github.com/gaabrielrd/writer/pull/21), [CI](https://github.com/gaabrielrd/writer/actions/runs/38401236217) e [regras](https://github.com/gaabrielrd/writer/actions/runs/38401236138) verdes em `079d4e9`; conferir novamente cada head posterior. Um caso de autocomplete passou após retry, registrado no PR.
- **Aceite integral da fase 1:** não declarado. F1-04/F1-05 conservam condições comerciais/humanas.
- **Ativação pública V2:** não liberada; depende das fases 2–5 completas e seus aceites.

O portão separa a decisão técnica do próximo incremento do aceite integral da fase.
Esta tarefa não remove critérios existentes nem declara as tarefas financeiras/humanas
concluídas. A regra anterior condicionava a implementação seguinte ao portão
integral. Em 2026-10-13, após a pergunta sobre essa sequência, o operador autorizou
explicitamente: **“Implementar o Estúdio; manter as condições humanas e comerciais
pendentes”**. F2-01 pode avançar após seu contrato executável e os gates técnicos;
piloto humano e capacidade comercial continuam obrigatórios nos respectivos
aceites, sem serem presumidos ou removidos. Essa mudança de sequência é explícita
e não constitui aprovação de implantação, operação financeira ou lançamento V2.
O [plano executável F2-01](07-estudio-projetos.md) registra contratos e validações.

## Estimativas e baseline

[Timeline](../timeline.md) e [dados de estimativa](06-estimativas.json) substituem
o orçamento de 12 meses como referência de esforço. São hipóteses não calibradas,
sem horas humanas realizadas. O tempo de agente/comando não é apontamento humano.
Fase 1 já possui artefatos; sua faixa total não pode ser somada integralmente ao
trabalho restante. Reestimar após os primeiros incrementos efetivos da fase 2.

Baseline local `3482a63`: validate verde, 116 arquivos/851 testes frontend, 87 backend,
cobertura 92,84/86,41/91,32/94,93; protótipo 30 percursos Chromium, não produto V2.
Limites vigentes 85% statements/lines, 75% branches, 90% functions não mudam.
É baseline observado da base, não execução dos futuros casos VA/AP nem CI/humano.

## Verificação deste incremento

- JSON: 41 tarefas/IDs únicos, correspondência com o inventário das fases 1–5.
  Somas F1 72/112/184; F2 368/584/936; F3 328/536/880;
  F4 488/816/1376; F5 176/296/496. Futuras 1360/2232/3688 h.
- Capacidade: horizonte calculado 90,93/149,43/247,21 semanas ativas,
  separado de fase 1 restante e espera externa. Sem dupla reserva.
- Revisão independente: sem bloqueador documental; EV-01–08 preservados,
  módulos futuros distintos da base, CI/comércio/humano não aprovados por fixtures.
- `npm ci --prefix functions`: código 0, zero vulnerabilidades; Node 24.21.0/npm
  10.6.0 gerou aviso porque functions declara Node 22, além de dependências deprecated.
- `npm run validate`: código 0; 116 arquivos/851 testes frontend, 69 scripts e
  87 backend; cobertura 92,86/86,43/91,32/94,93. Arquitetura/docs/styleguide/formato/
  lint/tipos/syntax/build/smoke passaram. Avisos preexistentes de chunk e exportDocx.
- AGENTS: dois acréscimos de workflow/evidência, sem declarar dados novos implementados;
  caminho conferido manualmente e CLAUDE coerente. Definição de concluído inalterada.

Registro posterior ao gate: [entrega documental](../../../entregas/2026-10-13-writer-v2-consolidacao.md).
Verificações documentais/formato/diff repetidas após escrever a evidência.
