# W2-F2-08 — Preparar sessões com pistas e missões

**Estado:** S1 concluído tecnicamente em `c95253a`; CI e regras verdes.
S2A concluído tecnicamente em `d9b7988`, com CI e regras verdes; S2B validado localmente com CI pendente; S3 e tarefa completa ainda abertos. Ver [sessões privadas](../execucao/21-sessoes-privadas-da-campanha.md)
e [entrega](../../../entregas/2026-10-18-writer-v2-sessoes-privadas.md).
Referências de lore: [S2A](../execucao/22-referencias-de-lore-da-sessao.md) e
[entrega](../../../entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md).
Cenas/blocos: [S2B validado localmente](../execucao/23-cenas-completas-na-preparacao-da-sessao.md).
**Dependências:** [W2-F2-07](../fase-02-criar-e-preparar/07-campanhas-e-variacoes.md), [W2-F2-03](../fase-02-criar-e-preparar/03-arcos-e-cronologia-basica.md)
**Áreas propostas:** lore; proposta campaigns. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Reunir o que o mestre precisa preparar para uma sessão e localizar as pendências que passarão à próxima.

## Entradas e resultado

Entradas: campanha, título/data opcional, cenas, NPCs, locais, missões e pistas. Resultado: plano de sessão privado com ordem e estados.

## Escopo e comportamento

- Criar/reordenar sessões e vincular material da aventura sem modificar o original.
- Registrar pista, condição de descoberta em texto, destinatário e pendência; não inferir revelação automática.
- Missões têm estado aprovado e consequências possíveis; conclusão é ação explícita.
- Planejamento continua acessível em texto/lista e não exige mapa ou rolagem de dado.

## Passos de execução

Execução vertical: S1 estrutura privada (CRUD, data, estado e ordem), S2 referências
(S2A lore e S2B cenas/blocos) e consulta autorizada, S3 pistas/missões/pendências. S1 não conclui os critérios
completos abaixo. Data civil sem horário é suposição inicial registrada no contrato.

- [x] Definir contratos e referências de lore/cenas por sessão (S1/S2).
- [x] Implementar CRUD, ordem e estados privados (S1 validado localmente).
- [ ] Montar checklist e consulta rápida ao lore.
- [ ] Testar mover itens, referência excluída e retomada de sessão.

## Critérios de aceite

- [ ] Mestre prepara uma sessão com cena, NPC, pista e missão.
- [ ] Concluir missão não publica pista nem altera universo.
- [x] Mover sessão preserva preparação e anotações próprias (S1).
- [x] Referência de lore/cena indisponível é sinalizada sem impedir as demais (S2); itens S3 seguem abertos.

## Validação

- Modelo: ordem e transições de estado.
- Componentes/E2E: preparação completa, teclado, tema e celular.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Datas de sessão não autorizam automação de calendário ou notificações.
- Evitar arrays ilimitados e dependência de fichas mecânicas.

## Não escopo

Agendamento externo, combate, turnos, tokens e compartilhamento automático ao marcar item pronto.
