# W2-F2-01 — Organizar projetos e navegação do estúdio

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F1-06](../fase-01-direcao-e-fundamentos/06-contratos-e-replanejamento.md)
**Áreas propostas:** app/routes, books, universes; propostas adventures e campaigns. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir que a pessoa escolha e retome livros, aventuras e campanhas sem perder o acesso às capacidades atuais.

## Entradas e resultado

Entradas: conta autenticada, projetos atuais e navegação aprovada. Resultado: entrada do estúdio com tipo, estado, último trabalho e ações contextualizadas.

## Escopo e comportamento

- Listar os três tipos respeitando proprietário/permissões, com filtros e paginação definidos.
- Criar aventura/campanha com campos mínimos e universo opcional; livro mantém fluxo manual e assistido existente.
- Preservar URLs antigas, rotas públicas, atos, capas, lore e contagem de palavras.
- Mostrar resultado persistido antes de confirmar criação; falha e retry preservam dados e identificador.

## Passos de execução

- [ ] Definir contratos de listagem/criação e rotas pela interface pública.
- [ ] Implementar serviços e autorização, incluindo criação idempotente.
- [ ] Montar navegação e telas com estados assíncronos completos.
- [ ] Verificar links antigos, retomada e migração apenas dos campos aprovados.

## Critérios de aceite

- [ ] Autor abre livro existente e mestre cria campanha sem ter de criar um livro fictício.
- [ ] Projeto independente funciona sem universo.
- [ ] Conta sem acesso não encontra projeto na lista nem por URL direta.
- [ ] Retentativa não duplica projetos, capas ou débitos de IA.

## Validação

- Componentes: criar, filtrar, vazio, falha e retomar.
- Backend/regras: autoria e idempotência; Chromium: rotas antigas, três temas e 320 px.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Navegação deve integrar evolução já existente sem reescrever wizards paralelos.
- D-01/D-12 e contratos da fase 1 são pré-requisitos.

## Não escopo

Marketplace, novo gerenciador global de estado e migração genérica de todas as features.
