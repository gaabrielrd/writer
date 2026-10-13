# W2-F3-07 — Registrar consequências e propor mudanças de cânone

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-06](../fase-03-compartilhar-e-usar/06-painel-do-mestre.md), [W2-F2-07](../fase-02-criar-e-preparar/07-campanhas-e-variacoes.md)
**Áreas propostas:** universes, lore; proposta campaigns; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Preservar a história particular de cada mesa e permitir ao dono do universo incorporar mudanças deliberadamente.

## Entradas e resultado

Entradas: acontecimentos da sessão, entidade/origem e proposta de alteração. Resultado: diário da campanha e proposta comparável, aceita/rejeitada pelo proprietário.

## Escopo e comportamento

- Registrar resumo, missão alterada, pistas descobertas e mudanças de personagem/local no escopo da campanha.
- Separar diário privado do resumo autorizado aos jogadores.
- Promover somente conteúdo autorizado para universo próprio ou cujo dono possa receber a proposta; mostrar versão de base e alcance.
- Conflito exige nova revisão; aceite de cânone respeita mutação global, revogação e autoria existentes.

## Passos de execução

- [ ] Implementar acontecimentos e variantes por sessão.
- [ ] Montar fechamento com revisão de notas e escolha do resumo.
- [ ] Implementar proposta e comparação de promoção de cânone.
- [ ] Verificar aceite, rejeição, conflito e revogação de publicação afetada.

## Critérios de aceite

- [ ] Resultado de uma mesa não altera outra campanha automaticamente.
- [ ] Jogador vê somente resumo aprovado.
- [ ] Somente dono autorizado aceita alteração global e vê alcance da mudança.
- [ ] Aceite repetido não duplica entidade nem contorna versão de privacidade.

## Validação

- Backend/regras: duas campanhas, propriedade e revisão concorrente.
- E2E: encerrar sessão, compartilhar resumo e aceitar/rejeitar proposta.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Comprador de aventura de terceiro não ganha direito de modificar seu universo.
- D-02 define como mesclar variante; decisão manual precede mutação.

## Não escopo

Inferir consequências por IA, promover anotações automaticamente e acessar notas de outras mesas.
