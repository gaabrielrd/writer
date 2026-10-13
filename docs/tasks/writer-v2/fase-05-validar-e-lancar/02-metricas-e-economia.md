# W2-F5-02 — Medir uso, custo e capacidade operacional

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F5-01](../fase-05-validar-e-lancar/01-onboarding-e-piloto.md)
**Áreas propostas:** proposta analytics; services, functions e operação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Avaliar se criadores voltam ao estúdio, consumidores usam o material e a operação cabe na capacidade disponível.

## Entradas e resultado

Entradas: eventos permitidos, custos de infraestrutura/IA/comércio e tempo de suporte. Resultado: linha de base e indicadores por jornada, com metas D-11.

## Escopo e comportamento

- Medir retorno semanal, projeto que chega à revisão/publicação, continuidade após duas sessões e retomada da leitura.
- Medir conversão amostra/compra, confirmação/entrega, reembolso e tempo de suporte quando houver dados reais.
- Excluir texto, segredo, chaves, dados de cartão e identificação pública involuntária dos eventos.
- Separar usuários de teste, sandbox e tráfego real; mostrar ausência de dados sem inventar taxa de sucesso.

## Passos de execução

- [ ] Definir eventos, consentimento/retenção e agregação mínima.
- [ ] Instrumentar por serviços sem espalhar coleta em componentes.
- [ ] Montar relatório de linha de base e custos observados.
- [ ] Reestimar horas restantes e orçamento operacional.

## Critérios de aceite

- [ ] Indicadores distinguem autores e mestres e não ignoram um dos públicos.
- [ ] Evento repetido/retry não infla compra/entrega.
- [ ] Dashboard sem dados informa insuficiência para conclusão.
- [ ] Custo e suporte entram no orçamento de 20 h/semana e na avaliação comercial.

## Validação

- Contrato de eventos sem dados proibidos e deduplicação.
- Simular funil de teste e conferir denominadores; revisar dados reais somente após piloto controlado.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Metas de retenção precisam de janela/coorte; não extrapolar poucos participantes.
- Dados financeiros e métricas públicas têm permissões diferentes.

## Não escopo

Preço definitivo baseado em dados fictícios, ranking público de escritores e coleta integral de prompts/manuscritos.
