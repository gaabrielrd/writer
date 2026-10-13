# W2-F6-05 — Explorar integrações de distribuição e ferramentas de mesa

**Estado:** Candidata pós-V1; descoberta e implementação não aprovadas.
**Dependências:** [W2-F5-06](../fase-05-validar-e-lancar/06-aceite-e-lancamento.md)
**Áreas propostas:** publications, adventures e campaigns propostos; services e functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Avaliar entrega a canais externos e ferramentas de mesa com APIs realmente disponíveis e acesso autorizado.

## Entradas e resultado

Entradas: canais usados por criadores, formatos exportados e documentação oficial atual. Resultado: matriz de integração e plano por conector viável.

## Escopo e comportamento

- Investigar envio a lojas somente onde houver API/contrato permitido; exportação manual continua válida.
- Investigar pacotes/importação para ferramentas de mesa, calendário e comunicação conforme demanda real.
- Definir autenticação, escopos, dados enviados, limites, erros e retry por integração.
- Exigir conferência explícita antes de publicar/enviar conteúdo a terceiros.

## Passos de execução

- [ ] Priorizar canais por evidência de uso.
- [ ] Verificar API, termos, formato, custos e capacidade de sandbox.
- [ ] Prototipar um conector autorizado com material de teste.
- [ ] Documentar contrato, perda de conexão, revogação de token e recuperação.

## Critérios de aceite

- [ ] Capacidade do conector foi verificada, sem inferir API a partir da interface web.
- [ ] Falha externa não perde manuscrito ou duplica publicação.
- [ ] Destino recebe somente edição/material explicitamente escolhido.
- [ ] Alternativa manual e estado de envio ficam claros.

## Validação

- Contrato/sandbox do canal e fixture de formato real.
- Teste de token revogado, timeout e evento repetido.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- APIs podem mudar ou não existir; fonte e data precisam ser revalidadas.
- Mensagens/publicações externas dependem da autorização específica de envio.

## Não escopo

Automação por credencial raspada, envio automático de drafts e integração universal prometida.
