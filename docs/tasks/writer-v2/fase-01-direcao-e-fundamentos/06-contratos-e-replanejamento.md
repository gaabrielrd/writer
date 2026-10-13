# W2-F1-06 — Consolidar contratos, documentação e estimativas

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F1-02](../fase-01-direcao-e-fundamentos/02-modelo-de-dominio.md), [W2-F1-03](../fase-01-direcao-e-fundamentos/03-permissoes-e-privacidade.md), [W2-F1-04](../fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md), [W2-F1-05](../fase-01-direcao-e-fundamentos/05-prototipos-e-pilotos.md)
**Áreas propostas:** documentação, arquitetura, planejamento e validação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Transformar as decisões da fase 1 em um ponto de partida executável, reconciliando o novo escopo com os limites históricos.

## Entradas e resultado

Entradas: decisões e protótipos aprovados. Resultado: PRD/ADRs pertinentes, contratos, estimativas por tarefa e portão de fase registrado.

## Escopo e comportamento

- Consolidar aprovação das regras e atualizar PRD e arquitetura somente no que foi decidido.
- Planejar módulos novos pelas fronteiras públicas; atualizar AGENTS quando uma regra vigente mudar.
- Estimar cada tarefa incluindo migração, testes, documentação, operação e espera externa; confrontar 960 h + 80 h de reserva.
- Definir critérios de portão e linha de base de qualidade sem reduzir cobertura.

## Passos de execução

- [ ] Fechar registro de decisões obrigatórias por incremento.
- [ ] Escrever contratos e ADRs; alinhar documentos vigentes e esta pasta.
- [ ] Estimar tarefas de baixo para cima e ajustar timeline ou propor alterações explícitas.
- [ ] Executar verificações documentais e registrar aprovação do portão da fase 1.

## Critérios de aceite

- [ ] Não há decisão obrigatória aberta para iniciar a fase 2.
- [ ] Comércio e campanhas estão representados no escopo aprovado com regras atribuídas.
- [ ] Soma de estimativas e capacidade explica a timeline, inclusive se ultrapassar 12 meses.
- [ ] Nenhuma mudança de regra é aplicada implicitamente por um documento de proposta.

## Validação

- Revisão cruzada de PRD, ADRs, AGENTS e matriz de cobertura.
- npm run check:docs e checagem de formatação nos documentos; registrar resultado real.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Atualização normativa antes do fechamento pode contradizer o produto vigente; separar proposta e decisão.
- Implementação, commit e implantação não decorrem automaticamente da aprovação de um documento.

## Não escopo

Começar features não aprovadas, reduzir cobertura e converter estimativas em garantia de calendário.
