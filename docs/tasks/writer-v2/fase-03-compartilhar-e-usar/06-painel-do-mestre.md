# W2-F3-06 — Conduzir sessões no painel do mestre

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-04](../fase-03-compartilhar-e-usar/04-portal-e-materiais-dos-jogadores.md), [W2-F3-05](../fase-03-compartilhar-e-usar/05-revelacoes-e-spoilers.md)
**Áreas propostas:** lore; proposta campaigns. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Reunir plano, consulta de lore e registro rápido para o mestre conduzir a sessão sem perder informação.

## Entradas e resultado

Entradas: sessão preparada e campanha ativa. Resultado: painel com cenas, NPCs, pistas, missões, notas e ações de revelação.

## Escopo e comportamento

- Iniciar, pausar/retomar e encerrar sessão com estados aprovados; data é informativa, sem calendário externo.
- Consultar plano e fichas sem deslocar/cancelar nota pendente.
- Registrar ocorrência rápida ligada a cena/entidade e distinguir nota privada de resumo compartilhável.
- Permitir navegação por teclado, salvar feedback e fallback de conectividade definido; revelação exige servidor.

## Passos de execução

- [ ] Compor painel a partir de APIs públicas existentes.
- [ ] Integrar edição de notas, consulta e ações de material.
- [ ] Proteger saída com alterações pendentes.
- [ ] Verificar retomada e finalização com falha/retry.

## Critérios de aceite

- [ ] Mestre consulta NPC, registra nota e revela pista numa mesma sessão.
- [ ] Nota rápida permanece privada até escolha explícita.
- [ ] Encerrar não perde anotações nem revela todo o plano.
- [ ] Tela funciona sem mapa, dado ou ficha mecânica.

## Validação

- Componentes/E2E: sessão completa, teclado e nota pendente.
- Integração: queda de conexão, retry e edição em outra aba conforme contrato.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Painel denso precisa preservar geometria/rolagem em celular e 320 px.
- Persistência local exige escopo por conta e política de recuperação.

## Não escopo

Iniciativa, cálculo de dano, rolagem de dados, tokens e mesa virtual.
