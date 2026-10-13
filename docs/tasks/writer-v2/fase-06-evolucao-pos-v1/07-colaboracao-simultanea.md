# W2-F6-07 — Explorar colaboração simultânea

**Estado:** Candidata pós-V1; descoberta e implementação não aprovadas.
**Dependências:** [W2-F5-06](../fase-05-validar-e-lancar/06-aceite-e-lancamento.md)
**Áreas propostas:** editor, editorial e access propostos; arquitetura. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Determinar se coautoria simultânea justifica uma mudança de persistência além da revisão assíncrona da V1.

## Entradas e resultado

Entradas: demanda observada e limitações do autosave transacional. Resultado: decisão de viabilidade e plano de arquitetura se aprovado.

## Escopo e comportamento

- Distinguir coautoria de comentário/sugestão e definir quais recursos podem ser editados juntos.
- Avaliar conflito, presença, cursores, histórico e perda de autorização.
- Comparar técnicas existentes e dependências com custo demonstrado.
- Preservar recibos de IA, versões e autorização atômica de alterações.

## Passos de execução

- [ ] Identificar tarefa colaborativa que revisão assíncrona não resolve.
- [ ] Prototipar conflito com dois autores e queda de conexão.
- [ ] Avaliar compatibilidade com editor/histórico/IA atuais.
- [ ] Produzir ADR e plano de migração antes de implementação.

## Critérios de aceite

- [ ] Há necessidade demonstrada e escopo de coautoria aprovado.
- [ ] Protótipo não perde texto na reconexão.
- [ ] Usuário removido não continua editando por sessão antiga.
- [ ] Modelo de IA/crédito tem regra para concorrência explicitamente definida.

## Validação

- Simulação de múltiplos clientes e operações simultâneas.
- Revisão de consistência de persistência e acesso.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Pode exigir reestruturação importante; não inserir como extensão trivial de convite.
- Presença não concede autoridade editorial.

## Não escopo

Adicionar CRDT sem avaliação e anunciar edição ao vivo na primeira versão.
