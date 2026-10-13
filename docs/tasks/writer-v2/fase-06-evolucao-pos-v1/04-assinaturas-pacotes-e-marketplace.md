# W2-F6-04 — Explorar assinaturas, bundles e marketplace aberto

**Estado:** Candidata pós-V1; descoberta e implementação não aprovadas.
**Dependências:** [W2-F5-06](../fase-05-validar-e-lancar/06-aceite-e-lancamento.md)
**Áreas propostas:** commerce, creator, catalog e library propostos. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Avaliar expansão de receita e catálogo a partir de custos e atendimento observados na venda avulsa por convidados.

## Entradas e resultado

Entradas: métricas de V1, capacidade operacional e capacidades atuais do provedor. Resultado: estudos separados para assinatura, bundle e cadastro aberto.

## Escopo e comportamento

- Comparar assinatura do estúdio e de criador, deixando direitos e término de acesso claros.
- Definir bundle como conjunto versionado de produtos e comportamento de compra/reembolso parcial.
- Avaliar cadastro aberto com verificação, denúncias, qualidade, fraude e atendimento.
- Modelar economia e capacidade antes de ampliar número de vendedores.

## Passos de execução

- [ ] Medir uso, margem e suporte de venda avulsa.
- [ ] Conferir documentação/preços atuais do provedor.
- [ ] Simular cancelamento, inadimplência, overlap de bundle e suspensão de vendedor.
- [ ] Planejar cada modelo separadamente e solicitar decisão de prioridade.

## Critérios de aceite

- [ ] Nenhuma hipótese de receita é tratada como garantia.
- [ ] Cada modelo tem direitos, reversões, custo e suporte especificados.
- [ ] Cadastro aberto tem processo de segurança/qualidade compatível com operação.
- [ ] A venda avulsa existente mantém integridade durante eventual migração.

## Validação

- Modelagem de cenários com custos reais e simulação sandbox quando autorizada.
- Revisão de contratos comerciais por mudança de modelo.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Assinatura de ferramenta e de conteúdo são produtos distintos.
- Escala de moderação e suporte pode exigir equipe.

## Não escopo

Ativar cobrança recorrente, marketplace aberto ou split novo sem estudo e aprovação.
