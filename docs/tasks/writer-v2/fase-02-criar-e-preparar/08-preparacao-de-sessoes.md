# W2-F2-08 — Preparar sessões com pistas e missões

**Estado:** contrato de S1 revisto; implementação iniciando. S2 e S3 planejados,
sem validação funcional desta tarefa. Ver [sessões privadas](../execucao/21-sessoes-privadas-da-campanha.md).
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
e consulta autorizada, S3 pistas/missões/pendências. S1 não conclui os critérios
completos abaixo. Data civil sem horário é suposição inicial registrada no contrato.

- [ ] Definir contratos e referências por sessão.
- [ ] Implementar CRUD, ordem e estados privados.
- [ ] Montar checklist e consulta rápida ao lore.
- [ ] Testar mover itens, referência excluída e retomada de sessão.

## Critérios de aceite

- [ ] Mestre prepara uma sessão com cena, NPC, pista e missão.
- [ ] Concluir missão não publica pista nem altera universo.
- [ ] Mover sessão preserva preparação e anotações.
- [ ] Item indisponível é sinalizado sem impedir consulta aos demais.

## Validação

- Modelo: ordem e transições de estado.
- Componentes/E2E: preparação completa, teclado, tema e celular.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Datas de sessão não autorizam automação de calendário ou notificações.
- Evitar arrays ilimitados e dependência de fichas mecânicas.

## Não escopo

Agendamento externo, combate, turnos, tokens e compartilhamento automático ao marcar item pronto.
