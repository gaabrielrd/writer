# W2-F6-02 — Explorar revisão de consistência com evidências de IA

**Estado:** Candidata pós-V1; descoberta e implementação não aprovadas.
**Dependências:** [W2-F5-06](../fase-05-validar-e-lancar/06-aceite-e-lancamento.md)
**Áreas propostas:** ai-assistant, editor, lore e universes; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Avaliar análise que aponta contradições com referências verificáveis, mantendo autoria e custo transparentes.

## Entradas e resultado

Entradas: capítulos/cenas autorizados e cânone escolhido. Resultado: achados com trecho, origem, versão e opções de revisão.

## Escopo e comportamento

- Distinguir fato, inferência e possível conflito; incluir evidências navegáveis.
- Analisar consistência de personagem, cronologia, regra de mundo e missão conforme caso aprovado.
- Definir custo/limites, BYOK/plataforma e invalidação por alteração de origem.
- Aplicar correção somente por decisão explícita, com revisão e protocolo atômico existente.

## Passos de execução

- [ ] Montar corpus consentido com conflitos verdadeiros e falsos.
- [ ] Comparar formatos de evidência e relevância com autores/mestres.
- [ ] Definir critérios de precisão e custo antes de implementar.
- [ ] Planejar incremento com geração, revisão, aceite e testes adversariais.

## Critérios de aceite

- [ ] Achado aponta trechos existentes e a revisão utilizada.
- [ ] Sem evidência suficiente, análise declara incerteza em vez de inventar fato.
- [ ] Usuário mantém texto/cânone até confirmar alteração.
- [ ] Política de cobrança da nova ação é aprovada antes do código.

## Validação

- Avaliação por corpus anotado, incluindo falso positivo e contexto desatualizado.
- Teste de autorização do contexto e cancelamento de resposta antiga.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Contexto longo e custo de sugestões descartadas precisam de limites próprios.
- Nenhum novo preço é aprovado por este planejamento.

## Não escopo

Correção automática, treinamento com manuscrito sem consentimento e promoção automática de lore por IA.
