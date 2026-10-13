# W2-F1-01 — Fechar jornadas e limites da primeira versão

**Estado:** Jornadas revisadas; validação local verde. Corpus real e CI pendentes.
**Evidência:** [Execução W2-F1-01](../execucao/01-jornadas-e-escopo.md).
**Dependências:** Nenhuma; tarefa de abertura.
**Áreas propostas:** produto e documentação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Transformar a visão do estúdio em duas jornadas verificáveis, preservando autores e mestres com o mesmo peso e comércio na primeira versão pública.

## Entradas e resultado

Entradas: escolhas da conversa e capacidades atuais. Resultado: requisitos identificados, jornadas do autor, mestre, comprador e operador, com limites explícitos.

## Escopo e comportamento

- Confrontar PRD histórico com EV-01 a EV-08 e separar o que existe do incremento.
- Descrever o caminho de criação até leitura/uso e o caminho de publicação até compra/atendimento.
- Fixar livro, aventura, campanha e universo sem tratar a campanha privada como produto vendável automaticamente.
- Classificar cada ideia em V1, pendente de regra ou candidata posterior; não eliminar jornadas para cumprir prazo.

## Passos de execução

- [ ] Inventariar capacidades e exemplos reais de livro e aventura.
- [x] Escrever jornadas com atores, gatilhos, entradas, saídas e falhas.
- [x] Mapear os requisitos à matriz de cobertura e às demais tarefas.
- [x] Revisar o recorte com o criador do produto e registrar decisões.

Inventário técnico conferido; cenários originais preparados. Conferência de corpus
real autorizado permanece pendente, sem declaração de piloto executado.

## Critérios de aceite

- [x] As duas jornadas incluem criação, revisão, compartilhamento, publicação e consumo.
- [x] A V1 contém arquivos externos e venda de livros e aventuras por convidados.
- [x] Cada requisito tem tarefa responsável e uma demonstração observável.
- [x] Nenhuma hipótese de regra comercial é apresentada como decisão do usuário.

Critérios acima são documentais. Aceite integral ainda depende de validação,
registro Git e CI no PR; funcionalidades futuras não foram entregues.

Validate em 2026-10-13: código 0; 106 arquivos/756 testes frontend,
69 testes scripts, 73 backend, lint/typecheck/build/smoke verdes.
Evidência em [entrega local](../../../entregas/2026-10-13-writer-v2-jornadas.md).

## Validação

- Revisão documental por cenário: conto próprio e aventura adquirida.
- Conferir ausência de contradições com decisões confirmadas e apontar mudanças propostas ao PRD.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Confundir a primeira versão histórica com a V1 pública do ecossistema; usar a nomenclatura do índice.
- Dependência de detalhes comerciais ainda abertos: encaminhar a W2-F1-04.

## Não escopo

Implementação de interface, alteração do PRD vigente antes de aprovação das regras e criação de requisitos comerciais por suposição.
