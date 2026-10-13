# W2-F5-04 — Preparar operação, suporte e atendimento

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F5-03](../fase-05-validar-e-lancar/03-qualidade-integrada.md), [W2-F4-11](../fase-04-publicar-e-comercializar/11-repasses-e-operacao.md)
**Áreas propostas:** documentação operacional e propostas commerce, creator, catalog. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir ao operador atender incidentes comuns sem depender de alteração manual de banco ou acesso indevido.

## Entradas e resultado

Entradas: políticas, painéis e casos simulados. Resultado: runbooks, canal/procedimento de suporte e rotina com responsáveis.

## Escopo e comportamento

- Documentar compra pendente, não entrega, reembolso, disputa, repasse falho, denúncia e material retirado.
- Definir prioridade, prazo de atendimento e disponibilidade realista para operação solo.
- Separar acesso de suporte a metadados de compra do acesso a manuscrito; logs sem conteúdo sensível.
- Definir retenção/exclusão/exportação de dados, conciliação e custo operacional conforme D-09.

## Passos de execução

- [ ] Escrever roteiros com início, diagnóstico, ação permitida e evidência de resolução.
- [ ] Testar painel com casos de livro e aventura.
- [ ] Conferir papéis, logs e referências externas sem segredos.
- [ ] Registrar responsáveis, disponibilidade e processo de atualização das políticas.

## Critérios de aceite

- [ ] Operador resolve incidente de entrega e repasse em ambiente de teste.
- [ ] Cada ação financeira tem confirmação/idempotência e trilha.
- [ ] Atendimento não exige editar manualmente saldo/direito no browser.
- [ ] Políticas exibidas ao comprador/criador coincidem com comportamento implementado.

## Validação

- Exercício operacional de pedido aprovado sem entrega e refund após repasse.
- Revisão de permissões e logs, incluindo conta de suporte sem acesso a drafts.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Prazos prometidos precisam caber na capacidade e nas regras externas escolhidas.
- Chamados reais e comunicações a clientes exigem autorização no contexto de execução.

## Não escopo

SLA 24/7 presumido, envio de mensagens neste planejamento e acesso irrestrito de suporte.
