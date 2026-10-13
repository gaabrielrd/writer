# W2-F5-03 — Validar qualidade, segurança e regressões integradas

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F5-01](../fase-05-validar-e-lancar/01-onboarding-e-piloto.md), [W2-F5-02](../fase-05-validar-e-lancar/02-metricas-e-economia.md)
**Áreas propostas:** todas as features afetadas, tests, e2e, functions e regras. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Provar o resultado integrado das jornadas e impedir regressões de salvamento, privacidade, créditos e acesso comercial.

## Entradas e resultado

Entradas: versão candidata e matriz de cenários. Resultado: evidências automatizadas/visuais, falhas classificadas e correções.

## Escopo e comportamento

- Executar regressão de livros legados, importação, atos, editor, lore global, personas e IA com aceite atômico.
- Cobrir revisor, jogador, comprador, vendedor e operador em consultas/URLs/arquivos/cache.
- Cobrir webhooks duplicados/fora de ordem, entrega incerta, estorno e repasse.
- Validar três temas, teclado, leitores de tela nos fluxos críticos, desktop/mobile/320 px e navegadores acordados em D-12.

## Passos de execução

- [ ] Atualizar testes de comportamento e fixtures por jornada.
- [ ] Instalar dependências functions e executar validação/regras reais.
- [ ] Executar Chromium e inspeção de EPUB/pacotes/diagramas pertinentes.
- [ ] Corrigir falhas e revisar diff sem reduzir cobertura.

## Critérios de aceite

- [ ] npm run validate e CI passam no SHA candidato; limites de cobertura preservados.
- [ ] Casos negativos mostram ausência de dados privados na rede e armazenamento autorizado.
- [ ] Arquivos reais foram abertos/inspecionados, não só tiveram existência conferida.
- [ ] Aceite humano e testes automatizados estão identificados separadamente.

## Validação

- npm run validate, npm run test:rules e npm run test:e2e conforme configuração vigente.
- Cenários e evidências detalhados em validacao-e-aceite.md.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Mocks de pagamento não demonstram integração com provedor; incluir sandbox real.
- Falhas globais ou limitações de ambiente devem ser registradas com escopo e sem aceitação fictícia.

## Não escopo

Reduzir cobertura, regenerar imagens sem revisar, promover teste sintético a aceite humano e declarar CI sem consulta.
