# W2-F1-04 — Fechar regras comerciais, licenças e provedor

**Estado:** Em execução; contrato documental e pesquisa registrados. Connect/capacidades, ensaio comercial e validação operacional continuam pendentes.
**Evidência:** [Contrato e consulta de sandbox](../execucao/04-regras-comerciais-e-direitos.md), [cálculos](../execucao/04-cenarios-monetarios.json), [manifesto](../execucao/04-produto-de-referencia.md).
**Dependências:** [W2-F1-01](../fase-01-direcao-e-fundamentos/01-jornadas-e-escopo.md), [W2-F1-02](../fase-01-direcao-e-fundamentos/02-modelo-de-dominio.md)
**Áreas propostas:** produto, operação; propostas commerce, creator e publications. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Escolher um arranjo de venda viável para criadores convidados, com responsabilidade e direitos explícitos antes da integração.

## Entradas e resultado

Entradas: livros e aventuras vendáveis, capacidade de operação e fontes oficiais. Resultado: decisões D-05 a D-10 e contrato comercial testável.

## Escopo e comportamento

- Escolher região, moeda, meios de pagamento, partes da venda, provedor e habilitação de vendedores; verificar disponibilidade atual.
- Definir preço, comissão, custos, repasse, conciliação, reembolso, disputa e atendimento; créditos de IA não são dinheiro da compra.
- Definir licença de leitura/uso em mesa, edição adquirida, atualizações, retirada de catálogo e impacto em campanhas criadas.
- Conferir direitos de texto/imagens/importações, edição de D&D e atribuição quando usar SRD; importar PDF não autoriza venda.

## Passos de execução

- [ ] Comparar opções de provedor usando documentação oficial e ambiente de testes.
- [x] Calcular exemplos de pedido aprovado, reembolsado, contestado e repassado.
- [ ] Registrar políticas de produtos, conteúdo e atendimento, com validação adequada ao contexto escolhido.
- [ ] Aprovar escolhas e critérios de falha/retirada antes de contratos comerciais.

Escolhas do operador registradas: taxas/reversões do criador; comissão devolvida proporcionalmente;
disputa aberta suspende acesso, parcial mantém e integral/perda revoga; notas próprias preservadas.
Plataforma no Brasil confirmada pelo operador. Pesquisa e inspeção somente leitura ocorreram;
o pagamento de demonstração Stripe não é teste Writer. Critérios acima permanecem abertos
até as condições comerciais reais; cálculos são exemplos fictícios, não tarifas aprovadas.

## Critérios de aceite

- [ ] Cada valor e responsabilidade tem origem e regra aprovada; nenhuma taxa foi inventada pelo planejamento.
- [ ] O provedor escolhido suporta o modelo de múltiplos criadores na região escolhida.
- [ ] A política trata retirada/revogação, acessos já concedidos e cópias baixadas.
- [ ] Um produto de referência tem licença, autoria e origem de cada material conferidas.

## Validação

- Simulação de valores com moedas/unidades mínimas e reversões.
- Checklist documental de capacidades do provedor e direitos, com links e data de verificação.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Onboarding, habilitação e regras externas podem alongar o prazo; medir antes da fase 4.
- Sem políticas aprovadas, tarefas financeiras permanecem condicionadas, mas o plano continua documentado.

## Não escopo

Cobrar clientes, definir preços definitivos por conta própria, aconselhamento tributário e replicar conteúdo protegido de livros oficiais.
