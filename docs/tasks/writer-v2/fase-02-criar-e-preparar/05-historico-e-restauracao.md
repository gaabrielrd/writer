# W2-F2-05 — Guardar e restaurar versões do trabalho

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas propostas:** editor, books; proposta adventures; functions e armazenamento. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Dar recuperação explícita e comparação suficiente para editar com confiança, mantendo o salvamento transacional existente.

## Entradas e resultado

Entradas: conteúdo salvo, revisão e ação Criar versão/Restaurar. Resultado: versões privadas imutáveis e restauração como nova revisão.

## Escopo e comportamento

- Guardar versões no escopo definido (capítulo/cena) com política de retenção D-01/D-09.
- Comparar versão selecionada com atual e confirmar restauração; não substituir texto pendente silenciosamente.
- Serializar com autosave/aceite de IA e verificar a revisão corrente antes de restaurar.
- Versão privada não é edição pública, recibo de IA ou backup comercial; restauração não cobra nem estorna créditos por si.

## Passos de execução

- [ ] Definir formato, limites e migração de documentos sem histórico.
- [ ] Implementar criação/listagem/restauração transacional e idempotente.
- [ ] Integrar comparação e guard de texto pendente.
- [ ] Cobrir conflitos, cancelamento e recuperação após resposta incerta.

## Critérios de aceite

- [ ] Restaurar preserva uma cópia recuperável do estado anterior.
- [ ] Resposta repetida não cria restaurações/debitos duplicados.
- [ ] Mudança concorrente solicita revisão em vez de sobrescrever.
- [ ] Histórico não é legível por visitante, jogador ou comprador.

## Validação

- Backend/regras: autoria, revisão e repetição.
- Editor: texto não salvo, autosave, IA pendente, desfazer e cancelamento.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Armazenamento cresce rápido; retenção e paginação devem ser decididas antes.
- Não confundir recibo de aceite de IA com snapshot de conteúdo.

## Não escopo

CRDT, merge automático de dois textos e desfazer financeiro ao restaurar.
