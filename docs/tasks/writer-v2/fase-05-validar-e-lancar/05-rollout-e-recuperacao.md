# W2-F5-05 — Preparar rollout, migrações e recuperação

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F5-04](../fase-05-validar-e-lancar/04-operacao-e-suporte.md), [W2-F5-03](../fase-05-validar-e-lancar/03-qualidade-integrada.md)
**Áreas propostas:** deployment, functions, regras, índices, Hosting e operação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Disponibilizar o candidato com destino verificado e permitir recuperação sem perder compras ou reabrir dados privados.

## Entradas e resultado

Entradas: SHA validado, ambientes, decisões de migração e runbooks. Resultado: release candidate em ambiente controlado e plano de ativação/rollback.

## Escopo e comportamento

- Separar sandbox/staging/produção e validar credenciais do provedor, eventos e vendedor convidado.
- Planejar functions/índices, regras/Storage e Hosting na ordem vigente, aguardando índices prontos.
- Executar migração idempotente em dados de teste, medir tempo e preparar backup/restauração.
- Definir fallback seguro: suspender novas vendas sem invalidar contabilidade nem servir conteúdo pago anonimamente.

## Passos de execução

- [ ] Preparar manifesto de versões/destino e migrações.
- [ ] Ensaiar release em ambiente de teste com livro legado e aventura.
- [ ] Executar exercício de indisponibilidade de provedor/Storage e recuperação.
- [ ] Apresentar evidências concretas para autorização separada de produção antes do piloto real.

## Critérios de aceite

- [ ] Ambiente de teste não chama serviço financeiro de produção.
- [ ] Índices/regras/backend/cliente pertencem ao candidato compatível.
- [ ] Rollback mantém razão e direitos consistentes e não restaura projeção revogada.
- [ ] Guia permite retomar migração/reprocessamento sem duplicação.

## Validação

- Dry-run/ensaio, integridade por hash e smoke das rotas.
- Verificação de regras/deployment, webhook de staging e recuperação de backup.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Rollback de interface não reverte cobrança externa; ações financeiras precisam de conciliação.
- Segredos ficam fora do repositório; autorização de planejamento não é implantação.

## Não escopo

Implantar ou cobrar sem autorização, migrar dados reais neste planejamento e reverter versão de privacidade.
