# Writer V2 — Estúdio, livros e campanhas

**Data do planejamento:** 2026-10-12. **Responsável:** Gabriel, trabalhando sozinho, 20 horas por semana.
**Estado:** execução iniciada na fase 1; funcionalidades futuras ainda não implementadas.
**Autorização deste trabalho:** implementar, planejar e validar cada tarefa em sequência, fase a fase.
O [registro de execução](execucao/README.md) distingue documento, validação local e aceite final.

## Visão e decisões confirmadas

O Writer evolui para um estúdio de criação, publicação e distribuição de livros e aventuras,
com gestão de campanhas de D&D. Autores e mestres têm o mesmo peso desde o início.
A primeira versão pública do ecossistema inclui publicação no Writer, arquivos para outros canais
e venda direta por criadores convidados, com catálogo acompanhado pelo operador.
Campanhas incluem preparar e conduzir sessões, compartilhar materiais e registrar consequências.

Nesta pasta, **V1 do ecossistema** significa a primeira versão pública da evolução Writer V2;
não significa a versão histórica do Writer descrita no PRD atual.

## Ordem de execução

1. [Fase 1 — Direção e fundamentos](fase-01-direcao-e-fundamentos/README.md).
2. [Fase 2 — Criar e preparar](fase-02-criar-e-preparar/README.md).
3. [Fase 3 — Compartilhar e usar](fase-03-compartilhar-e-usar/README.md).
4. [Fase 4 — Publicar e comercializar](fase-04-publicar-e-comercializar/README.md).
5. [Fase 5 — Validar e lançar](fase-05-validar-e-lancar/README.md).
6. [Fase 6 — Candidatos posteriores](fase-06-evolucao-pos-v1/README.md), fora da V1 e sem compromisso de implementação.

Trabalhar uma fase de cada vez e um incremento por vez dentro dela.
Cada fase tem tarefas próprias, dependências e um portão de saída.
Estudos comerciais começam na fase 1; a integração de venda entra na fase 4.
Os pilotos anteriores à fase 5 são fechados e não representam uma V1 pública incompleta.

## Documentos de apoio

- [Escopo e jornadas](escopo-e-jornadas.md): requisitos e limites.
- [Decisões e riscos](decisoes-e-riscos.md): o que está confirmado, proposto e pendente.
- [Arquitetura proposta](arquitetura-proposta.md): domínios, dados e acessos.
- [Timeline e capacidade](timeline.md): orçamento, marcos e revisão de prazos.
- [Validação e aceite](validacao-e-aceite.md): cenários e evidências exigidas.
- [Matriz de cobertura](matriz-de-cobertura.md): ligação do escopo às tarefas.
- [Validação do planejamento](validacao-do-planejamento.md): auditoria documental e resultados reais dos checks.

## Como usar uma tarefa

Os IDs `W2-Fn-nn` são estáveis. Ler dependências, contrato transversal e critérios antes de implementar.
Propostas de produto estão identificadas; uma tarefa de decisão produz uma escolha explícita,
não autoriza adivinhar preços, políticas ou acesso a conteúdo privado.
Ao terminar, registrar evidência e atualizar o estado da tarefa sem confundir planejamento com execução.

Esta pasta propõe substituir limites do PRD histórico sobre campanhas e comércio.
O [PRD atual](../../prd.md), a [arquitetura vigente](../../architecture.md) e o
[AGENTS.md](../../../AGENTS.md) continuam descrevendo o sistema existente.
A tarefa W2-F1-06 consolida as decisões aprovadas nesses documentos antes da implementação correspondente.

A definição de concluído continua em [processo de desenvolvimento](../../development-process.md).
