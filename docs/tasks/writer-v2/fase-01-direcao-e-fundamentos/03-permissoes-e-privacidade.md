# W2-F1-03 — Definir permissões, audiências e privacidade

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F1-02](../fase-01-direcao-e-fundamentos/02-modelo-de-dominio.md)
**Áreas propostas:** auth, lore, books; propostas access, campaigns e publications; functions e regras. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Definir quem pode ver e alterar cada dado, distinguindo dono, revisor, mestre, jogador, comprador, visitante e operador.

## Entradas e resultado

Entradas: entidades e jornadas. Resultado: matriz de leitura/mutação, projeções por audiência e política de convites/revogação.

## Escopo e comportamento

- Separar manuscrito privado, revisão convidada, materiais do jogador, segredo do mestre, amostra e edição paga.
- Definir convite autenticado, aceite, prazo, revogação e privilégio mínimo; papel administrativo vem do servidor.
- Resolver revelações explícitas e progresso de leitor; ocultação visual nunca substitui regra de dados.
- Definir recuperação offline, exclusão de conta, retenção e comportamento após perda de autorização.

## Passos de execução

- [ ] Enumerar recursos, campos e operações por papel.
- [ ] Desenhar projeções de jogador, leitor e comprador com listas de campos permitidos.
- [ ] Escolher regras de convites, spoilers e dados locais (D-03, D-04 e parte de D-09).
- [ ] Criar casos negativos para consultas, URLs, downloads, busca e contexto de IA.

## Critérios de aceite

- [ ] Jogador não recebe segredos em resposta, cache ou contexto de IA.
- [ ] Comprador não lê documentos originais de autor nem dados financeiros de outro comprador.
- [ ] Revogação impede novas leituras e não promete apagar arquivos já baixados.
- [ ] Papéis combinados e convites de conta errada têm comportamento definido.

## Validação

- Matriz com casos permitido/negado para cada papel e operação.
- Revisão de ameaça com URLs diretas, cache, adivinhação de ID e reuso de convite.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Permissões existentes são centradas no proprietário: expansão exige novos contratos, não relaxamento geral.
- Política de exclusão versus retenção comercial depende de W2-F1-04.

## Não escopo

Regras implantadas, e-mail automático de convite e concessão de papéis em contas reais.
